import { utf8ToBytes, bytesToUtf8, b64encode, b64decode, concatBytes, timingSafeEqual } from "../util/bytes";

/**
 * Low-level crypto primitives, injected by the host so the shared core stays
 * platform-agnostic. Node tests inject a WebCrypto-backed provider; the RN apps
 * inject a native-backed one (WebCrypto polyfill / react-native-quick-crypto /
 * expo-crypto). Nothing here imports a platform module directly.
 */
export interface CryptoProvider {
  randomBytes(len: number): Uint8Array;
  hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array>;
  hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array>;
  aesGcmSeal(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array>;
  aesGcmOpen(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array>;
}

/** AES-GCM ciphertext carried on the wire (both values base64). */
export interface SealedPayload {
  iv: string;
  ct: string;
}

/**
 * A symmetric session: AES-GCM seal/open over a 256-bit key derived from a
 * shared secret. Used both for the BLE session and for at-rest relay ciphertext.
 */
export class SessionCrypto {
  constructor(
    private readonly provider: CryptoProvider,
    private readonly key: Uint8Array,
  ) {}

  /** Derive a session from a raw shared secret via HKDF-SHA256. */
  static async deriveFromSecret(
    provider: CryptoProvider,
    secret: Uint8Array,
    info: string,
  ): Promise<SessionCrypto> {
    const key = await provider.hkdf(secret, new Uint8Array(0), utf8ToBytes(info), 32);
    return new SessionCrypto(provider, key);
  }

  async seal(plaintext: string, aad?: Uint8Array): Promise<SealedPayload> {
    const iv = this.provider.randomBytes(12);
    const ct = await this.provider.aesGcmSeal(this.key, iv, utf8ToBytes(plaintext), aad);
    return { iv: b64encode(iv), ct: b64encode(ct) };
  }

  async open(sealed: SealedPayload, aad?: Uint8Array): Promise<string> {
    const pt = await this.provider.aesGcmOpen(this.key, b64decode(sealed.iv), b64decode(sealed.ct), aad);
    return bytesToUtf8(pt);
  }

  async sealJson(obj: unknown, aad?: Uint8Array): Promise<SealedPayload> {
    return this.seal(JSON.stringify(obj), aad);
  }

  async openJson<T>(sealed: SealedPayload, aad?: Uint8Array): Promise<T> {
    return JSON.parse(await this.open(sealed, aad)) as T;
  }
}

/**
 * BLE handshake (Just-Works is not confidential, so we authenticate at the app
 * layer). Hub sends a random nonce; the companion returns
 * HMAC(bleSecret, nonce || deviceId). Both then derive the same session key.
 */
export async function handshakeResponse(
  provider: CryptoProvider,
  bleSecret: Uint8Array,
  nonce: Uint8Array,
  deviceId: string,
): Promise<Uint8Array> {
  return provider.hmacSha256(bleSecret, concatBytes(nonce, utf8ToBytes(deviceId)));
}

export async function verifyHandshake(
  provider: CryptoProvider,
  bleSecret: Uint8Array,
  nonce: Uint8Array,
  deviceId: string,
  response: Uint8Array,
): Promise<boolean> {
  const expected = await handshakeResponse(provider, bleSecret, nonce, deviceId);
  return timingSafeEqual(expected, response);
}

/** Derive the shared BLE session key both sides use after a successful handshake. */
export async function deriveBleSessionKey(
  provider: CryptoProvider,
  bleSecret: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  return provider.hkdf(bleSecret, nonce, utf8ToBytes("familyhub-ble-session"), 32);
}

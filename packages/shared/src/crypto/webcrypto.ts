import type { CryptoProvider } from "./session";

/**
 * WebCrypto-backed {@link CryptoProvider}. Works in Node (tests) and anywhere a
 * SubtleCrypto is available. In React Native, pass a polyfilled crypto object
 * (e.g. from react-native-quick-crypto or a WebCrypto polyfill) to the ctor.
 */
export class WebCryptoProvider implements CryptoProvider {
  private readonly webcrypto: any;
  private readonly subtle: any;

  constructor(cryptoObj: any = (globalThis as any).crypto) {
    if (!cryptoObj || !cryptoObj.subtle) {
      throw new Error(
        "WebCryptoProvider: no SubtleCrypto available. Pass a crypto implementation to the constructor.",
      );
    }
    this.webcrypto = cryptoObj;
    this.subtle = cryptoObj.subtle;
  }

  randomBytes(len: number): Uint8Array {
    const out = new Uint8Array(len);
    this.webcrypto.getRandomValues(out);
    return out;
  }

  async hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
    const key = await this.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
    const bits = await this.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8);
    return new Uint8Array(bits);
  }

  async hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const k = await this.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await this.subtle.sign("HMAC", k, data);
    return new Uint8Array(sig);
  }

  async aesGcmSeal(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    const k = await this.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
    const params: any = { name: "AES-GCM", iv };
    if (aad) params.additionalData = aad;
    const ct = await this.subtle.encrypt(params, k, plaintext);
    return new Uint8Array(ct);
  }

  async aesGcmOpen(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    const k = await this.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
    const params: any = { name: "AES-GCM", iv };
    if (aad) params.additionalData = aad;
    const pt = await this.subtle.decrypt(params, k, ciphertext);
    return new Uint8Array(pt);
  }
}

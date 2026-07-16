import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { gcm } from "@noble/ciphers/aes.js";
import * as ExpoCrypto from "expo-crypto";
import type { CryptoProvider } from "@familyhub/shared";

/**
 * Pure-JS CryptoProvider for the companion (React Native / Hermes). Same
 * implementation as the hub — verified byte-for-byte compatible with WebCrypto,
 * so companion ⇄ hub seal/open interoperate.
 */
export class NobleCryptoProvider implements CryptoProvider {
  constructor(private readonly randomSource: (len: number) => Uint8Array = (len) => ExpoCrypto.getRandomBytes(len)) {}

  randomBytes(len: number): Uint8Array {
    return this.randomSource(len);
  }
  async hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
    return hkdf(sha256, secret, salt, info, len);
  }
  async hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    return hmac(sha256, key, data);
  }
  async aesGcmSeal(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    return (aad ? gcm(key, iv, aad) : gcm(key, iv)).encrypt(plaintext);
  }
  async aesGcmOpen(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    return (aad ? gcm(key, iv, aad) : gcm(key, iv)).decrypt(ciphertext);
  }
}

let instance: NobleCryptoProvider | null = null;
export function getCryptoProvider(): NobleCryptoProvider {
  if (!instance) instance = new NobleCryptoProvider();
  return instance;
}

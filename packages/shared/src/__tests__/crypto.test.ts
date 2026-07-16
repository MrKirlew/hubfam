import {
  WebCryptoProvider,
  SessionCrypto,
  handshakeResponse,
  verifyHandshake,
  deriveBleSessionKey,
  utf8ToBytes,
} from "../index";

const provider = new WebCryptoProvider(); // uses global WebCrypto (Node 20+)

describe("SessionCrypto (AES-GCM over HKDF)", () => {
  it("round-trips a string", async () => {
    const s = await SessionCrypto.deriveFromSecret(provider, utf8ToBytes("household-secret"), "familyhub-relay");
    const sealed = await s.seal("hello family 🏠");
    expect(sealed.iv).toBeTruthy();
    expect(sealed.ct).toBeTruthy();
    expect(await s.open(sealed)).toBe("hello family 🏠");
  });

  it("round-trips JSON", async () => {
    const s = await SessionCrypto.deriveFromSecret(provider, utf8ToBytes("secret"), "info");
    const obj = { body: "buy milk", to: "all", n: 42 };
    const sealed = await s.sealJson(obj);
    expect(await s.openJson(sealed)).toEqual(obj);
  });

  it("fails to open with a different key", async () => {
    const a = await SessionCrypto.deriveFromSecret(provider, utf8ToBytes("secret-A"), "info");
    const b = await SessionCrypto.deriveFromSecret(provider, utf8ToBytes("secret-B"), "info");
    const sealed = await a.seal("top secret");
    await expect(b.open(sealed)).rejects.toBeDefined();
  });

  it("two sessions from the same secret+info interoperate", async () => {
    const secret = utf8ToBytes("shared");
    const a = await SessionCrypto.deriveFromSecret(provider, secret, "info");
    const b = await SessionCrypto.deriveFromSecret(provider, secret, "info");
    const sealed = await a.seal("cross-open");
    expect(await b.open(sealed)).toBe("cross-open");
  });
});

describe("BLE handshake", () => {
  it("verifies a correct challenge response", async () => {
    const bleSecret = provider.randomBytes(32);
    const nonce = provider.randomBytes(16);
    const resp = await handshakeResponse(provider, bleSecret, nonce, "device-123");
    expect(await verifyHandshake(provider, bleSecret, nonce, "device-123", resp)).toBe(true);
  });

  it("rejects a wrong device id or nonce", async () => {
    const bleSecret = provider.randomBytes(32);
    const nonce = provider.randomBytes(16);
    const resp = await handshakeResponse(provider, bleSecret, nonce, "device-123");
    expect(await verifyHandshake(provider, bleSecret, nonce, "device-999", resp)).toBe(false);
    const otherNonce = provider.randomBytes(16);
    expect(await verifyHandshake(provider, bleSecret, otherNonce, "device-123", resp)).toBe(false);
  });

  it("derives a matching session key on both sides", async () => {
    const bleSecret = provider.randomBytes(32);
    const nonce = provider.randomBytes(16);
    const k1 = await deriveBleSessionKey(provider, bleSecret, nonce);
    const k2 = await deriveBleSessionKey(provider, bleSecret, nonce);
    expect(Array.from(k1)).toEqual(Array.from(k2));
    expect(k1.length).toBe(32);
  });
});

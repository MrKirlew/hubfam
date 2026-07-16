/**
 * RFC-4122 v4 identifiers used as idempotency keys (envelope.id, opId, etc.).
 * Prefers the platform's crypto UUID / CSPRNG when present; falls back to
 * Math.random only when no crypto is available (still fine for idempotency keys,
 * which are not secrets).
 */
export function newId(): string {
  const g = globalThis as any;
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

/** Short numeric pairing code (e.g. "042 917") for out-of-band confirmation. */
export function newPairingCode(): string {
  const g = globalThis as any;
  const bytes = new Uint8Array(4);
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const n = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1_000_000;
  return n.toString().padStart(6, "0");
}

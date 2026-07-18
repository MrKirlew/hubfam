/**
 * Crockford base32 (RFC 4648-ish, human-friendly alphabet). Used for the manual
 * pairing claim code: no I/L/O/U so it's hard to mistype, case-insensitive on
 * decode, and dependency-free so it runs under Node, Hermes, and Workers.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U

const DECODE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) DECODE[ALPHABET[i]] = i;
// Lenient aliases for common misreads when a human types the code.
DECODE["I"] = 1;
DECODE["L"] = 1;
DECODE["O"] = 0;

export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let val = 0;
  for (let i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(val >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += ALPHABET[(val << (5 - bits)) & 0x1f];
  return out;
}

/** Decode a base32 string; unknown characters (dashes, spaces) are skipped. */
export function base32Decode(str: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let val = 0;
  for (const raw of str.toUpperCase()) {
    const idx = DECODE[raw];
    if (idx === undefined) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((val >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

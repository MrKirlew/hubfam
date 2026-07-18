/**
 * Manual pairing claim code (camera-free fallback that keeps the relay
 * zero-knowledge).
 *
 * A short QR can't be typed, and the QR carries the derived household keys —
 * which the relay must never see. So instead the hub:
 *   1. seals the full pairing payload under an ephemeral AES key,
 *   2. uploads only that ciphertext to a global claim store on the relay,
 *   3. shows a short human code = base32(secret).
 * The companion types the code, derives the relay lookup id + the AES key from
 * the same secret, fetches the ciphertext, and decrypts locally. The relay only
 * ever stores opaque ciphertext keyed by an id that reveals nothing about the
 * AES key, so it stays zero-knowledge.
 *
 * `secret` is 80 bits: enough that offline brute-force of the retrieved blob is
 * impractical, while the code stays typeable (16 base32 chars, grouped as
 * XXXX-XXXX-XXXX-XXXX). The blob is short-lived (relay TTL) and only reachable
 * with the derived id, so the code must first be intercepted at all.
 */
import type { CryptoProvider, SealedPayload } from "../crypto/session";
import { SessionCrypto } from "../crypto/session";
import { utf8ToBytes } from "../util/bytes";
import { base32Encode, base32Decode } from "../util/base32";
import { RelayClient } from "../net/RelayClient";
import type { FetchLike, RetryOptions } from "../net/http";
import { decodePairingQR, type PairingPayload } from "./qr";
import { startPairing, type PairingInvite } from "./pairing";

const EMPTY = new Uint8Array(0);

/** Entropy of the manual code (80 bits → 16 base32 chars). */
export const CLAIM_SECRET_BYTES = 10;

/** Group the raw base32 into dashed 4-char blocks for readability. */
export function formatClaimCode(raw: string): string {
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

/** Strip formatting/typos so a user-typed code decodes cleanly (case-insensitive). */
export function normalizeClaimCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Derive the relay lookup id + the AES key from the code's secret. */
async function deriveClaim(
  provider: CryptoProvider,
  secret: Uint8Array,
): Promise<{ claimId: string; session: SessionCrypto }> {
  const idBytes = await provider.hkdf(secret, EMPTY, utf8ToBytes("familyhub-claim-id"), 8);
  const wrapKey = await provider.hkdf(secret, EMPTY, utf8ToBytes("familyhub-claim-wrap"), 32);
  return { claimId: base32Encode(idBytes), session: new SessionCrypto(provider, wrapKey) };
}

/** Hub: seal the pairing payload and produce { code, claimId, ciphertext } for upload. */
export async function createClaimBlob(
  provider: CryptoProvider,
  payload: PairingPayload,
): Promise<{ code: string; claimId: string; ciphertext: string }> {
  const secret = provider.randomBytes(CLAIM_SECRET_BYTES);
  const { claimId, session } = await deriveClaim(provider, secret);
  const sealed = await session.sealJson(payload);
  return { code: formatClaimCode(base32Encode(secret)), claimId, ciphertext: JSON.stringify(sealed) };
}

/** Companion: the relay lookup id for a typed code (no decryption). */
export async function claimLookupId(provider: CryptoProvider, code: string): Promise<string> {
  const secret = base32Decode(normalizeClaimCode(code));
  return (await deriveClaim(provider, secret)).claimId;
}

/** Companion: decrypt a fetched claim blob back into the pairing payload. */
export async function openClaimBlob(
  provider: CryptoProvider,
  code: string,
  ciphertext: string,
): Promise<PairingPayload> {
  const secret = base32Decode(normalizeClaimCode(code));
  const { session } = await deriveClaim(provider, secret);
  const sealed = JSON.parse(ciphertext) as SealedPayload;
  return decodePairingQR(await session.open(sealed));
}

/** Hub: mint the QR invite AND upload a claim blob, returning the invite with `claimCode`. */
export async function createPairingInviteWithClaim(
  relay: RelayClient,
  provider: CryptoProvider,
  ctx: {
    householdId: string;
    relayUrl: string;
    wsUrl: string;
    serviceUuid: string;
    contentKey: Uint8Array;
    bleSecret: Uint8Array;
  },
): Promise<PairingInvite> {
  const invite = await startPairing(relay, ctx);
  try {
    const { code: claimCode, claimId, ciphertext } = await createClaimBlob(provider, invite.payload);
    await relay.putPairingBlob(claimId, ciphertext);
    return { qr: invite.qr, code: invite.code, claimCode, expiresAt: invite.expiresAt };
  } catch {
    // Blob upload failed — QR + paste still work, so degrade gracefully.
    return { qr: invite.qr, code: invite.code, expiresAt: invite.expiresAt };
  }
}

/** Companion: fetch + decrypt a claim blob for a typed code, returning the pairing payload. */
export async function fetchAndOpenClaim(
  fetchFn: FetchLike,
  relayUrl: string,
  provider: CryptoProvider,
  code: string,
  retry?: RetryOptions,
): Promise<PairingPayload> {
  const claimId = await claimLookupId(provider, code);
  const relay = new RelayClient({ baseUrl: relayUrl, fetchFn, retry });
  const { ciphertext } = await relay.getPairingBlob(claimId);
  return openClaimBlob(provider, code, ciphertext);
}

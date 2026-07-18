import type { CryptoProvider } from "../crypto/session";
import { b64encode, b64decode, utf8ToBytes } from "../util/bytes";
import { RelayClient } from "../net/RelayClient";
import type { FetchLike, RetryOptions } from "../net/http";
import { encodePairingQR, decodePairingQR, PAIRING_QR_VERSION, type PairingPayload } from "./qr";

const EMPTY = new Uint8Array(0);

export interface HouseholdKeys {
  contentKey: Uint8Array;
  bleSecret: Uint8Array;
}

/** Derive the content + BLE keys from the root household secret (hub only). */
export async function deriveHouseholdKeys(
  provider: CryptoProvider,
  householdSecret: Uint8Array,
): Promise<HouseholdKeys> {
  const contentKey = await provider.hkdf(householdSecret, EMPTY, utf8ToBytes("familyhub-content"), 32);
  const bleSecret = await provider.hkdf(householdSecret, EMPTY, utf8ToBytes("familyhub-ble"), 32);
  return { contentKey, bleSecret };
}

export interface HubHousehold {
  householdId: string;
  deviceId: string;
  deviceToken: string;
  /** Root secret — persist in secure-store on the HUB only; never sent anywhere. */
  householdSecret: Uint8Array;
  contentKey: Uint8Array;
  bleSecret: Uint8Array;
}

/** Hub: create the household on the relay and derive the household keys locally. */
export async function createHubHousehold(
  relay: RelayClient,
  provider: CryptoProvider,
  opts: { name?: string; hubName?: string; platform?: string } = {},
): Promise<HubHousehold> {
  const householdSecret = provider.randomBytes(32);
  const { householdId, deviceId, deviceToken } = await relay.createHousehold(opts);
  const { contentKey, bleSecret } = await deriveHouseholdKeys(provider, householdSecret);
  return { householdId, deviceId, deviceToken, householdSecret, contentKey, bleSecret };
}

export interface PairingInvite {
  qr: string;
  code: string;
  /** Optional short manual code (camera-free fallback); present when a claim blob was uploaded. */
  claimCode?: string;
  expiresAt: number;
}

/**
 * Hub: mint a single-use pairing token and build the QR the companion scans.
 * `relay` must be authed as the hub (relay.withToken(hub deviceToken)).
 * Returns the built `payload` too so callers can also seal it into a claim blob
 * (see createPairingInviteWithClaim) using the SAME single-use token.
 */
export async function startPairing(
  relay: RelayClient,
  ctx: {
    householdId: string;
    relayUrl: string;
    wsUrl: string;
    serviceUuid: string;
    contentKey: Uint8Array;
    bleSecret: Uint8Array;
  },
): Promise<PairingInvite & { payload: PairingPayload }> {
  const { pairingToken, code, expiresAt } = await relay.pairStart(ctx.householdId);
  const payload: PairingPayload = {
    v: PAIRING_QR_VERSION,
    householdId: ctx.householdId,
    relayUrl: ctx.relayUrl,
    wsUrl: ctx.wsUrl,
    serviceUuid: ctx.serviceUuid,
    pairingToken,
    contentKey: b64encode(ctx.contentKey),
    bleSecret: b64encode(ctx.bleSecret),
  };
  return { qr: encodePairingQR(payload), code, expiresAt, payload };
}

export interface CompanionIdentity {
  householdId: string;
  deviceId: string;
  deviceToken: string;
  contentKey: Uint8Array;
  bleSecret: Uint8Array;
  relayUrl: string;
  wsUrl: string;
  serviceUuid: string;
}

/**
 * Companion: decode the scanned QR, redeem the pairing token at the QR's relay,
 * and return the device identity + household keys to persist in secure-store.
 */
export async function redeemPairing(
  fetchFn: FetchLike,
  qr: string,
  opts: { name?: string; platform?: string; pubKey?: string; retry?: RetryOptions } = {},
): Promise<CompanionIdentity> {
  const p = decodePairingQR(qr);
  const relay = new RelayClient({ baseUrl: p.relayUrl, fetchFn, retry: opts.retry });
  const { deviceId, deviceToken } = await relay.pairRedeem(p.householdId, {
    pairingToken: p.pairingToken,
    name: opts.name,
    platform: opts.platform,
    pubKey: opts.pubKey,
  });
  return {
    householdId: p.householdId,
    deviceId,
    deviceToken,
    contentKey: b64decode(p.contentKey),
    bleSecret: b64decode(p.bleSecret),
    relayUrl: p.relayUrl,
    wsUrl: p.wsUrl,
    serviceUuid: p.serviceUuid,
  };
}

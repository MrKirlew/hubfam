/**
 * PairingService — hub-side pairing orchestration. Creates the household on the
 * relay, derives + persists the household keys (secure-store), and mints QR
 * invites for companion phones. Secrets live ONLY in secure-store; the store
 * holds non-secret identity (household id/name, paired device list).
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  RelayClient,
  createHubHousehold,
  createPairingInviteWithClaim,
  b64encode,
  b64decode,
  type PairingInvite,
} from "@familyhub/shared";
import { useAppStore } from "../store/appStore";
import { getCryptoProvider } from "./crypto";
import { stopHubTransport, CURSOR_KEY_PREFIX } from "./HubTransportService";

const RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL ?? "";
// Fixed 128-bit FamilyHub BLE service UUID (companions filter advertisements on this).
const SERVICE_UUID = "0000fae1-0000-1000-8000-00805f9b34fb";

export const K_DEVICE_TOKEN = "familyhub_device_token";
export const K_HOUSEHOLD_SECRET = "familyhub_household_secret";
export const K_CONTENT_KEY = "familyhub_content_key";
export const K_BLE_SECRET = "familyhub_ble_secret";

export function isRelayConfigured(): boolean {
  return !!RELAY_URL;
}

export async function isSharingSetUp(): Promise<boolean> {
  return !!(useAppStore.getState().household && (await SecureStore.getItemAsync(K_DEVICE_TOKEN)));
}

/** Create the household on the relay, derive keys, persist identity + secrets. */
export async function setupSharing(hubName: string): Promise<void> {
  if (!RELAY_URL) throw new Error("Relay URL not configured (EXPO_PUBLIC_RELAY_URL).");
  const provider = getCryptoProvider();
  const relay = new RelayClient({ baseUrl: RELAY_URL, fetchFn: fetch as any });
  const hub = await createHubHousehold(relay, provider, { name: hubName, hubName, platform: "android" });

  await SecureStore.setItemAsync(K_DEVICE_TOKEN, hub.deviceToken);
  await SecureStore.setItemAsync(K_HOUSEHOLD_SECRET, b64encode(hub.householdSecret));
  await SecureStore.setItemAsync(K_CONTENT_KEY, b64encode(hub.contentKey));
  await SecureStore.setItemAsync(K_BLE_SECRET, b64encode(hub.bleSecret));

  const store = useAppStore.getState();
  store.setHousehold({ id: hub.householdId, name: hubName, createdAt: Date.now() });
  store.addPairedDevice({ id: hub.deviceId, name: hubName, platform: "android", role: "hub", createdAt: Date.now() });
}

/** Mint a single-use pairing invite (QR + numeric code) for a companion phone. */
export async function createPairingInvite(): Promise<PairingInvite> {
  if (!RELAY_URL) throw new Error("Relay URL not configured.");
  const household = useAppStore.getState().household;
  const [deviceToken, contentKeyB64, bleSecretB64] = await Promise.all([
    SecureStore.getItemAsync(K_DEVICE_TOKEN),
    SecureStore.getItemAsync(K_CONTENT_KEY),
    SecureStore.getItemAsync(K_BLE_SECRET),
  ]);
  if (!household || !deviceToken || !contentKeyB64 || !bleSecretB64) throw new Error("Set up sharing first.");

  const relay = new RelayClient({ baseUrl: RELAY_URL, fetchFn: fetch as any, deviceToken });
  return createPairingInviteWithClaim(relay, getCryptoProvider(), {
    householdId: household.id,
    relayUrl: RELAY_URL,
    wsUrl: `${RELAY_URL.replace(/^http/, "ws")}/household/${household.id}/ws`,
    serviceUuid: SERVICE_UUID,
    contentKey: b64decode(contentKeyB64),
    bleSecret: b64decode(bleSecretB64),
  });
}

/** Revoke a paired companion (relay closes its socket + invalidates its token). */
export async function revokeDevice(deviceId: string): Promise<void> {
  const household = useAppStore.getState().household;
  const deviceToken = await SecureStore.getItemAsync(K_DEVICE_TOKEN);
  if (!household || !deviceToken || !RELAY_URL) return;
  const relay = new RelayClient({ baseUrl: RELAY_URL, fetchFn: fetch as any, deviceToken });
  await relay.revokeDevice(household.id, deviceId);
  useAppStore.getState().revokePairedDevice(deviceId);
}

/** Tear down sharing on this hub (disconnect, wipe secrets + household state) so it can be set up fresh — e.g. after moving to a new relay. */
export async function resetSharing(): Promise<void> {
  await stopHubTransport();
  await Promise.all([
    SecureStore.deleteItemAsync(K_DEVICE_TOKEN),
    SecureStore.deleteItemAsync(K_HOUSEHOLD_SECRET),
    SecureStore.deleteItemAsync(K_CONTENT_KEY),
    SecureStore.deleteItemAsync(K_BLE_SECRET),
  ]);
  // Drop per-household sync cursors and the persisted outbox: queued envelopes
  // were sealed with the keys just wiped, so they can never be delivered.
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((k) => k.startsWith(CURSOR_KEY_PREFIX) || k === "familyhub_outbox");
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch {
    /* non-fatal — namespaced cursors make leftovers harmless */
  }
  useAppStore.getState().clearSharing();
}

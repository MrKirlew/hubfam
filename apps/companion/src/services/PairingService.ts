import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { redeemPairing, b64encode, encodePairingQR, fetchAndOpenClaim, type CompanionIdentity } from "@familyhub/shared";
import { useCompanionStore } from "../store/companionStore";
import { getCryptoProvider } from "./crypto";
import { DEFAULT_RELAY_URL } from "../config";

export const K_DEVICE_TOKEN = "familyhub_device_token";
export const K_CONTENT_KEY = "familyhub_content_key";
export const K_BLE_SECRET = "familyhub_ble_secret";
export const K_RELAY_URL = "familyhub_relay_url";
export const K_WS_URL = "familyhub_ws_url";
export const K_SERVICE_UUID = "familyhub_service_uuid";

/** Decode a scanned pairing QR, redeem it at the hub's relay, and persist identity + keys. */
export async function pairFromQR(qr: string, memberName: string): Promise<void> {
  const id: CompanionIdentity = await redeemPairing(fetch as any, qr, {
    name: memberName,
    platform: Platform.OS === "ios" ? "ios" : "android",
  });
  await SecureStore.setItemAsync(K_DEVICE_TOKEN, id.deviceToken);
  await SecureStore.setItemAsync(K_CONTENT_KEY, b64encode(id.contentKey));
  await SecureStore.setItemAsync(K_BLE_SECRET, b64encode(id.bleSecret));
  await SecureStore.setItemAsync(K_RELAY_URL, id.relayUrl);
  await SecureStore.setItemAsync(K_WS_URL, id.wsUrl);
  await SecureStore.setItemAsync(K_SERVICE_UUID, id.serviceUuid);
  useCompanionStore.getState().setPaired({ householdId: id.householdId, deviceId: id.deviceId });
}

/**
 * Camera-free pairing: fetch + decrypt the claim blob for a typed code, then
 * redeem it exactly like a scanned QR. The relay URL is baked in (DEFAULT_RELAY_URL)
 * because a short code can't carry it; everything else comes from the blob.
 */
export async function pairFromCode(code: string, memberName: string): Promise<void> {
  const payload = await fetchAndOpenClaim(fetch as any, DEFAULT_RELAY_URL, getCryptoProvider(), code);
  await pairFromQR(encodePairingQR(payload), memberName);
}

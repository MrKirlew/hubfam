/**
 * Hub-side BleLink (WS4): a GATT *peripheral* backed by the native
 * expo-ble-peripheral module. The hub advertises the household service and
 * exchanges MTU-sized transport frames with the companion central. Framing +
 * sealing are done by the shared BleTransport; this is a byte pipe.
 */
import { Platform, PermissionsAndroid } from "react-native";
import { b64encode, b64decode, type BleLink } from "@familyhub/shared";
import {
  startPeripheral,
  stopPeripheral,
  isCentralConnected,
  sendFrameBase64,
  addFrameListener,
  addConnectionListener,
} from "../../modules/ble-peripheral";
import { BLE_SERVICE_UUID, BLE_FRAME_WRITE_UUID, BLE_FRAME_NOTIFY_UUID } from "@familyhub/shared";

async function ensurePeripheralPermissions(): Promise<void> {
  if (Platform.OS !== "android" || typeof Platform.Version !== "number" || Platform.Version < 31) return;
  const res = await PermissionsAndroid.requestMultiple([
    "android.permission.BLUETOOTH_ADVERTISE" as any,
    "android.permission.BLUETOOTH_CONNECT" as any,
  ]);
  const denied = Object.values(res).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied) throw new Error("Bluetooth permission denied");
}

export function createHubBleLink(): BleLink {
  return {
    async start() {
      await ensurePeripheralPermissions();
      await startPeripheral(BLE_SERVICE_UUID, BLE_FRAME_WRITE_UUID, BLE_FRAME_NOTIFY_UUID);
    },
    async stop() {
      await stopPeripheral();
    },
    isConnected() {
      try {
        return isCentralConnected();
      } catch {
        return false;
      }
    },
    async sendFrame(frame: Uint8Array) {
      await sendFrameBase64(b64encode(frame));
    },
    onFrame(cb: (frame: Uint8Array) => void) {
      const sub = addFrameListener((b64) => cb(b64decode(b64)));
      return () => sub.remove();
    },
    onConnectionChange(cb: (connected: boolean) => void) {
      const sub = addConnectionListener(cb);
      return () => sub.remove();
    },
  };
}

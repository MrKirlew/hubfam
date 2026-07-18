import BlePeripheralModule from "./src/BlePeripheralModule";

/**
 * Android-only GATT peripheral for the FamilyHub BLE lane (WS4). The hub
 * advertises the household service UUID and exchanges MTU-sized transport frames
 * (base64) with the connected companion central. Frames are already sealed +
 * chunked by the shared BleTransport, so this module is a dumb byte pipe.
 */

export interface FrameEvent {
  data: string; // base64
}
export interface ConnectionEvent {
  connected: boolean;
}

/** Start advertising + the GATT server. Rejects if BLE is off or unsupported. */
export function startPeripheral(serviceUuid: string, writeUuid: string, notifyUuid: string): Promise<void> {
  return BlePeripheralModule.start(serviceUuid, writeUuid, notifyUuid);
}

/** Stop advertising + tear down the GATT server. */
export function stopPeripheral(): Promise<void> {
  return BlePeripheralModule.stop();
}

/** Whether a central (companion) is currently connected. */
export function isCentralConnected(): boolean {
  return BlePeripheralModule.isConnected();
}

/** Notify one frame (base64) to the connected central. */
export function sendFrameBase64(base64: string): Promise<void> {
  return BlePeripheralModule.sendFrame(base64);
}

export function addFrameListener(cb: (base64: string) => void): { remove: () => void } {
  const sub = BlePeripheralModule.addListener("onFrame", (e: FrameEvent) => cb(e.data));
  return { remove: () => sub.remove() };
}

export function addConnectionListener(cb: (connected: boolean) => void): { remove: () => void } {
  const sub = BlePeripheralModule.addListener("onConnectionChange", (e: ConnectionEvent) => cb(e.connected));
  return { remove: () => sub.remove() };
}

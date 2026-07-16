/**
 * The raw BLE plumbing, injected into BleTransport. Implementations are native/
 * app code (WS4): the companion is a GATT central (react-native-ble-plx), the hub
 * is a GATT peripheral (custom native module). BleTransport layers framing +
 * session crypto on top and stays platform-agnostic.
 */
export interface BleLink {
  /** Begin advertising (peripheral) or scanning+connecting (central). */
  start(): Promise<void>;
  stop(): Promise<void>;
  isConnected(): boolean;
  /** Write one framed chunk (already sized for the negotiated MTU by BleTransport). */
  sendFrame(frame: Uint8Array): Promise<void>;
  onFrame(cb: (frame: Uint8Array) => void): () => void;
  onConnectionChange(cb: (connected: boolean) => void): () => void;
}

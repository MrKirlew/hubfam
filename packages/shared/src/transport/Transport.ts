import type { Envelope } from "../models/envelope";

export type ConnState = "connected" | "connecting" | "disconnected";

/**
 * A single lane (cloud WS/REST, or BLE). The router treats all lanes uniformly.
 * Implementations live in the apps: CloudTransport (WebSocket + REST) and
 * BleTransport (ble-plx central on companion / native peripheral on hub).
 */
export interface Transport {
  readonly name: "cloud" | "ble";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getState(): ConnState;
  send(env: Envelope): Promise<void>;
  /** Subscribe to inbound envelopes. Returns an unsubscribe fn. */
  onReceive(cb: (env: Envelope) => void): () => void;
  /** Subscribe to connection-state changes. Returns an unsubscribe fn. */
  onStateChange(cb: (s: ConnState) => void): () => void;
}

import type { Envelope } from "../models/envelope";
import type { ConnState, Transport } from "./Transport";
import type { BleLink } from "./BleLink";
import { parseEnvelope } from "../schemas/validate";
import { encodeFrames, FrameReassembler } from "./framing";
import { utf8ToBytes, bytesToUtf8 } from "../util/bytes";
import type { SessionCrypto } from "../crypto/session";

export interface BleTransportOptions {
  link: BleLink;
  /** When set, envelope payloads are AES-GCM sealed on the wire. */
  session?: SessionCrypto;
  /** Usable bytes per BLE write after headers; default 180 (conservative). */
  maxFrameBytes?: number;
}

/**
 * BLE lane: envelope → (optional seal) → MTU-sized frames over a {@link BleLink};
 * inbound frames → reassemble → (optional open) → validate → emit. Role-agnostic
 * (same code on hub peripheral and companion central).
 */
export class BleTransport implements Transport {
  readonly name = "ble" as const;
  private state: ConnState;
  private readonly reassembler = new FrameReassembler();
  private readonly receiveCbs = new Set<(e: Envelope) => void>();
  private readonly stateCbs = new Set<(s: ConnState) => void>();
  private readonly unsub: (() => void)[] = [];
  private msgCounter = 0;

  constructor(private readonly opts: BleTransportOptions) {
    this.state = opts.link.isConnected() ? "connected" : "disconnected";
    this.unsub.push(opts.link.onFrame((f) => void this.handleFrame(f)));
    this.unsub.push(
      opts.link.onConnectionChange((connected) => {
        this.reassembler.reset();
        this.setState(connected ? "connected" : "disconnected");
      }),
    );
  }

  getState(): ConnState {
    return this.state;
  }

  private setState(s: ConnState): void {
    if (this.state === s) return;
    this.state = s;
    for (const cb of this.stateCbs) cb(s);
  }

  async connect(): Promise<void> {
    await this.opts.link.start();
    if (this.opts.link.isConnected()) this.setState("connected");
  }

  async disconnect(): Promise<void> {
    await this.opts.link.stop();
    this.setState("disconnected");
  }

  private async serialize(env: Envelope): Promise<Uint8Array> {
    if (this.opts.session) {
      const sealed = await this.opts.session.sealJson(env);
      return utf8ToBytes(JSON.stringify({ s: 1, iv: sealed.iv, ct: sealed.ct }));
    }
    return utf8ToBytes(JSON.stringify(env));
  }

  private async deserialize(bytes: Uint8Array): Promise<Envelope> {
    const text = bytesToUtf8(bytes);
    if (this.opts.session) {
      const obj = JSON.parse(text);
      if (obj && obj.s === 1 && typeof obj.iv === "string" && typeof obj.ct === "string") {
        const plain = await this.opts.session.openJson<unknown>({ iv: obj.iv, ct: obj.ct });
        return parseEnvelope(plain as object);
      }
    }
    return parseEnvelope(text);
  }

  async send(env: Envelope): Promise<void> {
    if (!this.opts.link.isConnected()) throw new Error("ble transport not connected");
    const payload = await this.serialize(env);
    this.msgCounter = (this.msgCounter + 1) & 0xffff;
    const frames = encodeFrames(this.msgCounter, payload, this.opts.maxFrameBytes ?? 180);
    for (const f of frames) await this.opts.link.sendFrame(f);
  }

  private async handleFrame(frame: Uint8Array): Promise<void> {
    const complete = this.reassembler.push(frame);
    if (!complete) return;
    try {
      const env = await this.deserialize(complete);
      for (const cb of this.receiveCbs) cb(env);
    } catch {
      /* ignore malformed / undecryptable */
    }
  }

  onReceive(cb: (e: Envelope) => void): () => void {
    this.receiveCbs.add(cb);
    return () => this.receiveCbs.delete(cb);
  }

  onStateChange(cb: (s: ConnState) => void): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.unsub.length = 0;
  }
}

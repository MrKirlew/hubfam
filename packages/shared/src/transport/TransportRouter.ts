import type { Envelope } from "../models/envelope";
import type { ConnState, Transport } from "./Transport";
import type { Dedup } from "./dedup";
import type { Outbox } from "./outbox";

export type EffectiveLane = "ble" | "cloud" | "offline";
export type SendResult = "ble" | "cloud" | "queued";

export interface RouterState {
  ble: ConnState;
  cloud: ConnState;
  effective: EffectiveLane;
}

export interface TransportRouterOptions {
  ble?: Transport;
  cloud?: Transport;
  outbox: Outbox;
  dedup: Dedup;
}

/**
 * Single transport-agnostic send/receive surface for the app.
 *
 * Send policy: prefer BLE when connected (instant, offline, free), else cloud
 * (WiFi/cellular), else persist to the outbox. Receive policy: every lane funnels
 * through the shared dedup so a message arriving on both lanes fires once.
 * On any lane reconnecting, the outbox auto-flushes.
 */
export class TransportRouter {
  private readonly receiveCbs = new Set<(e: Envelope) => void>();
  private readonly stateCbs = new Set<(s: RouterState) => void>();
  private readonly unsubs: Array<() => void> = [];

  constructor(private readonly opts: TransportRouterOptions) {
    for (const t of this.transports()) {
      this.unsubs.push(t.onReceive((e) => this.handleReceive(e)));
      this.unsubs.push(
        t.onStateChange((s) => {
          this.emitState();
          if (s === "connected") void this.flushOutbox().catch(() => {});
        }),
      );
    }
  }

  private transports(): Transport[] {
    return [this.opts.ble, this.opts.cloud].filter(Boolean) as Transport[];
  }

  private handleReceive(env: Envelope): void {
    if (this.opts.dedup.seenBefore(env.id)) return;
    for (const cb of this.receiveCbs) cb(env);
  }

  private pickTransport(): Transport | null {
    if (this.opts.ble && this.opts.ble.getState() === "connected") return this.opts.ble;
    if (this.opts.cloud && this.opts.cloud.getState() === "connected") return this.opts.cloud;
    return null;
  }

  getState(): RouterState {
    const ble = this.opts.ble ? this.opts.ble.getState() : "disconnected";
    const cloud = this.opts.cloud ? this.opts.cloud.getState() : "disconnected";
    const effective: EffectiveLane =
      ble === "connected" ? "ble" : cloud === "connected" ? "cloud" : "offline";
    return { ble, cloud, effective };
  }

  /** Send now over the best lane, or queue for later. Never throws on delivery failure. */
  async send(env: Envelope): Promise<SendResult> {
    const t = this.pickTransport();
    if (t) {
      try {
        await t.send(env);
        return t.name;
      } catch {
        // fall through to queue
      }
    }
    await this.opts.outbox.enqueue(env);
    return "queued";
  }

  /** Drain the outbox over the currently-preferred lane. Returns items sent. */
  async flushOutbox(): Promise<number> {
    const t = this.pickTransport();
    if (!t) return 0;
    return this.opts.outbox.flush((env) => t.send(env));
  }

  subscribe(cb: (e: Envelope) => void): () => void {
    this.receiveCbs.add(cb);
    return () => this.receiveCbs.delete(cb);
  }

  onStateChange(cb: (s: RouterState) => void): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  private emitState(): void {
    const s = this.getState();
    for (const cb of this.stateCbs) cb(s);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.receiveCbs.clear();
    this.stateCbs.clear();
  }
}

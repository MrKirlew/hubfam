import type { Envelope } from "../models/envelope";
import type { ConnState, Transport } from "./Transport";
import { parseEnvelope } from "../schemas/validate";
import type { RelayClient } from "../net/RelayClient";

export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface CloudTransportOptions {
  householdId: string;
  deviceToken: string;
  /** Base WS URL for this household's DO; the deviceToken is appended as ?token=. */
  wsUrl: string;
  wsFactory: WebSocketFactory;
  /** Authed relay client, used to catch up missed state after (re)connect. */
  relay: RelayClient;
  getCursor: () => number;
  setCursor: (seq: number) => void;
  reconnect?: { baseMs: number; maxMs: number; maxAttempts?: number };
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Cloud lane: a WebSocket to the household Durable Object with a REST
 * catch-up (GET /state?since=cursor) on every (re)connect so nothing is missed
 * while offline. Reconnects with exponential backoff. The router dedups, so
 * catch-up overlapping with live WS delivery is harmless.
 */
export class CloudTransport implements Transport {
  readonly name = "cloud" as const;
  private ws: WebSocketLike | null = null;
  private state: ConnState = "disconnected";
  private readonly receiveCbs = new Set<(e: Envelope) => void>();
  private readonly stateCbs = new Set<(s: ConnState) => void>();
  private intentionalClose = false;
  private attempts = 0;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: CloudTransportOptions) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
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
    this.intentionalClose = false;
    this.open();
  }

  private open(): void {
    this.setState("connecting");
    const sep = this.opts.wsUrl.includes("?") ? "&" : "?";
    const url = `${this.opts.wsUrl}${sep}token=${encodeURIComponent(this.opts.deviceToken)}`;
    const ws = this.opts.wsFactory(url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setState("connected");
      void this.catchUp();
    };
    ws.onmessage = (ev) => this.ingest(ev.data);
    ws.onerror = () => {
      /* a close event follows */
    };
    ws.onclose = () => {
      this.ws = null;
      this.setState("disconnected");
      if (!this.intentionalClose) void this.scheduleReconnect();
    };
  }

  private ingest(data: unknown): void {
    try {
      const env = parseEnvelope(typeof data === "string" ? data : String(data));
      if (typeof env.seq === "number") this.opts.setCursor(Math.max(this.opts.getCursor(), env.seq));
      for (const cb of this.receiveCbs) cb(env);
    } catch {
      /* ignore malformed frames */
    }
  }

  private async catchUp(): Promise<void> {
    try {
      const state = await this.opts.relay.getState(this.opts.householdId, this.opts.getCursor());
      const all = [...state.messages, ...state.listOps].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      for (const env of all) {
        if (typeof env.seq === "number") this.opts.setCursor(Math.max(this.opts.getCursor(), env.seq));
        for (const cb of this.receiveCbs) cb(env);
      }
    } catch {
      /* best effort */
    }
  }

  private async scheduleReconnect(): Promise<void> {
    const cfg = this.opts.reconnect ?? { baseMs: 500, maxMs: 15000 };
    if (cfg.maxAttempts !== undefined && this.attempts >= cfg.maxAttempts) return;
    const delay = Math.min(cfg.maxMs, cfg.baseMs * 2 ** this.attempts);
    this.attempts++;
    await this.sleep(delay);
    if (!this.intentionalClose) this.open();
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.setState("disconnected");
  }

  async send(env: Envelope): Promise<void> {
    if (this.state !== "connected" || !this.ws) throw new Error("cloud transport not connected");
    this.ws.send(JSON.stringify(env));
  }

  onReceive(cb: (e: Envelope) => void): () => void {
    this.receiveCbs.add(cb);
    return () => this.receiveCbs.delete(cb);
  }

  onStateChange(cb: (s: ConnState) => void): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }
}

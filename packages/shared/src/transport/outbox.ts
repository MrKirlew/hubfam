import type { Envelope } from "../models/envelope";
import type { KeyValueStore } from "../util/kv";

export interface OutboxItem {
  id: string;
  env: Envelope;
  enqueuedAt: number;
  tries: number;
}

/**
 * Durable offline send queue. Mirrors the app's existing pending-mutation
 * pattern (appStore `pendingTaskMutations` + GoogleTasksService.flushPendingMutations):
 * a send that can't go out now is persisted and retried on reconnect.
 */
export class Outbox {
  private items: OutboxItem[] = [];
  private loaded = false;

  constructor(
    private readonly kv: KeyValueStore,
    private readonly key = "familyhub_outbox",
    private readonly max = 200,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async load(): Promise<void> {
    const raw = await this.kv.getItem(this.key);
    this.items = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    if (this.items.length > this.max) this.items = this.items.slice(-this.max);
    await this.kv.setItem(this.key, JSON.stringify(this.items));
  }

  async enqueue(env: Envelope): Promise<void> {
    if (!this.loaded) await this.load();
    if (this.items.some((i) => i.id === env.id)) return; // idempotent
    this.items.push({ id: env.id, env, enqueuedAt: this.now(), tries: 0 });
    await this.persist();
  }

  peekAll(): OutboxItem[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }

  async remove(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
  }

  private async markTry(id: string): Promise<void> {
    const it = this.items.find((i) => i.id === id);
    if (it) it.tries++;
    await this.persist();
  }

  /**
   * Attempt to send every queued item via `send`. Items that succeed are
   * removed; items that throw stay queued (try count incremented). Stops early
   * on the first failure so ordering is preserved on a flaky link.
   * Returns the number of items successfully sent.
   */
  async flush(send: (env: Envelope) => Promise<void>): Promise<number> {
    if (!this.loaded) await this.load();
    let sent = 0;
    for (const it of [...this.items]) {
      try {
        await send(it.env);
        await this.remove(it.id);
        sent++;
      } catch {
        await this.markTry(it.id);
        break;
      }
    }
    return sent;
  }
}

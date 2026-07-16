/**
 * Bounded LRU of seen envelope ids. Because a message can arrive on both the
 * BLE and cloud lanes, every receive path funnels through this so the app only
 * processes each envelope once. Optionally persisted via {@link snapshot}.
 */
export class Dedup {
  private seen = new Set<string>();
  private order: string[] = [];

  constructor(private readonly max = 1000) {}

  /** Records the id; returns true if it had already been seen. */
  seenBefore(id: string): boolean {
    if (this.seen.has(id)) return true;
    this.seen.add(id);
    this.order.push(id);
    if (this.order.length > this.max) {
      const old = this.order.shift();
      if (old !== undefined) this.seen.delete(old);
    }
    return false;
  }

  has(id: string): boolean {
    return this.seen.has(id);
  }

  snapshot(): string[] {
    return [...this.order];
  }

  hydrate(ids: string[]): void {
    for (const id of ids) this.seenBefore(id);
  }
}

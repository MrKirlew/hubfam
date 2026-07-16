/**
 * Minimal async key/value contract. The hub/companion apps inject an
 * AsyncStorage-backed implementation; tests use MemoryKV. Mirrors the surface
 * the existing app already relies on (@react-native-async-storage/async-storage).
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class MemoryKV implements KeyValueStore {
  private map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

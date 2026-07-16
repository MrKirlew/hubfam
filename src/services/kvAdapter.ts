import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KeyValueStore } from "@familyhub/shared";

/** AsyncStorage-backed KeyValueStore for the shared Outbox / dedup persistence. */
export const asyncStorageKV: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

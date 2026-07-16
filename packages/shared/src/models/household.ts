export type DevicePlatform = "android" | "ios";
export type DeviceRole = "hub" | "companion";

export interface Household {
  id: string;
  name: string;
  createdAt: number;
}

export interface PairedDevice {
  id: string;
  name: string;
  platform: DevicePlatform;
  role: DeviceRole;
  /** Optional device public key (base64) for future per-device asymmetric auth. */
  pubKey?: string;
  createdAt: number;
  /** Epoch ms when revoked; null/undefined when active. */
  revokedAt?: number | null;
}

export function isDeviceActive(d: PairedDevice): boolean {
  return d.revokedAt == null;
}

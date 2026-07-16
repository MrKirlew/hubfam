export const PAIRING_QR_VERSION = 1;

/**
 * Contents of the pairing QR the hub shows and the companion scans. Carries the
 * relay/BLE coordinates plus the DERIVED keys (contentKey for message/list
 * sealing, bleSecret for the BLE session) — never the root householdSecret, so a
 * paired companion can seal/open content without holding the root secret.
 */
export interface PairingPayload {
  v: number;
  householdId: string;
  relayUrl: string;
  wsUrl: string;
  serviceUuid: string;
  pairingToken: string;
  contentKey: string; // base64
  bleSecret: string; // base64
}

const REQUIRED: (keyof PairingPayload)[] = [
  "householdId",
  "relayUrl",
  "wsUrl",
  "serviceUuid",
  "pairingToken",
  "contentKey",
  "bleSecret",
];

export function encodePairingQR(p: PairingPayload): string {
  return JSON.stringify(p);
}

export function decodePairingQR(s: string): PairingPayload {
  let obj: any;
  try {
    obj = JSON.parse(s);
  } catch {
    throw new Error("pairing QR: invalid JSON");
  }
  if (typeof obj !== "object" || obj === null) throw new Error("pairing QR: not an object");
  for (const k of REQUIRED) {
    if (typeof obj[k] !== "string" || obj[k].length === 0) throw new Error(`pairing QR: missing ${k}`);
  }
  if (typeof obj.v !== "number") obj.v = PAIRING_QR_VERSION;
  return obj as PairingPayload;
}

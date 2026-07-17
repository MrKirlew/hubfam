import type { SealedPayload } from "../crypto/session";

export const ENVELOPE_VERSION = 1;

export type EnvelopeKind = "message" | "list-op" | "remote" | "recipe" | "ack" | "handshake";

/**
 * The unit of transfer on both lanes (cloud + BLE). `id` is the idempotency key
 * used for cross-lane de-duplication. When `sealed` is true, `payload` is a
 * {@link SealedPayload} (AES-GCM ciphertext) rather than the plaintext object.
 */
export interface Envelope<T = unknown> {
  /** Protocol version. */
  v: number;
  /** Idempotency key (uuid v4). Deduped across lanes. */
  id: string;
  /** Household id this envelope belongs to. */
  household: string;
  /** Sender device id. */
  from: string;
  /** Epoch milliseconds at creation. */
  ts: number;
  /** Server-assigned monotonic sequence (cloud lane only). */
  seq?: number;
  kind: EnvelopeKind;
  /** True when `payload` holds ciphertext. */
  sealed?: boolean;
  payload: T | SealedPayload;
}

export function makeEnvelope<T>(
  fields: Pick<Envelope<T>, "household" | "from" | "kind" | "payload"> &
    Partial<Pick<Envelope<T>, "id" | "ts" | "sealed">>,
  id: string,
  ts: number,
): Envelope<T> {
  return {
    v: ENVELOPE_VERSION,
    id: fields.id ?? id,
    household: fields.household,
    from: fields.from,
    ts: fields.ts ?? ts,
    kind: fields.kind,
    sealed: fields.sealed,
    payload: fields.payload,
  };
}

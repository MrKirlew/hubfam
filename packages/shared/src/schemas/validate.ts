import type { Envelope, EnvelopeKind } from "../models/envelope";

/**
 * Dependency-free runtime validation at the receive boundary of every lane.
 * (A zod swap is possible later, but hand-written guards keep the shared core
 * zero-dependency and identical across Node / Hermes / Workers.)
 */

const KINDS: EnvelopeKind[] = ["message", "list-op", "remote", "ack", "handshake"];

export class EnvelopeParseError extends Error {
  constructor(msg: string) {
    super(`Invalid envelope: ${msg}`);
    this.name = "EnvelopeParseError";
  }
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function isEnvelope(x: unknown): x is Envelope {
  if (!isObj(x)) return false;
  if (typeof x.v !== "number") return false;
  if (typeof x.id !== "string" || x.id.length === 0) return false;
  if (typeof x.household !== "string" || x.household.length === 0) return false;
  if (typeof x.from !== "string" || x.from.length === 0) return false;
  if (typeof x.ts !== "number" || !isFinite(x.ts)) return false;
  if (x.seq !== undefined && typeof x.seq !== "number") return false;
  if (typeof x.kind !== "string" || !KINDS.includes(x.kind as EnvelopeKind)) return false;
  if (x.sealed !== undefined && typeof x.sealed !== "boolean") return false;
  if (!("payload" in x) || x.payload === undefined) return false;
  if (x.sealed === true) {
    const p = x.payload;
    if (!isObj(p) || typeof p.iv !== "string" || typeof p.ct !== "string") return false;
  }
  return true;
}

export function parseEnvelope(raw: string | object): Envelope {
  let obj: unknown;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new EnvelopeParseError("not valid JSON");
    }
  } else {
    obj = raw;
  }
  if (!isEnvelope(obj)) throw new EnvelopeParseError("shape mismatch");
  return obj;
}

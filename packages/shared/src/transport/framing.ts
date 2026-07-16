/**
 * BLE frame codec. A logical payload can exceed the negotiated ATT MTU
 * (~20–512 bytes), so it is split into frames:
 *
 *   [ msgId u16 | seq u16 | total u16 | flags u8 | ...chunk ]   (7-byte header)
 *
 * flags bit0 = last frame. The reassembler collects frames by msgId and returns
 * the reconstructed payload once every chunk has arrived (order-independent).
 */
export const FRAME_HEADER_BYTES = 7;
const FLAG_LAST = 0x01;

export function encodeFrames(msgId: number, payload: Uint8Array, maxFrameBytes: number): Uint8Array[] {
  const chunkSize = Math.max(1, maxFrameBytes - FRAME_HEADER_BYTES);
  const total = Math.max(1, Math.ceil(payload.length / chunkSize));
  const frames: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    const start = i * chunkSize;
    const chunk = payload.subarray(start, start + chunkSize);
    const frame = new Uint8Array(FRAME_HEADER_BYTES + chunk.length);
    const dv = new DataView(frame.buffer);
    dv.setUint16(0, msgId & 0xffff);
    dv.setUint16(2, i & 0xffff);
    dv.setUint16(4, total & 0xffff);
    frame[6] = i === total - 1 ? FLAG_LAST : 0x00;
    frame.set(chunk, FRAME_HEADER_BYTES);
    frames.push(frame);
  }
  return frames;
}

interface Pending {
  chunks: (Uint8Array | undefined)[];
  total: number;
  received: number;
}

export class FrameReassembler {
  private pending = new Map<number, Pending>();

  /** Returns the reassembled payload when complete, else null. */
  push(frame: Uint8Array): Uint8Array | null {
    if (frame.length < FRAME_HEADER_BYTES) return null;
    const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const msgId = dv.getUint16(0);
    const seq = dv.getUint16(2);
    const total = dv.getUint16(4);
    if (total === 0 || seq >= total) return null;

    let entry = this.pending.get(msgId);
    if (!entry) {
      entry = { chunks: new Array(total), total, received: 0 };
      this.pending.set(msgId, entry);
    }
    if (!entry.chunks[seq]) {
      entry.chunks[seq] = frame.slice(FRAME_HEADER_BYTES); // copy out of the shared buffer
      entry.received++;
    }
    if (entry.received === entry.total) {
      this.pending.delete(msgId);
      const len = entry.chunks.reduce((a, c) => a + (c ? c.length : 0), 0);
      const out = new Uint8Array(len);
      let o = 0;
      for (const c of entry.chunks) {
        if (c) {
          out.set(c, o);
          o += c.length;
        }
      }
      return out;
    }
    return null;
  }

  /** Drop a partially-received message (e.g. on disconnect). */
  reset(msgId?: number): void {
    if (msgId === undefined) this.pending.clear();
    else this.pending.delete(msgId);
  }
}

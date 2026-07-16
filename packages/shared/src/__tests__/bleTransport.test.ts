import {
  BleTransport,
  type BleLink,
  SessionCrypto,
  WebCryptoProvider,
  type Envelope,
} from "../index";

class FakeBleLink implements BleLink {
  peer!: FakeBleLink;
  private connected = true;
  private frameCbs = new Set<(f: Uint8Array) => void>();
  private connCbs = new Set<(c: boolean) => void>();
  async start(): Promise<void> {
    this.set(true);
  }
  async stop(): Promise<void> {
    this.set(false);
  }
  isConnected(): boolean {
    return this.connected;
  }
  private set(c: boolean): void {
    if (this.connected === c) return;
    this.connected = c;
    for (const cb of this.connCbs) cb(c);
  }
  async sendFrame(f: Uint8Array): Promise<void> {
    const copy = f.slice();
    for (const cb of this.peer.frameCbs) cb(copy);
  }
  onFrame(cb: (f: Uint8Array) => void): () => void {
    this.frameCbs.add(cb);
    return () => this.frameCbs.delete(cb);
  }
  onConnectionChange(cb: (c: boolean) => void): () => void {
    this.connCbs.add(cb);
    return () => this.connCbs.delete(cb);
  }
}

function linkPair(): [FakeBleLink, FakeBleLink] {
  const a = new FakeBleLink();
  const b = new FakeBleLink();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

function env(id: string): Envelope {
  return { v: 1, id, household: "h1", from: "hub", ts: 1, kind: "message", payload: { body: "hi" } };
}
/** Resolves once B has emitted `n` envelopes — no timing assumptions. */
function collect(t: BleTransport, n = 1): Promise<Envelope[]> {
  return new Promise((resolve) => {
    const out: Envelope[] = [];
    const un = t.onReceive((e) => {
      out.push(e);
      if (out.length >= n) {
        un();
        resolve(out);
      }
    });
  });
}

describe("BleTransport", () => {
  it("round-trips an envelope in plaintext", async () => {
    const [la, lb] = linkPair();
    const A = new BleTransport({ link: la });
    const B = new BleTransport({ link: lb });
    const p = collect(B);
    await A.send(env("m1"));
    const got = await p;
    expect(got[0].id).toBe("m1");
  });

  it("round-trips a sealed envelope when both sides share a session key", async () => {
    const provider = new WebCryptoProvider();
    const secret = provider.randomBytes(32);
    const sessA = await SessionCrypto.deriveFromSecret(provider, secret, "familyhub-ble-session");
    const sessB = await SessionCrypto.deriveFromSecret(provider, secret, "familyhub-ble-session");
    const [la, lb] = linkPair();
    const A = new BleTransport({ link: la, session: sessA });
    const B = new BleTransport({ link: lb, session: sessB });
    const p = collect(B);
    await A.send(env("sealed"));
    const got = await p;
    expect(got[0].id).toBe("sealed");
  });

  it("chunks a large envelope across many frames and reassembles it", async () => {
    const [la, lb] = linkPair();
    const A = new BleTransport({ link: la, maxFrameBytes: 40 });
    const B = new BleTransport({ link: lb, maxFrameBytes: 40 });
    const p = collect(B);
    const big: Envelope = { ...env("big"), payload: { body: "x".repeat(2000) } };
    await A.send(big);
    const got = await p;
    expect(got[0].id).toBe("big");
    expect((got[0].payload as any).body).toHaveLength(2000);
  });

  it("throws on send when the link is disconnected", async () => {
    const [la] = linkPair();
    await la.stop();
    const A = new BleTransport({ link: la });
    await expect(A.send(env("x"))).rejects.toThrow();
  });

  it("reflects link connection-state changes", async () => {
    const [la] = linkPair();
    const A = new BleTransport({ link: la });
    expect(A.getState()).toBe("connected");
    await la.stop();
    expect(A.getState()).toBe("disconnected");
  });
});

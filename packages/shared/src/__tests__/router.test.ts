import {
  TransportRouter,
  Outbox,
  Dedup,
  MemoryKV,
  type Transport,
  type ConnState,
  type Envelope,
} from "../index";

class FakeTransport implements Transport {
  readonly name: "cloud" | "ble";
  private state: ConnState;
  private recvCbs = new Set<(e: Envelope) => void>();
  private stateCbs = new Set<(s: ConnState) => void>();
  sent: Envelope[] = [];
  failNext = false;

  constructor(name: "cloud" | "ble", state: ConnState = "connected") {
    this.name = name;
    this.state = state;
  }
  async connect(): Promise<void> {
    this.setState("connected");
  }
  async disconnect(): Promise<void> {
    this.setState("disconnected");
  }
  getState(): ConnState {
    return this.state;
  }
  setState(s: ConnState): void {
    this.state = s;
    for (const cb of this.stateCbs) cb(s);
  }
  async send(env: Envelope): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("send failed");
    }
    this.sent.push(env);
  }
  onReceive(cb: (e: Envelope) => void): () => void {
    this.recvCbs.add(cb);
    return () => this.recvCbs.delete(cb);
  }
  onStateChange(cb: (s: ConnState) => void): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }
  inject(env: Envelope): void {
    for (const cb of this.recvCbs) cb(env);
  }
}

function env(id: string): Envelope {
  return { v: 1, id, household: "h1", from: "d1", ts: 1, kind: "message", payload: { body: "hi" } };
}

const tick = () => new Promise((r) => setImmediate(r));

describe("TransportRouter", () => {
  it("prefers BLE when both lanes are connected", async () => {
    const ble = new FakeTransport("ble");
    const cloud = new FakeTransport("cloud");
    const router = new TransportRouter({ ble, cloud, outbox: new Outbox(new MemoryKV()), dedup: new Dedup() });
    const result = await router.send(env("m1"));
    expect(result).toBe("ble");
    expect(ble.sent.length).toBe(1);
    expect(cloud.sent.length).toBe(0);
    expect(router.getState().effective).toBe("ble");
  });

  it("falls back to cloud when BLE is disconnected", async () => {
    const ble = new FakeTransport("ble", "disconnected");
    const cloud = new FakeTransport("cloud", "connected");
    const router = new TransportRouter({ ble, cloud, outbox: new Outbox(new MemoryKV()), dedup: new Dedup() });
    const result = await router.send(env("m1"));
    expect(result).toBe("cloud");
    expect(cloud.sent.length).toBe(1);
    expect(router.getState().effective).toBe("cloud");
  });

  it("queues to the outbox when no lane is connected", async () => {
    const ble = new FakeTransport("ble", "disconnected");
    const cloud = new FakeTransport("cloud", "disconnected");
    const outbox = new Outbox(new MemoryKV());
    const router = new TransportRouter({ ble, cloud, outbox, dedup: new Dedup() });
    const result = await router.send(env("m1"));
    expect(result).toBe("queued");
    expect(outbox.size()).toBe(1);
    expect(router.getState().effective).toBe("offline");
  });

  it("queues when the chosen lane throws on send", async () => {
    const cloud = new FakeTransport("cloud", "connected");
    cloud.failNext = true;
    const outbox = new Outbox(new MemoryKV());
    const router = new TransportRouter({ cloud, outbox, dedup: new Dedup() });
    const result = await router.send(env("m1"));
    expect(result).toBe("queued");
    expect(outbox.size()).toBe(1);
  });

  it("delivers a cross-lane duplicate only once", async () => {
    const ble = new FakeTransport("ble");
    const cloud = new FakeTransport("cloud");
    const router = new TransportRouter({ ble, cloud, outbox: new Outbox(new MemoryKV()), dedup: new Dedup() });
    const received: string[] = [];
    router.subscribe((e) => received.push(e.id));
    const e = env("dup");
    ble.inject(e);
    cloud.inject(e); // same id on the other lane
    expect(received).toEqual(["dup"]);
  });

  it("auto-flushes the outbox when a lane reconnects", async () => {
    const cloud = new FakeTransport("cloud", "disconnected");
    const outbox = new Outbox(new MemoryKV());
    const router = new TransportRouter({ cloud, outbox, dedup: new Dedup() });
    await router.send(env("m1"));
    expect(outbox.size()).toBe(1);

    cloud.setState("connected"); // triggers auto-flush
    await tick();

    expect(cloud.sent.map((e) => e.id)).toEqual(["m1"]);
    expect(outbox.size()).toBe(0);
  });
});

import {
  CloudTransport,
  type WebSocketLike,
  type WebSocketFactory,
  type RelayClient,
  type Envelope,
} from "../index";

class FakeWS implements WebSocketLike {
  onopen: (() => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  url = "";
  sent: string[] = [];
  private closed = false;
  send(d: string): void {
    this.sent.push(d);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
  fireOpen(): void {
    this.onopen?.();
  }
  fireMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

function env(id: string, seq?: number): Envelope {
  return { v: 1, id, household: "h1", from: "d1", ts: 1, kind: "message", payload: {}, seq };
}
const tick = () => new Promise((r) => setImmediate(r));

function makeRelay(state: { messages: Envelope[]; listOps: Envelope[]; cursor: number }) {
  return {
    getState: jest.fn(async () => ({ ...state, devices: [] })),
  } as unknown as RelayClient;
}

describe("CloudTransport", () => {
  it("connects, catches up via REST, then emits live WS messages", async () => {
    const created: FakeWS[] = [];
    const factory: WebSocketFactory = (url) => {
      const w = new FakeWS();
      w.url = url;
      created.push(w);
      return w;
    };
    let cursor = 0;
    const relay = makeRelay({ messages: [env("catchup", 5)], listOps: [], cursor: 5 });
    const ct = new CloudTransport({
      householdId: "h1",
      deviceToken: "tok",
      wsUrl: "wss://r/household/h1/ws",
      wsFactory: factory,
      relay,
      getCursor: () => cursor,
      setCursor: (s) => {
        cursor = s;
      },
    });
    const got: string[] = [];
    ct.onReceive((e) => got.push(e.id));

    await ct.connect();
    expect(ct.getState()).toBe("connecting");
    expect(created[0].url).toContain("token=tok");

    created[0].fireOpen();
    expect(ct.getState()).toBe("connected");
    await tick(); // catch-up is async
    expect((relay.getState as jest.Mock)).toHaveBeenCalled();
    expect(got).toContain("catchup");
    expect(cursor).toBe(5);

    created[0].fireMessage(JSON.stringify(env("live", 6)));
    expect(got).toContain("live");
    expect(cursor).toBe(6);
  });

  it("send throws until connected, then writes to the socket", async () => {
    const w = new FakeWS();
    const ct = new CloudTransport({
      householdId: "h1",
      deviceToken: "tok",
      wsUrl: "wss://r/ws",
      wsFactory: () => w,
      relay: makeRelay({ messages: [], listOps: [], cursor: 0 }),
      getCursor: () => 0,
      setCursor: () => {},
    });
    await expect(ct.send(env("x"))).rejects.toThrow();
    await ct.connect();
    w.fireOpen();
    await ct.send(env("x"));
    expect(w.sent).toHaveLength(1);
  });

  it("reconnects on an unexpected close", async () => {
    const created: FakeWS[] = [];
    const ct = new CloudTransport({
      householdId: "h1",
      deviceToken: "tok",
      wsUrl: "wss://r/ws",
      wsFactory: () => {
        const w = new FakeWS();
        created.push(w);
        return w;
      },
      relay: makeRelay({ messages: [], listOps: [], cursor: 0 }),
      getCursor: () => 0,
      setCursor: () => {},
      reconnect: { baseMs: 1, maxMs: 1, maxAttempts: 1 },
      sleep: async () => {},
    });
    await ct.connect();
    created[0].fireOpen();
    created[0].close(); // unexpected drop
    await tick();
    expect(created).toHaveLength(2); // opened a fresh socket
  });

  it("does not reconnect after an intentional disconnect()", async () => {
    const created: FakeWS[] = [];
    const ct = new CloudTransport({
      householdId: "h1",
      deviceToken: "tok",
      wsUrl: "wss://r/ws",
      wsFactory: () => {
        const w = new FakeWS();
        created.push(w);
        return w;
      },
      relay: makeRelay({ messages: [], listOps: [], cursor: 0 }),
      getCursor: () => 0,
      setCursor: () => {},
      sleep: async () => {},
    });
    await ct.connect();
    created[0].fireOpen();
    await ct.disconnect();
    await tick();
    expect(created).toHaveLength(1);
    expect(ct.getState()).toBe("disconnected");
  });
});

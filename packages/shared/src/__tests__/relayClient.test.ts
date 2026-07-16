import { RelayClient, RelayError, type FetchLike, type HttpResponse, type Envelope } from "../index";

function res(status: number, body: unknown): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}
function msg(id: string): Envelope {
  return { v: 1, id, household: "h1", from: "d1", ts: 1, kind: "message", payload: {} };
}

describe("RelayClient", () => {
  it("creates a household and trims a trailing slash from baseUrl", async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return res(200, { householdId: "h1", deviceId: "d1", deviceToken: "t1" });
    };
    const relay = new RelayClient({ baseUrl: "https://relay.example/", fetchFn });
    const out = await relay.createHousehold({ name: "Smiths" });
    expect(out).toEqual({ householdId: "h1", deviceId: "d1", deviceToken: "t1" });
    expect(calls[0].url).toBe("https://relay.example/household");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body)).toEqual({ name: "Smiths" });
  });

  it("attaches a Bearer header when a device token is set", async () => {
    let seen: any;
    const fetchFn: FetchLike = async (_url, init) => {
      seen = init;
      return res(200, { seq: 5 });
    };
    const relay = new RelayClient({ baseUrl: "https://relay.example", fetchFn }).withToken("dev-token");
    await relay.postMessage("h1", msg("e1"));
    expect(seen.headers.Authorization).toBe("Bearer dev-token");
  });

  it("throws RelayError on a 4xx (no retry)", async () => {
    let n = 0;
    const fetchFn: FetchLike = async () => {
      n++;
      return res(400, "bad token");
    };
    const relay = new RelayClient({ baseUrl: "https://relay.example", fetchFn });
    await expect(relay.pairRedeem("h1", { pairingToken: "x" })).rejects.toBeInstanceOf(RelayError);
    expect(n).toBe(1);
  });

  it("retries 5xx then succeeds", async () => {
    let n = 0;
    const fetchFn: FetchLike = async () => {
      n++;
      return n < 3 ? res(503, "unavailable") : res(200, { messages: [], listOps: [], devices: [], cursor: 7 });
    };
    const relay = new RelayClient({ baseUrl: "https://relay.example", fetchFn, retry: { sleep: async () => {} } });
    const out = await relay.getState("h1", 0);
    expect(n).toBe(3);
    expect(out.cursor).toBe(7);
  });

  it("url-encodes the list id in the ops path", async () => {
    let url = "";
    const fetchFn: FetchLike = async (u) => {
      url = u;
      return res(200, { seq: 1 });
    };
    const relay = new RelayClient({ baseUrl: "https://relay.example", fetchFn }).withToken("t");
    await relay.postListOp("h1", "list/9", { ...msg("o1"), kind: "list-op" });
    expect(url).toBe("https://relay.example/household/h1/lists/list%2F9/ops");
  });
});

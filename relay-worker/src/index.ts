import { HouseholdDO, type Env } from "./HouseholdDO";
import { errorResponse } from "./auth";

export { HouseholdDO };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers, webSocket: (res as any).webSocket });
}

/** Forward to a household DO, rewriting the URL to an internal action path. */
async function forward(stub: DurableObjectStub, internalPath: string, req: Request, bodyOverride?: unknown): Promise<Response> {
  const init: RequestInit = { method: req.method, headers: req.headers };
  if (bodyOverride !== undefined) {
    const headers = new Headers(req.headers);
    headers.set("Content-Type", "application/json");
    init.headers = headers;
    init.body = JSON.stringify(bodyOverride);
  } else if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  return stub.fetch(new Request("https://do" + internalPath, init));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    try {
      // Global manual-code pairing claim store — not household-scoped, so it
      // lives in one singleton DO. A companion redeeming a typed code reaches
      // it with just the claim id (it doesn't know its household id yet).
      if (parts[0] === "claims") {
        const stub = env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName("_claims"));
        if (parts[1] === "put" && req.method === "POST") return withCors(await forward(stub, "/claims/put", req));
        if (parts[1] === "get" && req.method === "POST") return withCors(await forward(stub, "/claims/get", req));
        return withCors(errorResponse(404, "not found"));
      }

      if (parts[0] !== "household") return withCors(errorResponse(404, "not found"));

      // POST /household  → create a brand-new household (fresh DO)
      if (parts.length === 1) {
        if (req.method !== "POST") return withCors(errorResponse(405, "method not allowed"));
        const householdId = crypto.randomUUID();
        const stub = env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName(householdId));
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        return withCors(await forward(stub, "/create", req, { ...body, householdId }));
      }

      const householdId = parts[1];
      const stub = env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName(householdId));
      const sub = parts.slice(2).join("/");

      // WebSocket upgrade is forwarded verbatim (preserves the Upgrade header).
      if (sub === "ws" && req.method === "GET") {
        return stub.fetch(new Request("https://do/ws" + url.search, req));
      }
      if (sub === "pair/start" && req.method === "POST") return withCors(await forward(stub, "/pair/start", req));
      if (sub === "pair/redeem" && req.method === "POST") return withCors(await forward(stub, "/pair/redeem", req));
      if (sub === "messages" && req.method === "POST") return withCors(await forward(stub, "/messages", req));
      if (sub === "state" && req.method === "GET") return withCors(await forward(stub, "/state" + url.search, req));
      if (sub === "push/register" && req.method === "POST") return withCors(await forward(stub, "/push/register", req));

      // POST /household/:id/lists/:listId/ops
      if (parts.length === 5 && parts[2] === "lists" && parts[4] === "ops" && req.method === "POST") {
        return withCors(await forward(stub, "/lists/ops?listId=" + encodeURIComponent(parts[3]), req));
      }
      // POST /household/:id/devices/:deviceId/revoke
      if (parts.length === 5 && parts[2] === "devices" && parts[4] === "revoke" && req.method === "POST") {
        return withCors(await forward(stub, "/devices/revoke", req, { deviceId: parts[3] }));
      }

      return withCors(errorResponse(404, "not found"));
    } catch (e: any) {
      return withCors(errorResponse(500, e?.message || "internal error"));
    }
  },
};

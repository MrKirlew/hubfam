import { DurableObject } from "cloudflare:workers";
import { sha256Hex, randomToken, bearer, jsonResponse, errorResponse } from "./auth";

export interface Env {
  HOUSEHOLD: DurableObjectNamespace;
  RELAY_SIGNING_KEY?: string;
  EXPO_ACCESS_TOKEN?: string;
}

const PAIRING_TTL_MS = 5 * 60 * 1000;

interface DeviceRow {
  deviceId: string;
  name: string;
  platform: string;
  role: string;
  pubKey: string | null;
  tokenHash: string;
  pushToken: string | null;
  createdAt: number;
  revokedAt: number | null;
}

/**
 * One instance per household. Holds the authoritative append-only log of
 * messages + list ops (ciphertext only — the relay is zero-knowledge) and a
 * device registry, and fans out to connected devices over hibernatable
 * WebSockets. Devices that aren't connected get a contentless push nudge.
 */
export class HouseholdDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS devices (
        deviceId TEXT PRIMARY KEY, name TEXT, platform TEXT, role TEXT,
        pubKey TEXT, tokenHash TEXT, pushToken TEXT, createdAt INTEGER, revokedAt INTEGER)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, sender TEXT,
        kind TEXT, ciphertext TEXT, ts INTEGER, expiresAt INTEGER)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS list_ops (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, opId TEXT UNIQUE, listId TEXT,
        ciphertext TEXT, ts INTEGER, deviceId TEXT)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS pairing_tokens (
        token TEXT PRIMARY KEY, code TEXT, expiresAt INTEGER, consumedBy TEXT, createdAt INTEGER)`,
    );
    this.sql.exec(`CREATE TABLE IF NOT EXISTS cursors (deviceId TEXT PRIMARY KEY, lastSeq INTEGER)`);
  }

  // ---- meta helpers -------------------------------------------------------

  private metaGet(k: string): string | null {
    const rows = this.sql.exec(`SELECT v FROM meta WHERE k=?`, k).toArray();
    return rows.length ? (rows[0].v as string) : null;
  }
  private metaSet(k: string, v: string): void {
    this.sql.exec(`INSERT INTO meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, v);
  }

  // ---- auth ---------------------------------------------------------------

  private async authDevice(req: Request): Promise<DeviceRow | null> {
    const tok = bearer(req) || new URL(req.url).searchParams.get("token");
    if (!tok) return null;
    const hash = await sha256Hex(tok);
    const rows = this.sql.exec(`SELECT * FROM devices WHERE tokenHash=?`, hash).toArray() as unknown as DeviceRow[];
    const dev = rows[0];
    if (!dev || dev.revokedAt != null) return null;
    return dev;
  }

  // ---- routing ------------------------------------------------------------

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    try {
      if (req.method === "POST" && path === "/create") return this.handleCreate(req);
      if (req.method === "POST" && path === "/pair/start") return this.handlePairStart(req);
      if (req.method === "POST" && path === "/pair/redeem") return this.handlePairRedeem(req);
      if (req.method === "POST" && path === "/messages") return this.handlePostMessage(req);
      if (req.method === "GET" && path === "/state") return this.handleState(req);
      if (req.method === "POST" && path === "/lists/ops") return this.handleListOp(req);
      if (req.method === "GET" && path === "/ws") return this.handleWs(req);
      if (req.method === "POST" && path === "/devices/revoke") return this.handleRevoke(req);
      if (req.method === "POST" && path === "/push/register") return this.handlePushRegister(req);
      return errorResponse(404, "not found");
    } catch (e: any) {
      return errorResponse(500, e?.message || "internal error");
    }
  }

  private async handleCreate(req: Request): Promise<Response> {
    if (this.metaGet("householdId")) return errorResponse(409, "household already initialized");
    const body = (await req.json().catch(() => ({}))) as any;
    const householdId: string = body.householdId || crypto.randomUUID();
    const now = Date.now();
    this.metaSet("householdId", householdId);
    this.metaSet("name", String(body.name || "Family"));
    this.metaSet("createdAt", String(now));

    const deviceId = crypto.randomUUID();
    const deviceToken = randomToken(32);
    this.sql.exec(
      `INSERT INTO devices (deviceId,name,platform,role,pubKey,tokenHash,pushToken,createdAt,revokedAt)
       VALUES (?,?,?,?,?,?,?,?,NULL)`,
      deviceId,
      String(body.hubName || "Hub"),
      String(body.platform || "android"),
      "hub",
      body.pubKey || null,
      await sha256Hex(deviceToken),
      null,
      now,
    );
    return jsonResponse({ householdId, deviceId, deviceToken });
  }

  private async handlePairStart(req: Request): Promise<Response> {
    const dev = await this.authDevice(req);
    if (!dev) return errorResponse(401, "unauthorized");
    if (dev.role !== "hub") return errorResponse(403, "only the hub can start pairing");
    const token = randomToken(24);
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO pairing_tokens (token,code,expiresAt,consumedBy,createdAt) VALUES (?,?,?,NULL,?)`,
      token,
      code,
      now + PAIRING_TTL_MS,
      now,
    );
    return jsonResponse({ pairingToken: token, code, expiresAt: now + PAIRING_TTL_MS });
  }

  private async handlePairRedeem(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as any;
    const token = String(body.pairingToken || "");
    const rows = this.sql.exec(`SELECT * FROM pairing_tokens WHERE token=?`, token).toArray() as any[];
    const row = rows[0];
    if (!row) return errorResponse(400, "invalid pairing token");
    if (row.consumedBy) return errorResponse(400, "pairing token already used");
    if (Date.now() > (row.expiresAt as number)) return errorResponse(400, "pairing token expired");

    const deviceId = crypto.randomUUID();
    const deviceToken = randomToken(32);
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO devices (deviceId,name,platform,role,pubKey,tokenHash,pushToken,createdAt,revokedAt)
       VALUES (?,?,?,?,?,?,?,?,NULL)`,
      deviceId,
      String(body.name || "Phone"),
      String(body.platform || "android"),
      "companion",
      body.pubKey || null,
      await sha256Hex(deviceToken),
      null,
      now,
    );
    this.sql.exec(`UPDATE pairing_tokens SET consumedBy=? WHERE token=?`, deviceId, token);
    return jsonResponse({ deviceId, deviceToken, householdId: this.metaGet("householdId") });
  }

  private async handlePostMessage(req: Request): Promise<Response> {
    const dev = await this.authDevice(req);
    if (!dev) return errorResponse(401, "unauthorized");
    const env = (await req.json().catch(() => null)) as any;
    if (!env || !env.id) return errorResponse(400, "missing envelope");
    const seq = this.persistMessage(env);
    if (seq !== null) this.fanout(JSON.stringify({ ...env, seq }), dev.deviceId);
    return jsonResponse({ seq });
  }

  private async handleListOp(req: Request): Promise<Response> {
    const dev = await this.authDevice(req);
    if (!dev) return errorResponse(401, "unauthorized");
    const listId = new URL(req.url).searchParams.get("listId") || "";
    const env = (await req.json().catch(() => null)) as any;
    if (!env || !env.id) return errorResponse(400, "missing envelope");
    const seq = this.persistListOp(env, listId, dev.deviceId);
    if (seq !== null) this.fanout(JSON.stringify({ ...env, seq }), dev.deviceId);
    return jsonResponse({ seq });
  }

  private async handleState(req: Request): Promise<Response> {
    const dev = await this.authDevice(req);
    if (!dev) return errorResponse(401, "unauthorized");
    const since = Number(new URL(req.url).searchParams.get("since") || "0");
    this.pruneExpired();
    const messages = this.sql
      .exec(`SELECT seq, ciphertext FROM messages WHERE seq > ? ORDER BY seq ASC`, since)
      .toArray()
      .map((r: any) => ({ seq: r.seq, ...JSON.parse(r.ciphertext) }));
    const listOps = this.sql
      .exec(`SELECT seq, ciphertext FROM list_ops WHERE seq > ? ORDER BY seq ASC`, since)
      .toArray()
      .map((r: any) => ({ seq: r.seq, ...JSON.parse(r.ciphertext) }));
    const devices = this.sql
      .exec(`SELECT deviceId,name,platform,role,createdAt,revokedAt FROM devices`)
      .toArray();
    const maxMsg = messages.length ? messages[messages.length - 1].seq : since;
    const maxOp = listOps.length ? listOps[listOps.length - 1].seq : since;
    const cursor = Math.max(since, maxMsg, maxOp);
    this.sql.exec(
      `INSERT INTO cursors (deviceId,lastSeq) VALUES (?,?) ON CONFLICT(deviceId) DO UPDATE SET lastSeq=excluded.lastSeq`,
      dev.deviceId,
      cursor,
    );
    return jsonResponse({ messages, listOps, devices, cursor });
  }

  private async handleRevoke(req: Request): Promise<Response> {
    const dev = await this.authDevice(req);
    if (!dev || dev.role !== "hub") return errorResponse(403, "only the hub can revoke");
    const body = (await req.json().catch(() => ({}))) as any;
    const target = String(body.deviceId || "");
    if (!target || target === dev.deviceId) return errorResponse(400, "invalid target");
    this.sql.exec(`UPDATE devices SET revokedAt=? WHERE deviceId=?`, Date.now(), target);
    for (const ws of this.ctx.getWebSockets(target)) {
      try {
        ws.close(4003, "revoked");
      } catch {
        /* ignore */
      }
    }
    return jsonResponse({ ok: true });
  }

  private async handlePushRegister(req: Request): Promise<Response> {
    const dev = await this.authDevice(req);
    if (!dev) return errorResponse(401, "unauthorized");
    const body = (await req.json().catch(() => ({}))) as any;
    this.sql.exec(`UPDATE devices SET pushToken=? WHERE deviceId=?`, String(body.pushToken || ""), dev.deviceId);
    return jsonResponse({ ok: true });
  }

  private async handleWs(req: Request): Promise<Response> {
    const dev = await this.authDevice(req);
    if (!dev) return errorResponse(401, "unauthorized");
    if (req.headers.get("Upgrade") !== "websocket") return errorResponse(426, "expected websocket");

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [dev.deviceId]);

    // Replay everything the device has not yet acknowledged.
    const since = Number(this.sql.exec(`SELECT lastSeq FROM cursors WHERE deviceId=?`, dev.deviceId).toArray()[0]?.lastSeq || 0);
    const backlog = this.sql
      .exec(`SELECT seq, ciphertext FROM messages WHERE seq > ? ORDER BY seq ASC`, since)
      .toArray()
      .map((r: any) => ({ seq: r.seq, ...JSON.parse(r.ciphertext) }));
    for (const env of backlog) {
      try {
        server.send(JSON.stringify(env));
      } catch {
        /* ignore */
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- WebSocket inbound (devices can also send over the socket) ----------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let env: any;
    try {
      env = JSON.parse(message);
    } catch {
      return;
    }
    if (!env || !env.id) return;
    if (env.kind === "list-op") {
      const seq = this.persistListOp(env, env.listId || "", env.from || "");
      if (seq !== null) this.fanout(JSON.stringify({ ...env, seq }), this.senderIdOf(ws));
    } else if (env.kind === "message") {
      const seq = this.persistMessage(env);
      if (seq !== null) this.fanout(JSON.stringify({ ...env, seq }), this.senderIdOf(ws));
    } else {
      // ack/handshake/remote — fan through without persisting
      this.fanout(message, this.senderIdOf(ws));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      /* already closing */
    }
  }

  // ---- persistence + fan-out ---------------------------------------------

  private persistMessage(env: any): number | null {
    const inserted = this.sql.exec(
      `INSERT OR IGNORE INTO messages (id,sender,kind,ciphertext,ts,expiresAt) VALUES (?,?,?,?,?,?)`,
      env.id,
      env.from || "",
      env.kind || "message",
      JSON.stringify(env),
      env.ts || Date.now(),
      env.expiresAt ?? null,
    );
    if (inserted.rowsWritten === 0) return null; // duplicate id — already relayed
    return Number(this.sql.exec(`SELECT last_insert_rowid() AS seq`).toArray()[0].seq);
  }

  private persistListOp(env: any, listId: string, deviceId: string): number | null {
    const inserted = this.sql.exec(
      `INSERT OR IGNORE INTO list_ops (opId,listId,ciphertext,ts,deviceId) VALUES (?,?,?,?,?)`,
      env.id,
      listId,
      JSON.stringify(env),
      env.ts || Date.now(),
      deviceId,
    );
    if (inserted.rowsWritten === 0) return null;
    return Number(this.sql.exec(`SELECT last_insert_rowid() AS seq`).toArray()[0].seq);
  }

  private senderIdOf(ws: WebSocket): string | null {
    const tags = this.ctx.getTags(ws);
    return tags && tags.length ? tags[0] : null;
  }

  /** Send `payload` to every connected socket except the originating device, then push to offline devices. */
  private fanout(payload: string, excludeDeviceId: string | null): void {
    const online = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const id = this.senderIdOf(ws);
      if (id) online.add(id);
      if (id && id === excludeDeviceId) continue;
      try {
        ws.send(payload);
      } catch {
        /* dropped */
      }
    }
    this.ctx.waitUntil(this.pushOffline(online, excludeDeviceId));
  }

  private async pushOffline(online: Set<string>, excludeDeviceId: string | null): Promise<void> {
    const rows = this.sql
      .exec(`SELECT deviceId,pushToken FROM devices WHERE pushToken IS NOT NULL AND revokedAt IS NULL`)
      .toArray() as any[];
    const targets = rows
      .filter((r) => r.deviceId !== excludeDeviceId && !online.has(r.deviceId) && r.pushToken)
      .map((r) => r.pushToken as string);
    if (!targets.length) return;
    // Contentless nudge — the app pulls the actual (encrypted) body on connect.
    const messages = targets.map((to) => ({ to, title: "Family Hub", body: "New update", data: { type: "hub-message" } }));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.env.EXPO_ACCESS_TOKEN) headers["Authorization"] = `Bearer ${this.env.EXPO_ACCESS_TOKEN}`;
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers,
        body: JSON.stringify(messages),
      });
    } catch {
      /* best-effort */
    }
  }

  private pruneExpired(): void {
    this.sql.exec(`DELETE FROM messages WHERE expiresAt IS NOT NULL AND expiresAt < ?`, Date.now());
  }
}

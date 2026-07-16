import type { Envelope } from "../models/envelope";
import { fetchWithRetry, type FetchLike, type RetryOptions } from "./http";

export interface RelayClientOptions {
  baseUrl: string;
  fetchFn: FetchLike;
  deviceToken?: string;
  retry?: RetryOptions;
}

export interface CreateHouseholdResult {
  householdId: string;
  deviceId: string;
  deviceToken: string;
}
export interface PairStartResult {
  pairingToken: string;
  code: string;
  expiresAt: number;
}
export interface PairRedeemResult {
  deviceId: string;
  deviceToken: string;
  householdId: string;
}
export interface StateResult {
  messages: Envelope[];
  listOps: Envelope[];
  devices: unknown[];
  cursor: number;
}

export class RelayError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Relay ${status}: ${message}`);
    this.name = "RelayError";
  }
}

/** Typed REST client for the familyhub-relay Worker. */
export class RelayClient {
  private readonly baseUrl: string;

  constructor(private readonly opts: RelayClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
  }

  /** A copy of this client carrying a device bearer token. */
  withToken(deviceToken: string): RelayClient {
    return new RelayClient({ ...this.opts, deviceToken });
  }

  private headers(hasBody: boolean): Record<string, string> {
    const h: Record<string, string> = {};
    if (hasBody) h["Content-Type"] = "application/json";
    if (this.opts.deviceToken) h["Authorization"] = `Bearer ${this.opts.deviceToken}`;
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const hasBody = body !== undefined;
    const res = await fetchWithRetry(
      this.opts.fetchFn,
      this.baseUrl + path,
      { method, headers: this.headers(hasBody), body: hasBody ? JSON.stringify(body) : undefined },
      this.opts.retry,
    );
    const text = await res.text();
    if (!res.ok) throw new RelayError(res.status, text || "request failed");
    return (text ? JSON.parse(text) : {}) as T;
  }

  createHousehold(body: { name?: string; hubName?: string; platform?: string } = {}): Promise<CreateHouseholdResult> {
    return this.request("POST", "/household", body);
  }

  pairStart(householdId: string): Promise<PairStartResult> {
    return this.request("POST", `/household/${householdId}/pair/start`);
  }

  pairRedeem(
    householdId: string,
    body: { pairingToken: string; name?: string; platform?: string; pubKey?: string },
  ): Promise<PairRedeemResult> {
    return this.request("POST", `/household/${householdId}/pair/redeem`, body);
  }

  postMessage(householdId: string, env: Envelope): Promise<{ seq: number }> {
    return this.request("POST", `/household/${householdId}/messages`, env);
  }

  postListOp(householdId: string, listId: string, env: Envelope): Promise<{ seq: number }> {
    return this.request("POST", `/household/${householdId}/lists/${encodeURIComponent(listId)}/ops`, env);
  }

  getState(householdId: string, since = 0): Promise<StateResult> {
    return this.request("GET", `/household/${householdId}/state?since=${since}`);
  }

  revokeDevice(householdId: string, deviceId: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/household/${householdId}/devices/${deviceId}/revoke`);
  }

  registerPush(householdId: string, pushToken: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/household/${householdId}/push/register`, { pushToken });
  }
}

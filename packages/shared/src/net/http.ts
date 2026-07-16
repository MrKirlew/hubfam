/**
 * Minimal fetch abstraction + retry/backoff, mirroring the hub's existing
 * googleApiFetch semantics (retry 429/5xx with exponential backoff, terminal on
 * other 4xx). `fetchFn` is injected so this runs under Node (tests), RN, and
 * Workers without importing a platform fetch.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponse>;

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  fetchFn: FetchLike,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  opts: RetryOptions = {},
): Promise<HttpResponse> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    let res: HttpResponse;
    try {
      res = await fetchFn(url, init);
    } catch (e) {
      if (attempt >= maxRetries) throw e;
      await sleep(baseDelay * 2 ** attempt);
      attempt++;
      continue;
    }
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      await sleep(baseDelay * 2 ** attempt);
      attempt++;
      continue;
    }
    return res; // terminal 4xx or retries exhausted
  }
}

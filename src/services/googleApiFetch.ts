/**
 * googleApiFetch.ts
 *
 * Retry-aware fetch wrapper for Google APIs.
 * Handles 429 (rate limit) and 5xx (server error) with exponential backoff.
 * Integrates with ErrorRecoveryService for persistent failure tracking.
 */

import { recordFailure, markResolved, onNetworkFailure } from "./ErrorRecoveryService";

interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  operationKey?: string;
}

const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  operationKey: "google-api",
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function getRetryDelay(
  response: Response,
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  // Check Retry-After header (Google uses this on 429)
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds * 1000;
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }
  }
  // Exponential backoff with jitter
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay * 0.5;
  return Math.min(delay + jitter, maxDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch from a Google API with automatic retry for 429 and 5xx responses.
 * Terminal 4xx errors (400, 401, 403, 404) are returned immediately without retry.
 * Network errors are retried, then routed to ErrorRecoveryService.
 */
export async function googleApiFetch(
  url: string,
  init?: RequestInit,
  config?: RetryConfig
): Promise<Response> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok) {
        // If we succeeded after retries, clear the failure record
        if (attempt > 0) {
          markResolved(`api:${cfg.operationKey}`);
        }
        return response;
      }

      // Terminal client errors (4xx except 429) — don't retry
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }

      // Retryable: 429 or 5xx
      if (isRetryableStatus(response.status) && attempt < cfg.maxRetries) {
        const delay = getRetryDelay(response, attempt, cfg.baseDelayMs, cfg.maxDelayMs);
        console.log(
          `[GoogleAPI] ${cfg.operationKey}: HTTP ${response.status}, retry ${attempt + 1}/${cfg.maxRetries} in ${Math.round(delay / 1000)}s`
        );
        lastResponse = response;
        await sleep(delay);
        continue;
      }

      // Max retries exhausted
      lastResponse = response;
      break;
    } catch (err) {
      // Network error (offline, DNS, timeout)
      if (attempt < cfg.maxRetries) {
        const delay = cfg.baseDelayMs * Math.pow(2, attempt);
        console.log(
          `[GoogleAPI] ${cfg.operationKey}: network error, retry ${attempt + 1}/${cfg.maxRetries} in ${Math.round(delay / 1000)}s`
        );
        await sleep(delay);
        continue;
      }
      // All retries exhausted — route to ErrorRecoveryService
      onNetworkFailure(cfg.operationKey, err as Error);
      throw err;
    }
  }

  // All retries exhausted with retryable status
  if (lastResponse && isRetryableStatus(lastResponse.status)) {
    recordFailure(
      `api:${cfg.operationKey}`,
      new Error(`Google API ${lastResponse.status} after ${cfg.maxRetries} retries: ${url}`)
    );
  }

  return lastResponse!;
}

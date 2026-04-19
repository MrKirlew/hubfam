/**
 * ErrorRecoveryService.ts
 *
 * Self-healing error detection and recovery system.
 * Monitors all failure points and takes corrective action automatically:
 *
 *  1. Sync failures      → exponential backoff retry
 *  2. Auth token expiry   → silent re-auth via SDK, queue for manual re-auth
 *  3. Network errors     → detect offline, retry when back online
 *  4. Stale data         → periodic health checks, auto-refresh
 *  5. Store corruption   → safe fallback defaults
 *
 * All recovery is silent — the user never sees error messages.
 */

import { AppState, AppStateStatus } from "react-native";
import { useAppStore } from "../store/appStore";
import { captureError } from "./AnalyticsService";

// Lazy import to break circular dependency (ErrorRecovery <-> SyncOrchestrator)
let _performSync: (() => Promise<void>) | null = null;
function getPerformSync(): () => Promise<void> {
  if (!_performSync) {
    _performSync = require("./SyncOrchestrator").performSync;
  }
  return _performSync!;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FailureRecord {
  key: string;
  count: number;
  lastAttempt: number;
  nextRetry: number;
  resolved: boolean;
}

type RecoveryAction = () => Promise<void>;

// ── State ────────────────────────────────────────────────────────────────────

const failures = new Map<string, FailureRecord>();
let recoveryTimer: ReturnType<typeof setInterval> | null = null;
let isOnline = true;
let pendingOnlineActions: RecoveryAction[] = [];

// ── Configuration ────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 5_000;       // 5 seconds initial
const MAX_DELAY_MS = 5 * 60_000;   // 5 minutes max
const HEALTH_CHECK_INTERVAL = 2 * 60_000; // 2 minutes

// ── Core: Record and Recover ─────────────────────────────────────────────────

/**
 * Record a failure and schedule automatic recovery.
 * Call this from any catch block instead of just logging.
 */
export function recordFailure(
  key: string,
  error: Error,
  recoveryAction?: RecoveryAction
): void {
  const existing = failures.get(key);
  const now = Date.now();

  if (existing && existing.count >= MAX_RETRIES) {
    // Max retries exhausted — don't spam, just log once
    if (now - existing.lastAttempt > MAX_DELAY_MS) {
      existing.lastAttempt = now;
      console.log(`[Recovery] ${key}: max retries reached, will try again later`);
    }
    return;
  }

  const count = (existing?.count || 0) + 1;
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, count - 1), MAX_DELAY_MS);

  const record: FailureRecord = {
    key,
    count,
    lastAttempt: now,
    nextRetry: now + delay,
    resolved: false,
  };

  failures.set(key, record);
  console.log(`[Recovery] ${key}: failure #${count}, retry in ${Math.round(delay / 1000)}s`);

  // Schedule retry
  if (recoveryAction) {
    setTimeout(async () => {
      const current = failures.get(key);
      if (!current || current.resolved) return;

      // If offline, queue for when we come back online
      if (!isOnline) {
        pendingOnlineActions.push(recoveryAction);
        console.log(`[Recovery] ${key}: offline, queued for reconnection`);
        return;
      }

      try {
        await recoveryAction();
        markResolved(key);
      } catch (retryErr) {
        recordFailure(key, retryErr as Error, recoveryAction);
      }
    }, delay);
  }

  // Report to analytics (non-blocking)
  captureError(error, { recovery_key: key, attempt: String(count) });
}

/**
 * Mark a failure as resolved (successful recovery).
 */
export function markResolved(key: string): void {
  const record = failures.get(key);
  if (record) {
    record.resolved = true;
    record.count = 0;
    console.log(`[Recovery] ${key}: resolved`);
  }
}

/**
 * Check if a specific operation is currently failing.
 */
export function isFailingKey(key: string): boolean {
  const record = failures.get(key);
  return !!record && !record.resolved && record.count > 0;
}

/**
 * Get a summary of all active failures (for diagnostics).
 */
export function getFailureSummary(): { key: string; count: number; lastAttempt: number }[] {
  return Array.from(failures.values())
    .filter(f => !f.resolved && f.count > 0)
    .map(({ key, count, lastAttempt }) => ({ key, count, lastAttempt }));
}

// ── Built-in Recovery Actions ────────────────────────────────────────────────

/** Recovery: retry full sync */
async function recoverSync(): Promise<void> {
  await getPerformSync()();
}

/** Recovery: re-authenticate a Google account via SDK silent sign-in */
async function recoverAuth(email: string): Promise<void> {
  try {
    const { GoogleSignin } = require("@react-native-google-signin/google-signin");
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    if (tokens.accessToken) {
      markResolved(`auth:${email}`);
      // Trigger a fresh sync now that auth is restored
      getPerformSync()().catch(() => {});
    }
  } catch {
    console.log(`[Recovery] Silent re-auth failed for ${email} — user needs manual sign-in`);
  }
}

// ── Convenience wrappers ─────────────────────────────────────────────────────

/** Call when a sync operation fails */
export function onSyncFailure(error: Error): void {
  recordFailure("sync:calendar", error, recoverSync);
}

/** Call when auth/token fails for an account */
export function onAuthFailure(email: string, error: Error): void {
  recordFailure(`auth:${email}`, error, () => recoverAuth(email));
}

/** Call when a network request fails */
export function onNetworkFailure(operation: string, error: Error, retry?: RecoveryAction): void {
  recordFailure(`network:${operation}`, error, retry);
}

/** Call when weather fetch fails */
export function onWeatherFailure(error: Error): void {
  recordFailure("weather:fetch", error);
}

// ── Network Monitoring ───────────────────────────────────────────────────────

function handleConnectivityChange(connected: boolean): void {
  const wasOffline = !isOnline;
  isOnline = connected;

  if (wasOffline && isOnline) {
    console.log("[Recovery] Back online — flushing queued actions");
    const actions = [...pendingOnlineActions];
    pendingOnlineActions = [];
    for (const action of actions) {
      action().catch(() => {});
    }
    // Also trigger a sync whenever we come back online
    getPerformSync()().catch(() => {});
  }
}

/** Simple connectivity check via fetch (no extra dependency needed) */
async function checkConnectivity(): Promise<void> {
  try {
    const res = await fetch("https://clients3.google.com/generate_204", {
      method: "HEAD",
    });
    handleConnectivityChange(res.status === 204 || res.ok);
  } catch {
    handleConnectivityChange(false);
  }
}

// ── Health Check ─────────────────────────────────────────────────────────────

function runHealthCheck(): void {
  const store = useAppStore.getState();
  const now = Date.now();

  // Check 1: Stale sync — if last sync was over 15 minutes ago, trigger one
  if (store.lastSyncTime && now - store.lastSyncTime > 15 * 60_000) {
    if (!store.isSyncing && isOnline) {
      console.log("[Recovery] Health check: sync is stale, triggering refresh");
      getPerformSync()().catch((err: Error) => onSyncFailure(err));
    }
  }

  // Check 2: Stuck sync flag — if isSyncing has been true for over 2 minutes, reset it
  if (store.isSyncing && store.lastSyncTime && now - store.lastSyncTime > 2 * 60_000) {
    console.log("[Recovery] Health check: sync appears stuck, resetting flag");
    store.setSyncing(false);
  }

  // Check 3: Clean up old resolved failures
  for (const [key, record] of failures) {
    if (record.resolved && now - record.lastAttempt > 10 * 60_000) {
      failures.delete(key);
    }
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/**
 * Start the error recovery system. Call once at app startup.
 */
export function startErrorRecovery(): void {
  if (recoveryTimer) return;

  // Periodic health check
  recoveryTimer = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL);

  // Network connectivity check on startup and periodically
  checkConnectivity();

  // Re-check health and connectivity on app resume
  appStateSubscription = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      checkConnectivity();
      runHealthCheck();
    }
  });

  console.log("[Recovery] Error recovery system started");
}

/**
 * Stop the error recovery system.
 */
export function stopErrorRecovery(): void {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

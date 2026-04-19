/**
 * AnalyticsService.ts
 *
 * Crash reporting and basic analytics via @sentry/react-native.
 * DSN is configured via EXPO_PUBLIC_SENTRY_DSN environment variable.
 *
 * ACTIVATION STEPS (after native rebuild + Sentry compatibility fix):
 *   1. Run: eas build --profile development --platform android
 *   2. Verify @sentry/react-native works with the current RN version
 *   3. Add: import * as Sentry from "@sentry/react-native" (top of file)
 *   4. Uncomment Sentry calls below
 *   5. Set EXPO_PUBLIC_SENTRY_DSN in .env
 *
 * NOTE: @sentry/react-native ~7.11.0 has a known incompatibility with
 * React Native 0.83 (missing promise/setimmediate/done module). This will
 * be fixed in a future Sentry release. Do NOT import Sentry statically
 * until this is resolved — Metro will fail to bundle.
 */

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    console.log("[Analytics] No SENTRY_DSN — crash reporting disabled");
    return;
  }
  console.log("[Analytics] Sentry awaiting RN 0.83 compatibility fix");
}

/** Log a breadcrumb for key user actions */
export function trackAction(action: string, data?: Record<string, string>): void {
  if (!initialized) return;
  // Sentry.addBreadcrumb({ category: "action", message: action, data, level: "info" });
}

/** Capture a non-fatal error */
export function captureError(error: Error, context?: Record<string, string>): void {
  if (!initialized) return;
  // if (context) Sentry.setContext("extra", context);
  // Sentry.captureException(error);
}

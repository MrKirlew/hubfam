/**
 * ExactAlarmService.ts
 *
 * Android 14+ (API 34+) no longer auto-grants the SCHEDULE_EXACT_ALARM
 * permission for non-alarm-clock apps. Without it, future-time event
 * reminders scheduled by NotificationService get coerced to inexact and
 * may fire up to ~10 minutes late — bad for pickup times, medication
 * windows, etc. (the app's core use case).
 *
 * This service shows a one-time explainer at app launch on affected
 * Android versions, with an "Open Settings" button that takes the user
 * directly to the per-app exact-alarm toggle (via expo-intent-launcher).
 *
 * Persistence is via the appStore's `exactAlarmPromptShown` flag — we
 * never nag a user who has already seen this prompt. We also call the
 * native canScheduleExactAlarms() check so that users who already have
 * the permission granted never see the prompt at all.
 *
 * See DEBT-041 / DEBT-042 / DEBT-043 / ADR-014 / ADR-015 / ADR-016.
 */

import { Alert, Linking, Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as Application from "expo-application";
import { canScheduleExactAlarms } from "../../modules/app-manager";

// Derived at module load from expo-application so the deeplink follows the
// app's actual package ID even if it's renamed (per-flavour, per-variant).
const PACKAGE_DATA_URI = `package:${Application.applicationId ?? "com.familyhub.app"}`;

/**
 * Open the Android exact-alarm Settings page, landing as close as possible
 * to the per-app toggle.
 *
 * Best path: expo-intent-launcher with action +
 * `data=package:com.familyhub.app` — Android docs document this as the
 * direct deeplink to the per-app toggle.
 *
 * Fallback 1: `Linking.sendIntent` with the same action but no data URI
 * (RN's Linking can't attach intent data) — lands on the system-wide
 * Alarms-and-reminders list. One extra tap.
 *
 * Fallback 2: `Linking.openSettings()` — opens the generic app Settings
 * page from which the user navigates manually. Worst case, but always
 * available.
 */
async function openExactAlarmSettings(): Promise<void> {
  // Path 1 — IntentLauncher with data URI for the per-app deeplink.
  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
      { data: PACKAGE_DATA_URI },
    );
    return;
  } catch (err) {
    console.warn("[ExactAlarm] IntentLauncher with data URI failed:", err);
  }

  // Path 2 — Linking.sendIntent (system-wide list, one extra tap).
  try {
    await Linking.sendIntent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM");
    return;
  } catch (err) {
    console.warn("[ExactAlarm] Linking.sendIntent failed:", err);
  }

  // Path 3 — generic Settings page.
  try {
    await Linking.openSettings();
  } catch (err) {
    console.warn("[ExactAlarm] openSettings fallback also failed:", err);
  }
}

/**
 * Show the explainer if:
 *   - we're on Android,
 *   - API level >= 31 (when SCHEDULE_EXACT_ALARM exists at all),
 *   - the user hasn't been prompted before in this install,
 *   - AND the permission is not already granted (native check).
 *
 * The native canScheduleExactAlarms() check eliminates the previous
 * "show once even if already granted" friction. If the native call fails
 * for any reason (module not loaded, runtime error), we fall back to the
 * conservative behaviour of showing the prompt — better one extra tap
 * than reminders silently delivered late.
 *
 * The caller passes `markPromptShown` rather than this service touching
 * the store directly — keeps ExactAlarmService easier to unit-test.
 */
export async function maybeShowExactAlarmExplainer(
  promptAlreadyShown: boolean,
  markPromptShown: () => void,
): Promise<void> {
  if (Platform.OS !== "android") return;

  // Platform.Version on Android is the API level (number). API 31 is the first
  // version where SCHEDULE_EXACT_ALARM exists; before that there is nothing
  // for the user to grant.
  const apiLevel = typeof Platform.Version === "number" ? Platform.Version : 0;
  if (apiLevel < 31) return;

  if (promptAlreadyShown) return;

  // Skip the prompt if the permission is already granted. Failure to query
  // is treated as "show the prompt" — safer to over-prompt once than to
  // silently miss the granting opportunity.
  let alreadyGranted = false;
  try {
    alreadyGranted = await canScheduleExactAlarms();
  } catch (err) {
    console.warn("[ExactAlarm] canScheduleExactAlarms check failed:", err);
  }
  if (alreadyGranted) {
    // Mark shown so we don't waste the check on every launch.
    markPromptShown();
    return;
  }

  Alert.alert(
    "Allow exact reminders",
    "Family Hub schedules event reminders so they fire at the exact time you set. " +
      "Android needs an extra permission to deliver them on time.\n\n" +
      "Tap Open Settings — Android opens directly to the Family Hub toggle. " +
      "Turn it on to keep reminders on time.\n\n" +
      "If you skip this, reminders may be delivered up to ~10 minutes late.",
    [
      { text: "Skip for now", style: "cancel" },
      { text: "Open Settings", onPress: () => { void openExactAlarmSettings(); } },
    ],
    { cancelable: true },
  );

  // Mark AFTER enqueuing the alert so that if Alert.alert throws (rare RN
  // edge case during bridge teardown), we re-prompt next launch instead of
  // permanently consuming the one-time prompt.
  markPromptShown();
}

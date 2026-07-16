/**
 * App.tsx — Root entry point
 *
 * Handles:
 *  • Google Sign-In SDK initialisation
 *  • Notification permission + channel setup
 *  • Keep-awake for wall/fridge mount (tablet stays on)
 *  • Background calendar sync every 30 minutes
 */

import React, { useEffect, useState, useRef } from "react";
import { StatusBar, AppState, AppStateStatus, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import * as KeepAwake from "expo-keep-awake";

import * as Notifications from "expo-notifications";
import AppNavigator, { navigationRef } from "./src/navigation/AppNavigator";
import { initGoogleSignIn } from "./src/services/CalendarSyncService";
import { setupNotificationChannel, requestNotificationPermissions } from "./src/services/NotificationService";
import { useAppStore } from "./src/store/appStore";
import { startBatteryMonitor, stopBatteryMonitor, playBatteryAlert } from "./src/services/BatteryService";
import { setScreenBrightness } from "./modules/app-manager";
import { performSync, loadCachedEventsOnStartup } from "./src/services/SyncOrchestrator";
import { startAlarmChecker, stopAlarmChecker } from "./src/services/AlarmService";
import { initAnalytics, trackAction } from "./src/services/AnalyticsService";
import { startErrorRecovery, stopErrorRecovery } from "./src/services/ErrorRecoveryService";
import { startHubTransport, stopHubTransport } from "./src/services/HubTransportService";
import { initHubDelivery, checkScheduledMessages } from "./src/services/HubMessageDelivery";
import { maybeShowExactAlarmExplainer } from "./src/services/ExactAlarmService";

// Suppress sync warnings from appearing as yellow banners in dev builds
LogBox.ignoreLogs([
  "[GoogleSignin]",
  "[GoogleTasks]",
  "[Sync]",
  "[Analytics]",
]);

SplashScreen.preventAutoHideAsync();

// Closest JS-observable proxy for "splash visible". Used by the analytics
// events below to measure real cold-boot duration so we can right-size
// HYDRATION_TIMEOUT_MS from telemetry instead of guessing. See DEBT-035.
const HYDRATION_START_MS = Date.now();

// Hard ceiling for store hydration. If AsyncStorage stalls or the persisted
// blob is corrupted, the app would otherwise sit on the splash screen forever.
// After this many ms we force the UI to mount with whatever state we have.
const HYDRATION_TIMEOUT_MS = 5000;

export default function App() {
  const hasHydrated  = useAppStore(s => s._hasHydrated);
  const householdId  = useAppStore(s => s.household?.id);

  const [appReady, setAppReady] = useState(false);
  const appState = useRef(AppState.currentState);

  // Safety net: never let the splash screen lock the app.
  // Read live store + appReady at fire time to avoid stale-closure false alarms
  // when hydration completes within a few ms of the timeout boundary.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const liveHydrated = useAppStore.getState()._hasHydrated;
      if (!liveHydrated && !appReady) {
        console.warn(
          `[App] Hydration did not complete within ${HYDRATION_TIMEOUT_MS}ms — forcing UI to mount.`
        );
        trackAction("splash_timeout_fired", {
          timeout_ms: String(HYDRATION_TIMEOUT_MS),
          elapsed_ms: String(Date.now() - HYDRATION_START_MS),
          hydrated:   String(liveHydrated),
        });
        setAppReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [appReady]);

  const keepAwakeEnabled = useAppStore(s => s.keepAwakeEnabled);

  // One-time SDK init (independent of hydration). Each SDK is isolated so a
  // failure from one (sync throw or async rejection) cannot prevent the others
  // from running and cannot tear down this effect before its sibling effects
  // mount. The helper handles both sync and async init signatures uniformly.
  useEffect(() => {
    const safeInit = (name: string, fn: () => unknown): void => {
      try {
        Promise.resolve(fn()).catch((err: unknown) => {
          console.error(`[App] ${name} failed:`, err);
        });
      } catch (err) {
        console.error(`[App] ${name} failed:`, err);
      }
    };

    safeInit("initAnalytics", initAnalytics);
    safeInit("initGoogleSignIn", initGoogleSignIn);
    safeInit("setupNotificationChannel", setupNotificationChannel);
    safeInit("requestNotificationPermissions", requestNotificationPermissions);
  }, []);

  // Notification tap handler — navigate to relevant screen when user taps a reminder
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (navigationRef.isReady()) {
        if (data?.eventId) {
          navigationRef.navigate("Calendar" as never);
        } else if (data?.type === "alarm") {
          navigationRef.navigate("AlarmSchedule" as never);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // KeepAwake — only when user enables "Always On Display" in settings
  useEffect(() => {
    if (keepAwakeEnabled) {
      KeepAwake.activateKeepAwakeAsync();
    } else {
      KeepAwake.deactivateKeepAwake();
    }
    return () => { KeepAwake.deactivateKeepAwake(); };
  }, [keepAwakeEnabled]);

  // Rollover incomplete tasks to today on startup
  useEffect(() => {
    if (!hasHydrated) return;
    const store = useAppStore.getState();
    if (!store.rolloverIncomplete) return;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    let rolled = 0;
    for (const list of store.lists) {
      for (const item of list.items) {
        if (item.dueDate && item.dueDate < todayStr && !item.done) {
          store.updateTodoItem(list.id, item.id, { dueDate: todayStr });
          rolled++;
        }
      }
    }
    if (rolled > 0) console.log(`[App] Rolled over ${rolled} incomplete task(s) to today`);
  }, [hasHydrated]);

  // Background Sync Timer: Every 5 minutes while app is running
  useEffect(() => {
    if (!hasHydrated) return;

    // Load local cache immediately for zero-wait UI
    loadCachedEventsOnStartup().catch((err: any) => {
      console.error("[App] Failed to load cached events on startup:", err);
    });

    // Trigger initial sync
    performSync().catch((err: any) => {
      console.error("[App] Initial sync failed:", err);
    });

    const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes — near real-time sync
    const interval = setInterval(() => {
      console.log("[App] Triggering scheduled 5-minute sync...");
      performSync();
    }, SYNC_INTERVAL);

    // Also sync on resume (AppState change to active)
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        console.log("[App] App resumed, triggering sync...");
        performSync();
      }
      appState.current = nextAppState;
    });

    // Start alarm checker + error recovery
    startAlarmChecker();
    startErrorRecovery();

    // Start the companion-messaging transport (idle until a phone is paired)
    startHubTransport().catch((err: any) => {
      console.error("[App] Failed to start hub transport:", err);
    });

    // Deliver scheduled messages + fire their sound/overlay when due
    initHubDelivery();
    const schedulerInterval = setInterval(checkScheduledMessages, 30 * 1000);

    return () => {
      clearInterval(interval);
      clearInterval(schedulerInterval);
      subscription.remove();
      stopAlarmChecker();
      stopErrorRecovery();
      stopHubTransport();
    };
  }, [hasHydrated]);

  // (Re)start the companion transport whenever a household is configured — the
  // launch-time call above no-ops when sharing isn't set up yet, so a mid-session
  // "Set up sharing" (or reset → re-setup) must trigger a fresh connect here.
  // startHubTransport() is idempotent while running; resetSharing() stops it.
  useEffect(() => {
    if (!hasHydrated || !householdId) return;
    startHubTransport().catch((err: any) => {
      console.error("[App] Failed to start hub transport:", err);
    });
  }, [hasHydrated, householdId]);

  // Gate: wait for store hydration, clean orphan data, then reveal app
  useEffect(() => {
    if (!hasHydrated) return;

    async function verifyAndReveal() {
      try {
        // Clean truly-orphaned data: events/lists whose owning member no longer
        // exists in the roster. Previously this also deleted data for members
        // whose feed had merely lost its `account` (e.g. expired Google token),
        // which silently destroyed manually-entered events on every startup.
        const store = useAppStore.getState();
        const existingMemberIds = new Set(store.members.map(m => m.id));
        const orphanEvents = store.events.filter(
          e => e.memberId && !existingMemberIds.has(e.memberId) && e.source === "manual"
        );
        if (orphanEvents.length > 0) {
          console.warn(
            `[App] Removing ${orphanEvents.length} manual event(s) belonging to deleted members.`
          );
          for (const e of orphanEvents) store.removeEvent(e.id);
        }
        const orphanLists = store.lists.filter(
          l => l.memberId && !existingMemberIds.has(l.memberId) && !l.syncEnabled
        );
        if (orphanLists.length > 0) {
          console.warn(
            `[App] Removing ${orphanLists.length} list(s) belonging to deleted members.`
          );
          for (const l of orphanLists) store.removeList(l.id);
        }
      } catch (err) {
        console.error("[App] Startup verification failed:", err);
      } finally {
        // Healthy-path duration. Distribution of this metric tells us how to
        // right-size HYDRATION_TIMEOUT_MS — see DEBT-035.
        trackAction("hydration_completed", {
          duration_ms: String(Date.now() - HYDRATION_START_MS),
        });
        setAppReady(true);
        await SplashScreen.hideAsync().catch(() => {});

        // Android 14+ no longer auto-grants SCHEDULE_EXACT_ALARM. Without it,
        // event reminders may fire up to ~10 minutes late. Show a one-time
        // explainer that points the user directly to the per-app toggle.
        // Now async because it queries native canScheduleExactAlarms() to
        // skip the prompt for users who already granted it.
        // See DEBT-041 / DEBT-042 / DEBT-043.
        const store = useAppStore.getState();
        maybeShowExactAlarmExplainer(
          store.exactAlarmPromptShown,
          () => store.setExactAlarmPromptShown(true),
        ).catch((err: unknown) => {
          console.error("[App] ExactAlarm explainer failed:", err);
        });
      }
    }

    verifyAndReveal();
  }, [hasHydrated]);

  // Battery monitor: start/restart when threshold set changes
  const batteryAlertPercents = useAppStore(s => s.batteryAlertPercents);
  const screenBrightnessVal = useAppStore(s => s.screenBrightness);

  // Stable key: the monitor only needs to restart when the *set* changes, not on reorderings.
  const thresholdsKey = [...batteryAlertPercents].sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!hasHydrated) return;
    if (batteryAlertPercents.length > 0) {
      startBatteryMonitor(batteryAlertPercents, (level) => {
        playBatteryAlert(level);
      });
    } else {
      stopBatteryMonitor();
    }
    return () => stopBatteryMonitor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, thresholdsKey]);

  // Restore saved brightness on startup
  useEffect(() => {
    if (!hasHydrated) return;
    setScreenBrightness(screenBrightnessVal).catch(() => {});
    // Startup-only restore; later brightness changes are applied where the user edits them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  if (!appReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar hidden />
      <AppNavigator />
    </GestureHandlerRootView>
  );
}

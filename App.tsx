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
import { StatusBar, AppState, AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import * as KeepAwake from "expo-keep-awake";

import AppNavigator from "./src/navigation/AppNavigator";
import { initGoogleSignIn } from "./src/services/CalendarSyncService";
import { setupNotificationChannel, requestNotificationPermissions } from "./src/services/NotificationService";
import { useAppStore } from "./src/store/appStore";
import { startBatteryMonitor, stopBatteryMonitor, playBatteryAlert } from "./src/services/BatteryService";
import { setScreenBrightness } from "./modules/app-manager";
import { performSync, loadCachedEventsOnStartup } from "./src/services/SyncOrchestrator";
import { startAlarmChecker, stopAlarmChecker } from "./src/services/AlarmService";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const hasHydrated  = useAppStore(s => s._hasHydrated);

  const [appReady, setAppReady] = useState(false);
  const appState = useRef(AppState.currentState);

  const keepAwakeEnabled = useAppStore(s => s.keepAwakeEnabled);

  // One-time SDK init (independent of hydration)
  useEffect(() => {
    initGoogleSignIn();
    setupNotificationChannel();
    requestNotificationPermissions();
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

  // Background Sync Timer: Every 30 minutes while app is running
  useEffect(() => {
    if (!hasHydrated) return;

    // Load local cache immediately for zero-wait UI
    loadCachedEventsOnStartup();
    
    // Trigger initial sync
    performSync();

    const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes — near real-time sync
    const interval = setInterval(() => {
      console.log("[App] Triggering scheduled 30-minute sync...");
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

    // Start alarm checker
    startAlarmChecker();

    return () => {
      clearInterval(interval);
      subscription.remove();
      stopAlarmChecker();
    };
  }, [hasHydrated]);

  // Gate: wait for store hydration, clean orphan data, then reveal app
  useEffect(() => {
    if (!hasHydrated) return;

    async function verifyAndReveal() {
      try {
        // Clean orphan seed data: remove events/lists for members with no linked feeds
        const store = useAppStore.getState();
        const memberIdsWithFeeds = new Set(
          store.feeds.filter(f => f.account).map(f => f.memberId).filter(Boolean)
        );
        const orphanEvents = store.events.filter(
          e => e.memberId && !memberIdsWithFeeds.has(e.memberId) && e.source === "manual"
        );
        for (const e of orphanEvents) store.removeEvent(e.id);
        const orphanLists = store.lists.filter(
          l => l.memberId && !memberIdsWithFeeds.has(l.memberId) && !l.syncEnabled
        );
        for (const l of orphanLists) store.removeList(l.id);
      } catch (err) {
        console.error("[App] Startup verification failed:", err);
      } finally {
        setAppReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    }

    verifyAndReveal();
  }, [hasHydrated]);

  // Battery monitor: start/restart when threshold changes
  const batteryAlertPercent = useAppStore(s => s.batteryAlertPercent);
  const screenBrightnessVal = useAppStore(s => s.screenBrightness);

  useEffect(() => {
    if (!hasHydrated) return;
    if (batteryAlertPercent > 0) {
      startBatteryMonitor(batteryAlertPercent, (level) => {
        playBatteryAlert(level);
      });
    } else {
      stopBatteryMonitor();
    }
    return () => stopBatteryMonitor();
  }, [hasHydrated, batteryAlertPercent]);

  // Restore saved brightness on startup
  useEffect(() => {
    if (!hasHydrated) return;
    setScreenBrightness(screenBrightnessVal).catch(() => {});
  }, [hasHydrated]);

  if (!appReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar hidden />
      <AppNavigator />
    </GestureHandlerRootView>
  );
}

/**
 * AlarmService.ts
 * Checks alarm schedules every 60 seconds and fires notifications + popups.
 */

import { Alert, AppState, AppStateStatus } from "react-native";
import { createAudioPlayer } from "expo-audio";
import * as Notifications from "expo-notifications";
import { useAppStore } from "../store/appStore";
import type { AlarmSchedule } from "../store/appStore";

let alarmTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

const SOUND_FILES: Record<string, number> = {
  chime: require("../../assets/sounds/chime.mp3"),
  bell: require("../../assets/sounds/bell.mp3"),
  alert: require("../../assets/sounds/alert.mp3"),
};

async function playAlarmSound(soundName?: string): Promise<void> {
  if (!soundName || soundName === "none") return;
  try {
    const file = SOUND_FILES[soundName];
    if (!file) return;
    const player = createAudioPlayer(file);
    player.play();
    // Release after 5 seconds
    setTimeout(() => { try { player.remove(); } catch {} }, 5000);
  } catch (err) {
    console.log("[AlarmService] Sound play failed:", err);
  }
}

function shouldFire(alarm: AlarmSchedule, now: Date): boolean {
  if (!alarm.enabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Prevent re-firing within same minute
  if (alarm.lastTriggered) {
    const lastFired = new Date(alarm.lastTriggered);
    if (lastFired.getHours() === now.getHours() && lastFired.getMinutes() === now.getMinutes()) {
      return false;
    }
  }

  if (alarm.type === "specific-time" && alarm.specificTime) {
    const [h, m] = alarm.specificTime.split(":").map(Number);
    const targetMinutes = h * 60 + m;
    if (currentMinutes !== targetMinutes) return false;
  } else if (alarm.type === "interval" && alarm.intervalHours) {
    const intervalMs = alarm.intervalHours * 60 * 60 * 1000;
    if (alarm.lastTriggered && (now.getTime() - alarm.lastTriggered) < intervalMs) {
      return false;
    }
    // First fire: always trigger
    if (!alarm.lastTriggered) return true;
  } else if (alarm.type === "random-window" && alarm.windowStart && alarm.windowEnd) {
    const [sh, sm] = alarm.windowStart.split(":").map(Number);
    const [eh, em] = alarm.windowEnd.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (currentMinutes < startMin || currentMinutes > endMin) return false;
    // Random chance each check (roughly once per window)
    const windowMinutes = endMin - startMin;
    if (Math.random() > 1 / windowMinutes) return false;
  }

  return true;
}

function checkAlarms(): void {
  const store = useAppStore.getState();
  const now = new Date();

  for (const alarm of store.alarms) {
    if (shouldFire(alarm, now)) {
      // Check if alarms are muted when locked
      if (store.isLocked && store.lockMuteAlarms) {
        // Still update lastTriggered but don't show popup or play sound
        store.updateAlarm(alarm.id, { lastTriggered: now.getTime() });
        if (alarm.recurrence === "once") store.updateAlarm(alarm.id, { enabled: false });
        continue;
      }

      // Play sound
      playAlarmSound(alarm.soundName);

      // Show popup notification
      const title = alarm.label || "Alarm";
      const body = alarm.message || "Time to check Family Hub!";

      // Native notification — only if notifications are enabled
      if (store.notificationsEnabled) {
        Notifications.scheduleNotificationAsync({
          content: { title, body, sound: true, data: { type: "alarm", alarmId: alarm.id } },
          trigger: null, // immediate
        }).catch(() => {});
      }

      // In-app alert popup
      Alert.alert(
        `⏰ ${title}`,
        body,
        [{ text: "OK" }]
      );

      // Update last triggered
      store.updateAlarm(alarm.id, { lastTriggered: now.getTime() });

      // Disable one-time alarms
      if (alarm.recurrence === "once") {
        store.updateAlarm(alarm.id, { enabled: false });
      }
    }
  }
}

export function startAlarmChecker(): void {
  if (alarmTimer) return;
  alarmTimer = setInterval(checkAlarms, 60_000);
  checkAlarms(); // initial check

  // Pause/resume based on app state to save battery
  appStateSubscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
    if (nextState === "active") {
      if (!alarmTimer) {
        alarmTimer = setInterval(checkAlarms, 60_000);
        checkAlarms(); // immediate check on resume
      }
    } else {
      if (alarmTimer) {
        clearInterval(alarmTimer);
        alarmTimer = null;
      }
    }
  });
}

export function stopAlarmChecker(): void {
  if (alarmTimer) {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

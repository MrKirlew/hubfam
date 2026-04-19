/**
 * BatteryService.ts
 * Monitors device battery level and fires alerts when it drops below a threshold.
 *
 * Owner: Alex
 * Dependencies: expo-battery, expo-av
 */

import * as Battery from "expo-battery";
import { createAudioPlayer } from "expo-audio";
import * as Notifications from "expo-notifications";

const POLL_INTERVAL_MS = 300_000; // check every 5 minutes (battery-efficient)
let pollTimer: ReturnType<typeof setInterval> | null = null;
let alertFired = false; // prevent repeated alerts until charged above threshold

/**
 * Get current battery info.
 */
export async function getBatteryInfo(): Promise<{ level: number; isCharging: boolean }> {
  const level = await Battery.getBatteryLevelAsync();
  const state = await Battery.getBatteryStateAsync();
  const isCharging =
    state === Battery.BatteryState.CHARGING ||
    state === Battery.BatteryState.FULL;
  return { level: Math.round(level * 100), isCharging };
}

/**
 * Start polling battery level. Fires onAlert when level drops below threshold.
 * @param thresholdPercent - Alert when battery drops below this (e.g. 20 = 20%)
 * @param onAlert - Callback fired once when threshold is crossed
 */
export function startBatteryMonitor(
  thresholdPercent: number,
  onAlert: (level: number) => void
): void {
  stopBatteryMonitor();
  if (thresholdPercent <= 0) return;

  alertFired = false;

  pollTimer = setInterval(async () => {
    try {
      const { level, isCharging } = await getBatteryInfo();

      // Reset alert flag if charging or back above threshold
      if (isCharging || level > thresholdPercent) {
        alertFired = false;
        return;
      }

      // Fire alert once when dropping below threshold
      if (level <= thresholdPercent && !alertFired) {
        alertFired = true;
        onAlert(level);
      }
    } catch {}
  }, POLL_INTERVAL_MS);
}

/**
 * Stop battery monitoring.
 */
export function stopBatteryMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Play the battery alert chime and show a notification.
 */
export async function playBatteryAlert(level: number): Promise<void> {
  try {
    const player = createAudioPlayer(require("../../assets/sounds/chime.mp3"));
    player.play();
    // Release after 5 seconds
    setTimeout(() => { try { player.remove(); } catch {} }, 5000);
  } catch {}

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Low Battery",
        body: `Battery is at ${level}%. Please plug in the device.`,
        sound: true,
      },
      trigger: null, // fire immediately
    });
  } catch {}
}

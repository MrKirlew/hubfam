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
let firedThresholds = new Set<number>(); // which thresholds have already fired this discharge cycle

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
 * Start polling battery level. Fires onAlert each time a configured threshold is crossed
 * on the way down. Each threshold fires at most once per discharge cycle; charging (or
 * climbing back above a threshold) re-arms it.
 *
 * @param thresholdPercents - List of thresholds, e.g. [30, 20, 10]. Empty = monitor disabled.
 * @param onAlert - Callback fired once per threshold crossing, receives (level, threshold)
 */
export function startBatteryMonitor(
  thresholdPercents: number[],
  onAlert: (level: number, threshold: number) => void
): void {
  stopBatteryMonitor();
  const thresholds = [...thresholdPercents].filter(n => n > 0).sort((a, b) => b - a); // high → low
  if (thresholds.length === 0) return;

  firedThresholds = new Set<number>();

  pollTimer = setInterval(async () => {
    try {
      const { level, isCharging } = await getBatteryInfo();

      if (isCharging) {
        firedThresholds.clear();
        return;
      }

      // Re-arm any threshold we've climbed back above (e.g. brief unplug during charge).
      for (const t of Array.from(firedThresholds)) {
        if (level > t) firedThresholds.delete(t);
      }

      // Fire each threshold we've just dropped below.
      for (const t of thresholds) {
        if (level <= t && !firedThresholds.has(t)) {
          firedThresholds.add(t);
          onAlert(level, t);
        }
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

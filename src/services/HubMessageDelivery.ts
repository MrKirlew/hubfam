import { useAppStore } from "../store/appStore";
import { playHubSound } from "./HubSound";
import type { HubMessage } from "@familyhub/shared";

// IDs whose sound/overlay effects have already fired (fire-once). Module-scoped,
// re-seeded on start via initHubDelivery so a restart doesn't replay old messages.
const fired = new Set<string>();

function isActive(m: HubMessage, now: number): boolean {
  return m.scheduledFor == null || m.scheduledFor <= now;
}

function fireEffects(m: HubMessage): void {
  if (fired.has(m.id)) return;
  fired.add(m.id);
  const store = useAppStore.getState();
  if (m.kind === "alert") store.setActiveAlertMessage(m);
  if (m.kind === "alert" || m.loud)
    playHubSound(m.kind === "alert" ? "alert" : "loud", { volume: m.soundVolume, seconds: m.soundSeconds });
}

/** A message arrived from a phone: store it, and fire effects if it's due now. */
export function deliverMessage(m: HubMessage): void {
  useAppStore.getState().addHubMessage(m);
  if (isActive(m, Date.now())) fireEffects(m);
}

/** On startup, mark already-active messages as fired so a restart doesn't replay them. */
export function initHubDelivery(): void {
  const now = Date.now();
  for (const m of useAppStore.getState().hubMessages) {
    if (isActive(m, now)) fired.add(m.id);
  }
}

/** Timer tick: activate scheduled messages whose delivery time has arrived. */
export function checkScheduledMessages(): void {
  const now = Date.now();
  for (const m of useAppStore.getState().hubMessages) {
    if (!fired.has(m.id) && isActive(m, now)) fireEffects(m);
  }
}

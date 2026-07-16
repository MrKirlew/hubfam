import type { RemoteCommand } from "@familyhub/shared";
import { useAppStore } from "../store/appStore";
import { navigationRef } from "../navigation/AppNavigator";

/**
 * Maps a companion "remote" command to hub navigation + store mutations.
 * Called by HubTransportService when a `remote` envelope arrives.
 */
export function handleRemoteCommand(cmd: RemoteCommand): void {
  const store = useAppStore.getState();
  switch (cmd.k) {
    case "navigate":
      if (navigationRef.isReady()) navigationRef.navigate(cmd.screen as never);
      break;
    case "flip-page":
      if (navigationRef.isReady()) navigationRef.navigate("Dashboard" as never);
      break;
    case "mark-chore":
      store.markCleaned(cmd.cleaningItemId, cmd.memberName || "Remote");
      break;
    case "push-sticky":
      store.addHubMessage({
        id: `sticky-${Date.now()}`,
        from: "remote",
        kind: "sticky",
        body: cmd.text,
        ts: Date.now(),
        recipient: "all",
      });
      break;
    case "snooze-alarm":
      // Acknowledge on the board; precise snooze semantics land with WS7.
      store.addHubMessage({
        id: `snooze-${cmd.alarmId}-${Date.now()}`,
        from: "remote",
        kind: "note",
        body: `Alarm snoozed ${cmd.minutes} min from a phone.`,
        ts: Date.now(),
        recipient: "all",
      });
      break;
  }
}

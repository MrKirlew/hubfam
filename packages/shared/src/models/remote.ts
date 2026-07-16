/**
 * Commands a companion phone can issue to drive the hub as a "remote".
 * The hub maps each to a navigation action or store mutation.
 */
export type RemoteCommand =
  | { k: "flip-page"; dir: "next" | "prev" }
  | { k: "navigate"; screen: string }
  | { k: "snooze-alarm"; alarmId: string; minutes: number }
  | { k: "mark-chore"; cleaningItemId: string; memberName?: string }
  | { k: "push-sticky"; text: string };

export type RemoteCommandKind = RemoteCommand["k"];

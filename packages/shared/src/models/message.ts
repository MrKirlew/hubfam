export type HubMessageKind = "note" | "alert" | "sticky";

/** "all" broadcasts to the hub board; otherwise a target deviceId or memberId. */
export type MessageRecipient = "all" | string;

/**
 * Weekly repeat schedule for a message: fire at `time` (24h "HH:mm", hub-local
 * clock) on each day in `days` (JS getDay numbering, 0 = Sunday). The message
 * stays on the board and re-fires its sound/alert each occurrence until
 * someone dismisses it on the hub, which ends the recurrence.
 */
export interface MessageRepeat {
  days: number[];
  time: string;
}

export interface HubMessage {
  id: string;
  /** Sender device id. */
  from: string;
  kind: HubMessageKind;
  title?: string;
  body: string;
  ts: number;
  recipient: MessageRecipient;
  /** Optional sticky-note color. */
  color?: string;
  /** Epoch ms after which the message auto-expires from the board. */
  expiresAt?: number | null;
  /** Play a sound on the hub when delivered (alerts always do; this makes a note loud too). */
  loud?: boolean;
  /** Hub sound playback volume, 0–1. Omitted = full volume. */
  soundVolume?: number;
  /** Repeat the hub sound for this many seconds (dismissing the message stops it early). Omitted = play once. */
  soundSeconds?: number;
  /** Epoch ms to deliver at; until then the message is held (hidden, no sound/overlay). */
  scheduledFor?: number | null;
  /** Weekly repeat: fire at repeat.time on each repeat.days weekday until dismissed. */
  repeat?: MessageRepeat | null;
}

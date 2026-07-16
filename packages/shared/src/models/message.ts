export type HubMessageKind = "note" | "alert" | "sticky";

/** "all" broadcasts to the hub board; otherwise a target deviceId or memberId. */
export type MessageRecipient = "all" | string;

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
  /** Epoch ms to deliver at; until then the message is held (hidden, no sound/overlay). */
  scheduledFor?: number | null;
}

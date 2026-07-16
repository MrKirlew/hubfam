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
}

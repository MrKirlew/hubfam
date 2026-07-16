/**
 * HubTransportService — wires the shared TransportRouter into the hub in "hub"
 * mode. Builds the cloud lane (CloudTransport → household Durable Object) when a
 * household is configured and a device token exists, and routes inbound
 * envelopes into the store. Idle until a phone is paired (WS5b/WS6). The BLE lane
 * (WS4) plugs in here alongside the cloud lane once the native module lands.
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  TransportRouter,
  CloudTransport,
  RelayClient,
  Outbox,
  Dedup,
  SessionCrypto,
  b64decode,
  type Envelope,
  type HubMessage,
  type ListOp,
  type RemoteCommand,
  type SealedPayload,
} from "@familyhub/shared";
import { useAppStore } from "../store/appStore";
import { asyncStorageKV } from "./kvAdapter";
import { handleRemoteCommand } from "./RemoteCommandHandler";
import { getCryptoProvider } from "./crypto";
import { deliverMessage } from "./HubMessageDelivery";

const RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL ?? "";
const DEVICE_TOKEN_KEY = "familyhub_device_token";
// Cursor is namespaced per household: a cursor carried over from a previous
// household (e.g. after "Reset sharing" onto a new relay) would otherwise make
// GET /state?since=<stale> skip everything the new household's DO holds — and
// the relay persists max(since, …) server-side, suppressing WS replay too.
export const CURSOR_KEY_PREFIX = "familyhub_cloud_cursor";
const cursorKeyFor = (householdId: string) => `${CURSOR_KEY_PREFIX}_${householdId}`;

let router: TransportRouter | null = null;
let cloud: CloudTransport | null = null;
let contentSession: SessionCrypto | null = null;
let cursor = 0;

async function routeInbound(env: Envelope): Promise<void> {
  const store = useAppStore.getState();
  let payload: unknown = env.payload;
  if (env.sealed) {
    if (!contentSession) return; // can't open without the content key
    try {
      payload = await contentSession.openJson(env.payload as SealedPayload);
    } catch {
      return; // undecryptable — drop
    }
  }
  if (env.kind === "message") {
    deliverMessage(payload as HubMessage);
  } else if (env.kind === "list-op") {
    store.applyHubListOp(payload as ListOp);
  } else if (env.kind === "remote") {
    handleRemoteCommand(payload as RemoteCommand);
  }
}

export async function startHubTransport(): Promise<void> {
  if (router) return; // already running
  const household = useAppStore.getState().household;
  if (!household || !RELAY_URL) {
    console.log("[HubTransport] Companion sharing not configured — idle.");
    return;
  }
  const deviceToken = await SecureStore.getItemAsync(DEVICE_TOKEN_KEY).catch(() => null);
  if (!deviceToken) {
    console.log("[HubTransport] No device token — pair a phone to enable sharing.");
    return;
  }

  const cursorKey = cursorKeyFor(household.id);
  cursor = Number((await AsyncStorage.getItem(cursorKey)) || "0");
  const contentKeyB64 = await SecureStore.getItemAsync("familyhub_content_key").catch(() => null);
  if (contentKeyB64) contentSession = new SessionCrypto(getCryptoProvider(), b64decode(contentKeyB64));
  const relay = new RelayClient({ baseUrl: RELAY_URL, fetchFn: fetch as any, deviceToken });

  cloud = new CloudTransport({
    householdId: household.id,
    deviceToken,
    wsUrl: `${RELAY_URL.replace(/^http/, "ws")}/household/${household.id}/ws`,
    wsFactory: (url) => new WebSocket(url) as any,
    relay,
    getCursor: () => cursor,
    setCursor: (s) => {
      cursor = s;
      void AsyncStorage.setItem(cursorKey, String(s));
    },
    reconnect: { baseMs: 1000, maxMs: 30000 },
  });

  const outbox = new Outbox(asyncStorageKV, "familyhub_outbox");
  await outbox.load();
  router = new TransportRouter({ cloud, outbox, dedup: new Dedup() });
  router.subscribe(routeInbound);
  await cloud.connect();
  console.log("[HubTransport] Cloud lane connecting for household", household.id);
}

export async function stopHubTransport(): Promise<void> {
  try {
    await cloud?.disconnect();
  } catch {
    /* ignore */
  }
  router?.dispose();
  router = null;
  cloud = null;
  contentSession = null;
  cursor = 0;
}

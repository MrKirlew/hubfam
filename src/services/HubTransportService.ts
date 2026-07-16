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
  type Envelope,
  type HubMessage,
  type ListOp,
  type RemoteCommand,
} from "@familyhub/shared";
import { useAppStore } from "../store/appStore";
import { asyncStorageKV } from "./kvAdapter";
import { handleRemoteCommand } from "./RemoteCommandHandler";

const RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL ?? "";
const DEVICE_TOKEN_KEY = "familyhub_device_token";
const CURSOR_KEY = "familyhub_cloud_cursor";

let router: TransportRouter | null = null;
let cloud: CloudTransport | null = null;
let cursor = 0;

function routeInbound(env: Envelope): void {
  const store = useAppStore.getState();
  // NOTE: payloads become AES-GCM sealed once the RN crypto provider lands
  // (WS5b); until then they are treated as plaintext objects.
  if (env.kind === "message") {
    store.addHubMessage(env.payload as HubMessage);
  } else if (env.kind === "list-op") {
    store.applyHubListOp(env.payload as ListOp);
  } else if (env.kind === "remote") {
    handleRemoteCommand(env.payload as RemoteCommand);
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

  cursor = Number((await AsyncStorage.getItem(CURSOR_KEY)) || "0");
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
      void AsyncStorage.setItem(CURSOR_KEY, String(s));
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
}

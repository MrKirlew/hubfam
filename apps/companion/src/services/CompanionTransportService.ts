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
  makeEnvelope,
  newId,
  type Envelope,
  type HubMessage,
} from "@familyhub/shared";
import { useCompanionStore } from "../store/companionStore";
import { getCryptoProvider } from "./crypto";
import { asyncStorageKV } from "./kv";
import { K_DEVICE_TOKEN, K_CONTENT_KEY, K_RELAY_URL, K_WS_URL } from "./PairingService";

const CURSOR_KEY = "familyhub_cloud_cursor";

let router: TransportRouter | null = null;
let cloud: CloudTransport | null = null;
let session: SessionCrypto | null = null;
let cursor = 0;
let householdId = "";
let deviceId = "";

/** Connect the cloud lane to the paired household's relay. Idle until paired. */
export async function startCompanionTransport(): Promise<void> {
  if (router) return;
  const st = useCompanionStore.getState();
  if (!st.paired || !st.householdId || !st.deviceId) return;
  householdId = st.householdId;
  deviceId = st.deviceId;

  const [deviceToken, contentKeyB64, relayUrl, wsUrl] = await Promise.all([
    SecureStore.getItemAsync(K_DEVICE_TOKEN),
    SecureStore.getItemAsync(K_CONTENT_KEY),
    SecureStore.getItemAsync(K_RELAY_URL),
    SecureStore.getItemAsync(K_WS_URL),
  ]);
  if (!deviceToken || !contentKeyB64 || !relayUrl || !wsUrl) return;

  session = new SessionCrypto(getCryptoProvider(), b64decode(contentKeyB64));
  cursor = Number((await AsyncStorage.getItem(CURSOR_KEY)) || "0");
  const relay = new RelayClient({ baseUrl: relayUrl, fetchFn: fetch as any, deviceToken });

  cloud = new CloudTransport({
    householdId,
    deviceToken,
    wsUrl,
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
  router.onStateChange((s) => useCompanionStore.getState().setConnection(s.effective));
  await cloud.connect();
  useCompanionStore.getState().setConnection(router.getState().effective);
}

export async function stopCompanionTransport(): Promise<void> {
  try {
    await cloud?.disconnect();
  } catch {
    /* ignore */
  }
  router?.dispose();
  router = null;
  cloud = null;
  session = null;
}

export interface SendOpts {
  kind?: "note" | "alert";
  loud?: boolean;
  scheduledFor?: number | null;
}

/** Send a message to the hub (sealed with the household content key). */
export async function sendMessage(text: string, opts: SendOpts = {}): Promise<void> {
  if (!router || !session) throw new Error("Not connected yet.");
  const now = Date.now();
  const msg: HubMessage = {
    id: newId(),
    from: useCompanionStore.getState().memberName || deviceId,
    kind: opts.kind ?? "note",
    body: text,
    ts: now,
    recipient: "all",
    loud: opts.loud || undefined,
    scheduledFor: opts.scheduledFor ?? undefined,
  };
  const sealed = await session.sealJson(msg);
  const env: Envelope = makeEnvelope(
    { household: householdId, from: deviceId, kind: "message", payload: sealed, sealed: true },
    newId(),
    now,
  );
  await router.send(env);
}

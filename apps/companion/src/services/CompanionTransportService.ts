import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  TransportRouter,
  CloudTransport,
  BleTransport,
  RelayClient,
  Outbox,
  Dedup,
  SessionCrypto,
  b64decode,
  makeEnvelope,
  newId,
  type Envelope,
  type HubMessage,
  type ListOp,
  type MessageRepeat,
  type Recipe,
  type SealedPayload,
} from "@familyhub/shared";
import { useCompanionStore } from "../store/companionStore";
import { getCryptoProvider } from "./crypto";
import { asyncStorageKV } from "./kv";
import { K_DEVICE_TOKEN, K_CONTENT_KEY, K_RELAY_URL, K_WS_URL, K_BLE_SECRET } from "./PairingService";
import { createCompanionBleLink } from "./BleCentralLink";

const CURSOR_KEY = "familyhub_cloud_cursor";

let router: TransportRouter | null = null;
let cloud: CloudTransport | null = null;
let ble: BleTransport | null = null;
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

  // BLE lane (WS4): a GATT central that scans for the paired hub, sealed with
  // the shared BLE session key. Optional — cloud is the primary lane.
  const bleSecretB64 = await SecureStore.getItemAsync(K_BLE_SECRET).catch(() => null);
  if (bleSecretB64) {
    try {
      const bleSession = await SessionCrypto.deriveFromSecret(
        getCryptoProvider(),
        b64decode(bleSecretB64),
        "familyhub-ble-session",
      );
      ble = new BleTransport({ link: createCompanionBleLink(), session: bleSession });
    } catch {
      ble = null;
    }
  }

  const outbox = new Outbox(asyncStorageKV, "familyhub_outbox");
  await outbox.load();
  router = new TransportRouter({ ble: ble ?? undefined, cloud, outbox, dedup: new Dedup() });
  router.onStateChange((s) => useCompanionStore.getState().setConnection(s.effective));
  router.subscribe((env) => void routeInbound(env));
  await cloud.connect();
  // Start scanning in the background; BLE failure must not affect the cloud lane.
  if (ble) void ble.connect().catch(() => {});
  useCompanionStore.getState().setConnection(router.getState().effective);
}

export async function stopCompanionTransport(): Promise<void> {
  try {
    await cloud?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    await ble?.disconnect();
  } catch {
    /* ignore */
  }
  ble?.dispose();
  router?.dispose();
  router = null;
  cloud = null;
  ble = null;
  session = null;
}

export interface SendOpts {
  kind?: "note" | "alert";
  loud?: boolean;
  /** Hub sound volume 0–1 (loud notes + alerts). */
  soundVolume?: number;
  /** Repeat the hub sound this many seconds; hub-side dismiss stops it early. */
  soundSeconds?: number;
  scheduledFor?: number | null;
  /** Weekly repeat: fire at repeat.time (24h "HH:mm") on each repeat.days weekday until dismissed on the hub. */
  repeat?: MessageRepeat | null;
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
    soundVolume: opts.soundVolume,
    soundSeconds: opts.soundSeconds,
    scheduledFor: opts.scheduledFor ?? undefined,
    repeat: opts.repeat ?? undefined,
  };
  const sealed = await session.sealJson(msg);
  const env: Envelope = makeEnvelope(
    { household: householdId, from: deviceId, kind: "message", payload: sealed, sealed: true },
    newId(),
    now,
  );
  await router.send(env);
}

/** Inbound list ops + recipes from the hub / other phones → apply to our store. */
async function routeInbound(env: Envelope): Promise<void> {
  if (env.kind !== "list-op" && env.kind !== "recipe") return;
  let payload: unknown;
  if (env.sealed) {
    if (!session) return;
    try {
      payload = await session.openJson(env.payload as SealedPayload);
    } catch {
      return;
    }
  } else {
    payload = env.payload;
  }
  const st = useCompanionStore.getState();
  if (env.kind === "list-op") st.applyListOp(payload as ListOp);
  else st.applyRecipe(payload as Recipe);
}

/** Apply a recipe upsert locally (optimistic) and send it (sealed) to the household. */
export async function sendRecipe(recipe: Recipe): Promise<void> {
  useCompanionStore.getState().applyRecipe(recipe);
  if (!router || !session) return; // not connected yet; local-only until reconnect
  const sealed = await session.sealJson(recipe);
  const env: Envelope = makeEnvelope(
    { household: householdId, from: deviceId, kind: "recipe", payload: sealed, sealed: true },
    newId(),
    Date.now(),
  );
  await router.send(env); // queues to the outbox if offline
}

/** Apply a shared-list op locally (optimistic) and send it (sealed) to the household. */
export async function sendListOp(op: ListOp): Promise<void> {
  useCompanionStore.getState().applyListOp(op);
  if (!router || !session) return; // not connected yet; local-only until reconnect
  const now = Date.now();
  const sealed = await session.sealJson(op);
  const env: Envelope = makeEnvelope(
    { household: householdId, from: deviceId, kind: "list-op", payload: sealed, sealed: true },
    newId(),
    now,
  );
  await router.send(env); // queues to the outbox if offline
}

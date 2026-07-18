/**
 * Companion-side BleLink (WS4): a GATT *central* over react-native-ble-plx. It
 * scans for the hub's household service, connects, subscribes to the NOTIFY
 * characteristic (inbound frames) and writes to the WRITE characteristic
 * (outbound). Framing + sealing are done by the shared BleTransport.
 */
import { Platform, PermissionsAndroid } from "react-native";
import { BleManager, State, type Device, type Subscription } from "react-native-ble-plx";
import {
  b64encode,
  b64decode,
  type BleLink,
  BLE_SERVICE_UUID,
  BLE_FRAME_WRITE_UUID,
  BLE_FRAME_NOTIFY_UUID,
} from "@familyhub/shared";

async function ensureCentralPermissions(): Promise<void> {
  if (Platform.OS !== "android") return; // iOS: usage descriptions in Info.plist
  if (typeof Platform.Version === "number" && Platform.Version >= 31) {
    const res = await PermissionsAndroid.requestMultiple([
      "android.permission.BLUETOOTH_SCAN" as any,
      "android.permission.BLUETOOTH_CONNECT" as any,
    ]);
    if (Object.values(res).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED)) {
      throw new Error("Bluetooth permission denied");
    }
  } else {
    const r = await PermissionsAndroid.request("android.permission.ACCESS_FINE_LOCATION" as any);
    if (r !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("Location permission denied");
  }
}

export function createCompanionBleLink(): BleLink {
  const manager = new BleManager();
  let device: Device | null = null;
  let monitorSub: Subscription | null = null;
  let stateSub: Subscription | null = null;
  let disconnectSub: Subscription | null = null;
  let connected = false;
  let running = false;
  const frameCbs = new Set<(f: Uint8Array) => void>();
  const connCbs = new Set<(c: boolean) => void>();

  function setConnected(c: boolean): void {
    if (connected === c) return;
    connected = c;
    for (const cb of connCbs) cb(c);
  }

  function scan(): void {
    if (!running || device) return;
    manager.startDeviceScan([BLE_SERVICE_UUID], null, (error, dev) => {
      if (error || !dev) return;
      manager.stopDeviceScan();
      void connectTo(dev);
    });
  }

  async function connectTo(dev: Device): Promise<void> {
    try {
      const d = await dev.connect();
      await d.discoverAllServicesAndCharacteristics();
      try {
        await d.requestMTU(247);
      } catch {
        /* MTU bump is best-effort */
      }
      device = d;
      monitorSub = d.monitorCharacteristicForService(BLE_SERVICE_UUID, BLE_FRAME_NOTIFY_UUID, (err, ch) => {
        if (err || !ch?.value) return;
        const bytes = b64decode(ch.value);
        for (const cb of frameCbs) cb(bytes);
      });
      disconnectSub = d.onDisconnected(() => {
        setConnected(false);
        device = null;
        monitorSub?.remove();
        monitorSub = null;
        if (running) scan();
      });
      setConnected(true);
    } catch {
      device = null;
      if (running) scan();
    }
  }

  return {
    async start() {
      if (running) return;
      await ensureCentralPermissions();
      running = true;
      stateSub = manager.onStateChange((s) => {
        if (s === State.PoweredOn) scan();
      }, true);
    },
    async stop() {
      running = false;
      try {
        manager.stopDeviceScan();
      } catch {
        /* ignore */
      }
      stateSub?.remove();
      stateSub = null;
      disconnectSub?.remove();
      disconnectSub = null;
      monitorSub?.remove();
      monitorSub = null;
      if (device) {
        try {
          await device.cancelConnection();
        } catch {
          /* ignore */
        }
      }
      device = null;
      setConnected(false);
    },
    isConnected() {
      return connected;
    },
    async sendFrame(frame: Uint8Array) {
      const d = device;
      if (!d) throw new Error("BLE not connected");
      await d.writeCharacteristicWithoutResponseForService(BLE_SERVICE_UUID, BLE_FRAME_WRITE_UUID, b64encode(frame));
    },
    onFrame(cb: (frame: Uint8Array) => void) {
      frameCbs.add(cb);
      return () => frameCbs.delete(cb);
    },
    onConnectionChange(cb: (connected: boolean) => void) {
      connCbs.add(cb);
      return () => connCbs.delete(cb);
    },
  };
}

/**
 * Fixed GATT UUIDs for the FamilyHub BLE lane. The service UUID matches the one
 * put in the pairing payload (PairingService SERVICE_UUID); the two
 * characteristics carry MTU-sized transport frames in each direction. Hub
 * (peripheral) and companion (central) both import these so they can't drift.
 */

/** The FamilyHub GATT service the hub advertises and the companion filters on.
 * Must match the serviceUuid placed in the pairing payload (PairingService). */
export const BLE_SERVICE_UUID = "0000fae1-0000-1000-8000-00805f9b34fb";

/** Frames written by the central (companion) → peripheral (hub). Write / WriteNoResponse. */
export const BLE_FRAME_WRITE_UUID = "0000fae2-0000-1000-8000-00805f9b34fb";

/** Frames notified by the peripheral (hub) → central (companion). Notify. */
export const BLE_FRAME_NOTIFY_UUID = "0000fae3-0000-1000-8000-00805f9b34fb";

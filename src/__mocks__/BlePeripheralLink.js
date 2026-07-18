// Jest mock: the real BlePeripheralLink imports react-native + the native BLE
// module (no Node runtime). Its behaviour is covered by the shared BleTransport
// tests; here we only need a stub BleLink so HubTransportService loads.
module.exports = {
  createHubBleLink: () => ({
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    isConnected: () => false,
    sendFrame: () => Promise.resolve(),
    onFrame: () => () => {},
    onConnectionChange: () => () => {},
  }),
};

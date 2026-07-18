// Jest mock for the native expo-ble-peripheral module (no native runtime in Node).
module.exports = {
  startPeripheral: jest.fn(() => Promise.resolve()),
  stopPeripheral: jest.fn(() => Promise.resolve()),
  isCentralConnected: jest.fn(() => false),
  sendFrameBase64: jest.fn(() => Promise.resolve()),
  addFrameListener: jest.fn(() => ({ remove: jest.fn() })),
  addConnectionListener: jest.fn(() => ({ remove: jest.fn() })),
};

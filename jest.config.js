module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  // Scope discovery to the hub app so sibling workspace packages
  // (packages/shared, relay-worker) run under their own jest configs, not this one.
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  moduleNameMapper: {
    "^@react-native-async-storage/async-storage$": "<rootDir>/src/__mocks__/async-storage.js",
    "^expo-secure-store$": "<rootDir>/src/__mocks__/expo-secure-store.js",
    "^react-native-calendar-events$": "<rootDir>/src/__mocks__/react-native-calendar-events.js",
    "^@react-native-google-signin/google-signin$": "<rootDir>/src/__mocks__/google-signin.js",
    "^expo-notifications$": "<rootDir>/src/__mocks__/expo-notifications.js",
    "^expo-device$": "<rootDir>/src/__mocks__/expo-device.js",
    "^expo-application$": "<rootDir>/src/__mocks__/expo-application.js",
    "^.*/modules/ble-peripheral$": "<rootDir>/src/__mocks__/ble-peripheral.js",
    "^.*/BlePeripheralLink$": "<rootDir>/src/__mocks__/BlePeripheralLink.js",
  },
  collectCoverageFrom: [
    "src/services/**/*.ts",
    "src/store/**/*.ts",
    "!src/**/__mocks__/**",
  ],
  // Ratchet floor: set just below actual coverage (38.4/26.3/38.1/38.3 as of
  // 2026-07-16) so CI fails on regression. Raise as coverage grows (DEBT-030).
  coverageThreshold: {
    global: {
      branches: 26,
      functions: 30,
      lines: 38,
      statements: 38,
    },
  },
};

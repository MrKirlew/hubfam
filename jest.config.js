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
  },
  collectCoverageFrom: [
    "src/services/**/*.ts",
    "src/store/**/*.ts",
    "!src/**/__mocks__/**",
  ],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 40,
      statements: 40,
    },
  },
};

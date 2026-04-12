module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  testPathPattern: "src/__tests__/.*\\.test\\.ts$",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  moduleNameMapper: {
    "^@react-native-async-storage/async-storage$": "<rootDir>/src/__mocks__/async-storage.js",
  },
};

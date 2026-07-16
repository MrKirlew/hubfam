module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2022",
          module: "CommonJS",
          moduleResolution: "node",
          lib: ["ES2022", "DOM"],
          types: ["jest", "node"],
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },
};

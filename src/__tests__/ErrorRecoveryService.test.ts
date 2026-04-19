/**
 * ErrorRecoveryService.test.ts
 *
 * Tests for failure recording, exponential backoff, resolution, and convenience wrappers.
 */

// Mock dependencies before importing
jest.mock("../services/AnalyticsService", () => ({
  captureError: jest.fn(),
}));
jest.mock("../services/SyncOrchestrator", () => ({
  performSync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("react-native", () => ({
  AppState: {
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    currentState: "active",
  },
}));

import {
  recordFailure,
  markResolved,
  isFailingKey,
  getFailureSummary,
  onSyncFailure,
  onAuthFailure,
  onNetworkFailure,
  onWeatherFailure,
} from "../services/ErrorRecoveryService";

// Clear failure state between tests by resolving all keys
function clearFailures() {
  for (const { key } of getFailureSummary()) {
    markResolved(key);
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  clearFailures();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ErrorRecoveryService", () => {
  describe("recordFailure", () => {
    it("records a failure and marks the key as failing", () => {
      recordFailure("test:key", new Error("test error"));
      expect(isFailingKey("test:key")).toBe(true);
    });

    it("increments failure count on repeated calls", () => {
      recordFailure("test:inc", new Error("first"));
      recordFailure("test:inc", new Error("second"));
      const summary = getFailureSummary();
      const entry = summary.find(s => s.key === "test:inc");
      expect(entry).toBeDefined();
      expect(entry!.count).toBe(2);
    });

    it("caps at MAX_RETRIES (5) and stops incrementing", () => {
      for (let i = 0; i < 8; i++) {
        recordFailure("test:cap", new Error(`attempt ${i}`));
      }
      const summary = getFailureSummary();
      const entry = summary.find(s => s.key === "test:cap");
      expect(entry).toBeDefined();
      expect(entry!.count).toBe(5); // capped at 5
    });

    it("schedules a recovery action with exponential backoff", () => {
      const recoveryAction = jest.fn().mockResolvedValue(undefined);
      recordFailure("test:recover", new Error("fail"), recoveryAction);

      // Recovery not called yet (delayed)
      expect(recoveryAction).not.toHaveBeenCalled();

      // Advance past the first backoff (5000ms)
      jest.advanceTimersByTime(6000);

      // The recovery action should have been scheduled
      expect(recoveryAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("markResolved", () => {
    it("marks a failure as resolved", () => {
      recordFailure("test:resolve", new Error("fail"));
      expect(isFailingKey("test:resolve")).toBe(true);

      markResolved("test:resolve");
      expect(isFailingKey("test:resolve")).toBe(false);
    });

    it("resets the failure count", () => {
      recordFailure("test:reset", new Error("fail"));
      recordFailure("test:reset", new Error("fail again"));
      markResolved("test:reset");

      // After resolution, re-recording starts at count 1
      recordFailure("test:reset", new Error("new fail"));
      const summary = getFailureSummary();
      const entry = summary.find(s => s.key === "test:reset");
      expect(entry).toBeDefined();
      expect(entry!.count).toBe(1);
    });
  });

  describe("isFailingKey", () => {
    it("returns false for unknown keys", () => {
      expect(isFailingKey("nonexistent")).toBe(false);
    });

    it("returns true for active failures", () => {
      recordFailure("test:active", new Error("fail"));
      expect(isFailingKey("test:active")).toBe(true);
    });

    it("returns false after resolution", () => {
      recordFailure("test:resolved", new Error("fail"));
      markResolved("test:resolved");
      expect(isFailingKey("test:resolved")).toBe(false);
    });
  });

  describe("getFailureSummary", () => {
    it("returns empty array when no failures", () => {
      expect(getFailureSummary()).toEqual([]);
    });

    it("returns only unresolved failures", () => {
      recordFailure("test:a", new Error("a"));
      recordFailure("test:b", new Error("b"));
      markResolved("test:a");

      const summary = getFailureSummary();
      expect(summary).toHaveLength(1);
      expect(summary[0].key).toBe("test:b");
    });

    it("includes count and lastAttempt", () => {
      recordFailure("test:detail", new Error("fail"));
      const summary = getFailureSummary();
      expect(summary[0]).toHaveProperty("key", "test:detail");
      expect(summary[0]).toHaveProperty("count", 1);
      expect(summary[0]).toHaveProperty("lastAttempt");
      expect(summary[0].lastAttempt).toBeGreaterThan(0);
    });
  });

  describe("convenience wrappers", () => {
    it("onSyncFailure records under sync:calendar key", () => {
      onSyncFailure(new Error("sync failed"));
      expect(isFailingKey("sync:calendar")).toBe(true);
    });

    it("onAuthFailure records under auth:{email} key", () => {
      onAuthFailure("user@example.com", new Error("auth failed"));
      expect(isFailingKey("auth:user@example.com")).toBe(true);
    });

    it("onNetworkFailure records under network:{operation} key", () => {
      onNetworkFailure("calendarList", new Error("network error"));
      expect(isFailingKey("network:calendarList")).toBe(true);
    });

    it("onWeatherFailure records under weather:fetch key", () => {
      onWeatherFailure(new Error("weather failed"));
      expect(isFailingKey("weather:fetch")).toBe(true);
    });
  });
});

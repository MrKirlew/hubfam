/**
 * PinService.test.ts
 *
 * Tests for secure PIN hashing, verification, brute-force lockout, and migration.
 */

// Mock TextEncoder for Node.js test environment
if (typeof TextEncoder === "undefined") {
  const { TextEncoder: TE } = require("util");
  (global as any).TextEncoder = TE;
}

import {
  setHubPinSecure,
  verifyHubPin,
  hasHubPin,
  clearHubPin,
  isLockedOut,
  getLockoutRemainingMs,
  resetAttempts,
  isDigitsOnly,
  migrateIfNeeded,
} from "../services/PinService";

// Reset SecureStore mock between tests
const SecureStore = require("expo-secure-store");

beforeEach(() => {
  SecureStore.__reset();
  resetAttempts();
});

describe("PinService", () => {
  describe("isDigitsOnly", () => {
    it("accepts valid digit strings", () => {
      expect(isDigitsOnly("0")).toBe(true);
      expect(isDigitsOnly("1234")).toBe(true);
      expect(isDigitsOnly("0000")).toBe(true);
      expect(isDigitsOnly("9876543210")).toBe(true);
    });

    it("rejects non-digit strings", () => {
      expect(isDigitsOnly("")).toBe(false);
      expect(isDigitsOnly("abc")).toBe(false);
      expect(isDigitsOnly("12a4")).toBe(false);
      expect(isDigitsOnly("12 4")).toBe(false);
      expect(isDigitsOnly("12.4")).toBe(false);
    });
  });

  describe("setHubPinSecure + verifyHubPin", () => {
    it("stores and verifies a PIN correctly", async () => {
      await setHubPinSecure("1234");
      const match = await verifyHubPin("1234");
      expect(match).toBe(true);
    });

    it("rejects an incorrect PIN", async () => {
      await setHubPinSecure("1234");
      const match = await verifyHubPin("5678");
      expect(match).toBe(false);
    });

    it("works with different PINs", async () => {
      await setHubPinSecure("9999");
      expect(await verifyHubPin("9999")).toBe(true);
      expect(await verifyHubPin("0000")).toBe(false);
    });
  });

  describe("hasHubPin", () => {
    it("returns false when no PIN is set", async () => {
      expect(await hasHubPin()).toBe(false);
    });

    it("returns true after setting a PIN", async () => {
      await setHubPinSecure("1234");
      expect(await hasHubPin()).toBe(true);
    });
  });

  describe("clearHubPin", () => {
    it("removes the PIN from SecureStore", async () => {
      await setHubPinSecure("1234");
      expect(await hasHubPin()).toBe(true);

      await clearHubPin();
      expect(await hasHubPin()).toBe(false);
    });

    it("verify returns false after clearing", async () => {
      await setHubPinSecure("1234");
      await clearHubPin();
      expect(await verifyHubPin("1234")).toBe(false);
    });
  });

  describe("brute-force lockout", () => {
    it("allows attempts under the limit", async () => {
      await setHubPinSecure("1234");
      for (let i = 0; i < 4; i++) {
        await verifyHubPin("0000");
      }
      expect(isLockedOut()).toBe(false);
    });

    it("locks out after 5 wrong attempts", async () => {
      await setHubPinSecure("1234");
      for (let i = 0; i < 5; i++) {
        await verifyHubPin("0000");
      }
      expect(isLockedOut()).toBe(true);
      expect(getLockoutRemainingMs()).toBeGreaterThan(0);
    });

    it("rejects correct PIN while locked out", async () => {
      await setHubPinSecure("1234");
      for (let i = 0; i < 5; i++) {
        await verifyHubPin("0000");
      }
      const match = await verifyHubPin("1234");
      expect(match).toBe(false);
    });

    it("resets lockout after resetAttempts()", async () => {
      await setHubPinSecure("1234");
      for (let i = 0; i < 5; i++) {
        await verifyHubPin("0000");
      }
      expect(isLockedOut()).toBe(true);
      resetAttempts();
      expect(isLockedOut()).toBe(false);
      expect(await verifyHubPin("1234")).toBe(true);
    });

    it("resets lockout counter on successful PIN", async () => {
      await setHubPinSecure("1234");
      for (let i = 0; i < 3; i++) {
        await verifyHubPin("0000");
      }
      await verifyHubPin("1234"); // resets counter
      for (let i = 0; i < 4; i++) {
        await verifyHubPin("0000");
      }
      expect(isLockedOut()).toBe(false);
    });
  });

  describe("migrateIfNeeded", () => {
    it("migrates a plaintext PIN to SecureStore", async () => {
      expect(await hasHubPin()).toBe(false);
      await migrateIfNeeded("5678");
      expect(await hasHubPin()).toBe(true);
      expect(await verifyHubPin("5678")).toBe(true);
    });

    it("does nothing for null PIN", async () => {
      await migrateIfNeeded(null);
      expect(await hasHubPin()).toBe(false);
    });

    it("does nothing for 'SECURE' sentinel", async () => {
      await migrateIfNeeded("SECURE");
      expect(await hasHubPin()).toBe(false);
    });
  });
});

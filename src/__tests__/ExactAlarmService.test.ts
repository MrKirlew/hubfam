/**
 * ExactAlarmService.test.ts
 *
 * Verifies the gating + ordering rules for the Android 14+ exact-alarm
 * explainer (DEBT-041) plus the v3 enhancements:
 *   - native canScheduleExactAlarms() short-circuit (DEBT-042)
 *   - IntentLauncher per-app deeplink as the preferred Open-Settings path
 *     with sendIntent + openSettings as graceful fallbacks (DEBT-043)
 */

// Mutable Platform mock so individual tests can pin OS + API level.
const mockPlatform = { OS: "android" as "android" | "ios", Version: 31 as number };
const mockAlert = jest.fn();
const mockSendIntent = jest.fn().mockResolvedValue(undefined);
const mockOpenSettings = jest.fn().mockResolvedValue(undefined);
const mockStartActivityAsync = jest.fn().mockResolvedValue(undefined);
const mockCanScheduleExactAlarms = jest.fn().mockResolvedValue(false);

jest.mock("react-native", () => ({
  Platform: mockPlatform,
  Alert:    { alert: mockAlert },
  Linking:  { sendIntent: mockSendIntent, openSettings: mockOpenSettings },
}));

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: (action: string, opts: object) =>
    mockStartActivityAsync(action, opts),
}));

jest.mock("../../modules/app-manager", () => ({
  canScheduleExactAlarms: () => mockCanScheduleExactAlarms(),
}));

import { maybeShowExactAlarmExplainer } from "../services/ExactAlarmService";

beforeEach(() => {
  mockPlatform.OS = "android";
  mockPlatform.Version = 31;
  mockAlert.mockClear();
  mockSendIntent.mockClear().mockResolvedValue(undefined);
  mockOpenSettings.mockClear().mockResolvedValue(undefined);
  mockStartActivityAsync.mockClear().mockResolvedValue(undefined);
  mockCanScheduleExactAlarms.mockClear().mockResolvedValue(false);
});

describe("maybeShowExactAlarmExplainer", () => {
  it("does nothing on iOS", async () => {
    mockPlatform.OS = "ios";
    const mark = jest.fn();
    await maybeShowExactAlarmExplainer(false, mark);
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockCanScheduleExactAlarms).not.toHaveBeenCalled();
    expect(mark).not.toHaveBeenCalled();
  });

  it("does nothing on Android < API 31", async () => {
    mockPlatform.Version = 30;
    const mark = jest.fn();
    await maybeShowExactAlarmExplainer(false, mark);
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockCanScheduleExactAlarms).not.toHaveBeenCalled();
    expect(mark).not.toHaveBeenCalled();
  });

  it("does nothing if the prompt has already been shown", async () => {
    const mark = jest.fn();
    await maybeShowExactAlarmExplainer(true, mark);
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockCanScheduleExactAlarms).not.toHaveBeenCalled();
    expect(mark).not.toHaveBeenCalled();
  });

  it("skips the prompt and marks shown when permission is already granted (DEBT-042)", async () => {
    mockCanScheduleExactAlarms.mockResolvedValueOnce(true);
    const mark = jest.fn();
    await maybeShowExactAlarmExplainer(false, mark);
    expect(mockCanScheduleExactAlarms).toHaveBeenCalledTimes(1);
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it("falls back to showing the prompt if the native check fails", async () => {
    mockCanScheduleExactAlarms.mockRejectedValueOnce(new Error("native unavailable"));
    const mark = jest.fn();
    await maybeShowExactAlarmExplainer(false, mark);
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it("shows the alert AND marks shown when permission is not granted", async () => {
    const mark = jest.fn();
    await maybeShowExactAlarmExplainer(false, mark);
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it("calls Alert.alert BEFORE markPromptShown so an alert crash re-prompts", async () => {
    mockAlert.mockImplementationOnce(() => {
      throw new Error("simulated bridge failure");
    });
    const mark = jest.fn();
    await expect(
      maybeShowExactAlarmExplainer(false, mark),
    ).rejects.toThrow("simulated bridge failure");
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mark).not.toHaveBeenCalled();
  });

  it("Open Settings prefers IntentLauncher with the per-app data URI (DEBT-043)", async () => {
    let capturedOnPress: (() => void) | undefined;
    mockAlert.mockImplementationOnce((_title, _msg, buttons) => {
      capturedOnPress = buttons?.[1]?.onPress;
    });
    await maybeShowExactAlarmExplainer(false, jest.fn());
    expect(typeof capturedOnPress).toBe("function");

    capturedOnPress!();
    await new Promise((r) => setImmediate(r));

    expect(mockStartActivityAsync).toHaveBeenCalledWith(
      "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
      { data: "package:com.familyhub.app" },
    );
    expect(mockSendIntent).not.toHaveBeenCalled();
    expect(mockOpenSettings).not.toHaveBeenCalled();
  });

  it("falls back to Linking.sendIntent when IntentLauncher rejects", async () => {
    mockStartActivityAsync.mockRejectedValueOnce(new Error("activity not found"));

    let capturedOnPress: (() => void) | undefined;
    mockAlert.mockImplementationOnce((_title, _msg, buttons) => {
      capturedOnPress = buttons?.[1]?.onPress;
    });
    await maybeShowExactAlarmExplainer(false, jest.fn());

    capturedOnPress!();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mockStartActivityAsync).toHaveBeenCalledTimes(1);
    expect(mockSendIntent).toHaveBeenCalledWith("android.settings.REQUEST_SCHEDULE_EXACT_ALARM");
    expect(mockOpenSettings).not.toHaveBeenCalled();
  });

  it("falls back to Linking.openSettings when both prior paths reject", async () => {
    mockStartActivityAsync.mockRejectedValueOnce(new Error("activity not found"));
    mockSendIntent.mockRejectedValueOnce(new Error("intent not handled"));

    let capturedOnPress: (() => void) | undefined;
    mockAlert.mockImplementationOnce((_title, _msg, buttons) => {
      capturedOnPress = buttons?.[1]?.onPress;
    });
    await maybeShowExactAlarmExplainer(false, jest.fn());

    capturedOnPress!();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});

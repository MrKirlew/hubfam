import { deliverMessage, checkScheduledMessages, initHubDelivery } from "../services/HubMessageDelivery";
import { playHubSound } from "../services/HubSound";
import type { HubMessage } from "@familyhub/shared";

jest.mock("../services/HubSound", () => ({
  playHubSound: jest.fn(),
  stopHubSound: jest.fn(),
}));

const addHubMessage = jest.fn();
const setActiveAlertMessage = jest.fn();
let hubMessages: HubMessage[] = [];

jest.mock("../store/appStore", () => ({
  useAppStore: {
    getState: () => ({ addHubMessage, setActiveAlertMessage, hubMessages }),
  },
}));

function msg(partial: Partial<HubMessage>): HubMessage {
  return {
    id: `id-${Math.random()}`,
    from: "phone-1",
    kind: "note",
    body: "hello",
    ts: Date.now(),
    recipient: "all",
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  hubMessages = [];
});

describe("HubMessageDelivery sound options", () => {
  it("passes volume + seconds through for a loud note", () => {
    deliverMessage(msg({ loud: true, soundVolume: 0.5, soundSeconds: 30 }));
    expect(playHubSound).toHaveBeenCalledWith("loud", { volume: 0.5, seconds: 30 });
  });

  it("passes volume + seconds through for an alert", () => {
    deliverMessage(msg({ kind: "alert", soundVolume: 0.25, soundSeconds: 10 }));
    expect(setActiveAlertMessage).toHaveBeenCalled();
    expect(playHubSound).toHaveBeenCalledWith("alert", { volume: 0.25, seconds: 10 });
  });

  it("defaults are undefined (hub plays once at full volume)", () => {
    deliverMessage(msg({ loud: true }));
    expect(playHubSound).toHaveBeenCalledWith("loud", { volume: undefined, seconds: undefined });
  });

  it("plain note plays no sound", () => {
    deliverMessage(msg({}));
    expect(playHubSound).not.toHaveBeenCalled();
  });

  it("scheduled-future message is stored silently, fires once due", () => {
    const m = msg({ loud: true, soundVolume: 0.75, soundSeconds: 60, scheduledFor: Date.now() + 60_000 });
    deliverMessage(m);
    expect(addHubMessage).toHaveBeenCalledWith(m);
    expect(playHubSound).not.toHaveBeenCalled();

    hubMessages = [{ ...m, scheduledFor: Date.now() - 1000 }];
    checkScheduledMessages();
    expect(playHubSound).toHaveBeenCalledWith("loud", { volume: 0.75, seconds: 60 });

    checkScheduledMessages(); // fire-once
    expect(playHubSound).toHaveBeenCalledTimes(1);
  });
});

describe("weekly-repeat messages", () => {
  // Pin "now" so day/time math is deterministic: Wed 2026-07-15 19:30:10 local.
  const WED_1930 = new Date(2026, 6, 15, 19, 30, 10).getTime();
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(WED_1930);
  });
  afterEach(() => {
    nowSpy.mockRestore();
  });

  const repeatMsg = (over: Partial<HubMessage> = {}) =>
    msg({ loud: true, repeat: { days: [3, 6], time: "19:30" }, ...over }); // Wed + Sat

  it("does not fire on arrival, even inside the scheduled window", () => {
    deliverMessage(repeatMsg());
    expect(playHubSound).not.toHaveBeenCalled();
  });

  it("fires on the tick inside the window on a scheduled day, once per occurrence", () => {
    hubMessages = [repeatMsg()];
    checkScheduledMessages();
    expect(playHubSound).toHaveBeenCalledTimes(1);
    checkScheduledMessages(); // same occurrence — no re-fire
    expect(playHubSound).toHaveBeenCalledTimes(1);
  });

  it("does not fire on a day that isn't scheduled", () => {
    hubMessages = [repeatMsg({ repeat: { days: [5], time: "19:30" } })]; // Friday only
    checkScheduledMessages();
    expect(playHubSound).not.toHaveBeenCalled();
  });

  it("does not fire outside the time window", () => {
    hubMessages = [repeatMsg({ repeat: { days: [3], time: "21:00" } })]; // later today
    checkScheduledMessages();
    expect(playHubSound).not.toHaveBeenCalled();
  });

  it("fires again on the next scheduled day (new occurrence key)", () => {
    hubMessages = [repeatMsg()];
    checkScheduledMessages();
    expect(playHubSound).toHaveBeenCalledTimes(1);
    // Saturday 19:30:10 — the other scheduled day.
    nowSpy.mockReturnValue(new Date(2026, 6, 18, 19, 30, 10).getTime());
    checkScheduledMessages();
    expect(playHubSound).toHaveBeenCalledTimes(2);
  });

  it("repeat alert raises the overlay at the occurrence", () => {
    hubMessages = [repeatMsg({ kind: "alert", loud: undefined })];
    checkScheduledMessages();
    expect(setActiveAlertMessage).toHaveBeenCalled();
    expect(playHubSound).toHaveBeenCalledWith("alert", { volume: undefined, seconds: undefined });
  });

  it("initHubDelivery seeds today's past occurrence so a hub restart doesn't replay it", () => {
    hubMessages = [repeatMsg()];
    initHubDelivery();
    checkScheduledMessages();
    expect(playHubSound).not.toHaveBeenCalled();
  });

  it("ignores a malformed repeat time", () => {
    hubMessages = [repeatMsg({ repeat: { days: [3], time: "25:99" } })];
    checkScheduledMessages();
    expect(playHubSound).not.toHaveBeenCalled();
  });
});

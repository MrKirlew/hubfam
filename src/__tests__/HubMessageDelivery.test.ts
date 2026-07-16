import { deliverMessage, checkScheduledMessages } from "../services/HubMessageDelivery";
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

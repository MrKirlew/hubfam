import { useAppStore } from "../store/appStore";
import type { HubMessage, ListOp } from "@familyhub/shared";

function msg(id: string, kind: HubMessage["kind"] = "note"): HubMessage {
  return { id, from: "phone", kind, body: "hi " + id, ts: Date.now(), recipient: "all" };
}

describe("hub messaging store actions (WS5)", () => {
  beforeEach(() => {
    useAppStore.setState({ hubMessages: [], activeAlertMessage: null, sharedLists: [] });
  });

  it("adds messages idempotently, newest first, capped at 50", () => {
    const { addHubMessage } = useAppStore.getState();
    addHubMessage(msg("a"));
    addHubMessage(msg("a")); // duplicate id ignored
    expect(useAppStore.getState().hubMessages).toHaveLength(1);
    addHubMessage(msg("b"));
    expect(useAppStore.getState().hubMessages[0].id).toBe("b"); // newest first
    for (let i = 0; i < 60; i++) addHubMessage(msg("m" + i));
    expect(useAppStore.getState().hubMessages).toHaveLength(50);
  });

  it("an alert message raises the overlay; dismiss clears both", () => {
    const { addHubMessage, dismissHubMessage } = useAppStore.getState();
    addHubMessage(msg("al", "alert"));
    expect(useAppStore.getState().activeAlertMessage?.id).toBe("al");
    dismissHubMessage("al");
    expect(useAppStore.getState().activeAlertMessage).toBeNull();
    expect(useAppStore.getState().hubMessages.find((m) => m.id === "al")).toBeUndefined();
  });

  it("applyHubListOp reconciles shared lists via the shared LWW reducer", () => {
    const { applyHubListOp } = useAppStore.getState();
    applyHubListOp({ k: "create-list", opId: "o1", listId: "L1", ts: 1, deviceId: "d1", name: "Groceries" });
    expect(useAppStore.getState().sharedLists[0].name).toBe("Groceries");
    const add: ListOp = {
      k: "add-item",
      opId: "o2",
      listId: "L1",
      ts: 2,
      deviceId: "d1",
      item: { id: "i1", text: "milk", done: false, updatedAt: 2 },
    };
    applyHubListOp(add);
    expect(useAppStore.getState().sharedLists[0].items[0].text).toBe("milk");
  });
});

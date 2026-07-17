/**
 * HubTransportService — transport-less behaviour: recipes saved on the tablet
 * must land in the store (and stay LWW-correct) even when sharing is not set
 * up, and start/stop must no-op cleanly without a household.
 */
jest.mock("../services/RemoteCommandHandler", () => ({ handleRemoteCommand: jest.fn() }));
jest.mock("../services/HubMessageDelivery", () => ({ deliverMessage: jest.fn() }));
jest.mock("../services/crypto", () => ({ getCryptoProvider: jest.fn(() => ({})) }));

import { saveRecipeFromHub, startHubTransport, stopHubTransport } from "../services/HubTransportService";
import { useAppStore } from "../store/appStore";
import type { Recipe } from "@familyhub/shared";

function mkRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Roast Chicken",
    serves: 5,
    ingredients: [{ name: "Chicken", quantity: "1 whole" }],
    author: "Hub",
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

describe("saveRecipeFromHub (sharing not set up)", () => {
  beforeEach(() => {
    useAppStore.setState({ recipes: [], household: null, pairedDevices: [] });
  });

  it("applies the recipe to the store and resolves without a transport", async () => {
    await expect(saveRecipeFromHub(mkRecipe())).resolves.toBeUndefined();
    const { recipes } = useAppStore.getState();
    expect(recipes).toHaveLength(1);
    expect(recipes[0].title).toBe("Roast Chicken");
  });

  it("applies a delete tombstone locally", async () => {
    await saveRecipeFromHub(mkRecipe());
    await saveRecipeFromHub(mkRecipe({ deleted: true, updatedAt: 2000 }));
    const { recipes } = useAppStore.getState();
    expect(recipes).toHaveLength(1);
    expect(recipes[0].deleted).toBe(true);
  });

  it("keeps LWW semantics through repeated saves", async () => {
    await saveRecipeFromHub(mkRecipe({ serves: 5, updatedAt: 2000 }));
    await saveRecipeFromHub(mkRecipe({ serves: 2, updatedAt: 1000 })); // stale
    expect(useAppStore.getState().recipes[0].serves).toBe(5);
  });
});

describe("transport lifecycle without a household", () => {
  beforeEach(() => {
    useAppStore.setState({ household: null });
  });

  it("startHubTransport idles when sharing is not configured", async () => {
    await expect(startHubTransport()).resolves.toBeUndefined();
    // Still transport-less: recipe saves stay local-only and don't throw.
    await expect(saveRecipeFromHub(mkRecipe({ id: "r9" }))).resolves.toBeUndefined();
  });

  it("stopHubTransport is a no-op when nothing is running", async () => {
    await expect(stopHubTransport()).resolves.toBeUndefined();
  });
});

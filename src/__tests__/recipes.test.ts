/**
 * Recipes on the hub store — LWW upsert semantics via applyRecipe, mirroring
 * how inbound "recipe" envelopes and tablet-side saves land in appStore.
 */
import { useAppStore } from "../store/appStore";
import type { Recipe } from "@familyhub/shared";
import { visibleRecipes } from "@familyhub/shared";

function mkRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Pancakes",
    serves: 3,
    ingredients: [{ name: "Flour", quantity: "200 g" }, { name: "Eggs", quantity: "2" }],
    author: "Mum",
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

describe("appStore recipes", () => {
  beforeEach(() => {
    useAppStore.setState({ recipes: [] });
  });

  it("adds a new recipe", () => {
    useAppStore.getState().applyRecipe(mkRecipe());
    const { recipes } = useAppStore.getState();
    expect(recipes).toHaveLength(1);
    expect(recipes[0].title).toBe("Pancakes");
    expect(recipes[0].serves).toBe(3);
  });

  it("applies a newer edit over an older copy (LWW)", () => {
    const store = useAppStore.getState();
    store.applyRecipe(mkRecipe());
    store.applyRecipe(mkRecipe({ serves: 6, updatedAt: 2000 }));
    const { recipes } = useAppStore.getState();
    expect(recipes).toHaveLength(1);
    expect(recipes[0].serves).toBe(6);
  });

  it("ignores a stale edit (e.g. relay replay after reconnect)", () => {
    const store = useAppStore.getState();
    store.applyRecipe(mkRecipe({ serves: 6, updatedAt: 2000 }));
    store.applyRecipe(mkRecipe({ serves: 3, updatedAt: 1000 }));
    expect(useAppStore.getState().recipes[0].serves).toBe(6);
  });

  it("delete tombstone hides the recipe from display but survives replay of a stale edit", () => {
    const store = useAppStore.getState();
    store.applyRecipe(mkRecipe());
    store.applyRecipe(mkRecipe({ deleted: true, updatedAt: 3000 }));
    store.applyRecipe(mkRecipe({ title: "Late stale edit", updatedAt: 2000 }));
    const { recipes } = useAppStore.getState();
    expect(recipes).toHaveLength(1);
    expect(visibleRecipes(recipes)).toHaveLength(0);
  });

  it("keeps distinct recipes side by side", () => {
    const store = useAppStore.getState();
    store.applyRecipe(mkRecipe());
    store.applyRecipe(mkRecipe({ id: "r2", title: "Curry", serves: 4 }));
    expect(useAppStore.getState().recipes).toHaveLength(2);
  });
});

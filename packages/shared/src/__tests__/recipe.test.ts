import { upsertRecipe, visibleRecipes, type Recipe } from "../models/recipe";
import { isEnvelope } from "../schemas/validate";

function mkRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Spaghetti Bolognese",
    serves: 4,
    ingredients: [{ name: "Spaghetti", quantity: "500 g" }, { name: "Minced beef", quantity: "400 g" }],
    author: "Mum",
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

describe("upsertRecipe", () => {
  it("inserts a new recipe at the front", () => {
    const out = upsertRecipe([mkRecipe({ id: "r0" })], mkRecipe());
    expect(out.map((r) => r.id)).toEqual(["r1", "r0"]);
  });

  it("replaces an existing recipe when the incoming copy is newer", () => {
    const out = upsertRecipe([mkRecipe()], mkRecipe({ title: "Spag Bol v2", updatedAt: 2000 }));
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Spag Bol v2");
  });

  it("ignores a stale or equal-timestamp incoming copy", () => {
    const existing = mkRecipe({ updatedAt: 2000, title: "Current" });
    expect(upsertRecipe([existing], mkRecipe({ updatedAt: 1500 }))[0].title).toBe("Current");
    expect(upsertRecipe([existing], mkRecipe({ updatedAt: 2000 }))[0].title).toBe("Current");
  });

  it("does not mutate the input array", () => {
    const input = [mkRecipe()];
    upsertRecipe(input, mkRecipe({ updatedAt: 2000, title: "New" }));
    expect(input[0].title).toBe("Spaghetti Bolognese");
  });

  it("applies a delete tombstone over a stale edit", () => {
    let recipes = [mkRecipe()];
    recipes = upsertRecipe(recipes, mkRecipe({ deleted: true, updatedAt: 3000 }));
    recipes = upsertRecipe(recipes, mkRecipe({ title: "Late edit", updatedAt: 2000 }));
    expect(recipes[0].deleted).toBe(true);
  });
});

describe("visibleRecipes", () => {
  it("hides tombstones and sorts newest-created first", () => {
    const recipes = [
      mkRecipe({ id: "old", createdAt: 100 }),
      mkRecipe({ id: "dead", deleted: true, createdAt: 300 }),
      mkRecipe({ id: "new", createdAt: 200 }),
    ];
    expect(visibleRecipes(recipes).map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("recipe envelopes", () => {
  it('accepts kind "recipe"', () => {
    expect(
      isEnvelope({ v: 1, id: "e1", household: "h1", from: "d1", ts: 1, kind: "recipe", payload: mkRecipe() }),
    ).toBe(true);
  });
});

export interface RecipeIngredient {
  /** e.g. "Spaghetti" */
  name: string;
  /** Free-form amount, e.g. "500 g" or "2 cups". */
  quantity?: string;
}

/**
 * A household recipe. Synced as a full-document upsert (kind "recipe"):
 * every add/edit/delete sends the whole recipe; receivers keep the copy
 * with the newest `updatedAt` (last-write-wins). Deletion is a tombstone
 * (`deleted: true`) so a delete beats a concurrent stale edit.
 */
export interface Recipe {
  id: string;
  title: string;
  /** How many people the recipe feeds. */
  serves: number;
  ingredients: RecipeIngredient[];
  /** Display name of whoever added it (e.g. "Mum" or the hub). */
  author?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/**
 * Merge an incoming recipe into a recipe list, last-write-wins by `updatedAt`
 * (ties keep the existing copy). Returns a new array; input is not mutated.
 * Tombstones are kept in the list so late-arriving stale edits stay dead —
 * filter `deleted` at display time.
 */
export function upsertRecipe(recipes: Recipe[], incoming: Recipe): Recipe[] {
  const idx = recipes.findIndex((r) => r.id === incoming.id);
  if (idx === -1) return [incoming, ...recipes];
  if (recipes[idx].updatedAt >= incoming.updatedAt) return recipes;
  const next = recipes.slice();
  next[idx] = incoming;
  return next;
}

/** Recipes to show: newest first, tombstones hidden. */
export function visibleRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.filter((r) => !r.deleted).sort((a, b) => b.createdAt - a.createdAt);
}

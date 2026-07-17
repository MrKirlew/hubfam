import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyOp, upsertRecipe, type EffectiveLane, type SharedList, type ListOp, type Recipe } from "@familyhub/shared";

interface CompanionState {
  paired: boolean;
  householdId: string | null;
  deviceId: string | null;
  memberName: string;
  /** Live connection lane — not persisted. */
  connection: EffectiveLane;
  sharedLists: SharedList[];
  /** Household recipes (incl. tombstones — filter `deleted` for display). */
  recipes: Recipe[];

  setPaired: (v: { householdId: string; deviceId: string }) => void;
  setMemberName: (n: string) => void;
  setConnection: (c: EffectiveLane) => void;
  upsertSharedList: (l: SharedList) => void;
  applyListOp: (op: ListOp) => void;
  applyRecipe: (r: Recipe) => void;
  reset: () => void;
}

export const useCompanionStore = create<CompanionState>()(
  persist(
    (set) => ({
      paired: false,
      householdId: null,
      deviceId: null,
      memberName: "Me",
      connection: "offline",
      sharedLists: [],
      recipes: [],

      setPaired: ({ householdId, deviceId }) => set({ paired: true, householdId, deviceId }),
      setMemberName: (memberName) => set({ memberName }),
      setConnection: (connection) => set({ connection }),
      upsertSharedList: (l) =>
        set((s) => {
          const i = s.sharedLists.findIndex((x) => x.id === l.id);
          const lists = s.sharedLists.slice();
          if (i >= 0) lists[i] = l;
          else lists.push(l);
          return { sharedLists: lists };
        }),
      applyListOp: (op) => set((s) => ({ sharedLists: applyOp(s.sharedLists, op) })),
      applyRecipe: (r) => set((s) => ({ recipes: upsertRecipe(s.recipes, r) })),
      reset: () => set({ paired: false, householdId: null, deviceId: null, sharedLists: [], recipes: [] }),
    }),
    {
      name: "familyhub-companion-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        paired: s.paired,
        householdId: s.householdId,
        deviceId: s.deviceId,
        memberName: s.memberName,
        sharedLists: s.sharedLists,
        recipes: s.recipes,
      }),
    },
  ),
);

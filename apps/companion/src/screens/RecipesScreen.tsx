import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { newId, visibleRecipes, type Recipe, type RecipeIngredient } from "@familyhub/shared";
import { useCompanionStore } from "../store/companionStore";
import { sendRecipe } from "../services/CompanionTransportService";

interface IngredientDraft {
  key: string;
  name: string;
  quantity: string;
}

const emptyIngredient = (): IngredientDraft => ({ key: newId(), name: "", quantity: "" });

export default function RecipesScreen() {
  const recipes = useCompanionStore((s) => s.recipes);
  const memberName = useCompanionStore((s) => s.memberName);
  const shown = useMemo(() => visibleRecipes(recipes), [recipes]);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [serves, setServes] = useState("4");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTitle("");
    setServes("4");
    setIngredients([emptyIngredient()]);
    setAdding(false);
  }, []);

  const setIngredient = (key: string, patch: Partial<IngredientDraft>) =>
    setIngredients((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeIngredient = (key: string) =>
    setIngredients((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));

  const save = () => {
    const cleanTitle = title.trim();
    const cleanIngredients: RecipeIngredient[] = ingredients
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), ...(r.quantity.trim() ? { quantity: r.quantity.trim() } : {}) }));
    if (!cleanTitle) {
      Alert.alert("Recipe needs a name", "Give the recipe a title before saving.");
      return;
    }
    if (cleanIngredients.length === 0) {
      Alert.alert("No ingredients", "Add at least one ingredient.");
      return;
    }
    const now = Date.now();
    const recipe: Recipe = {
      id: newId(),
      title: cleanTitle,
      serves: Math.max(1, Math.round(Number(serves) || 1)),
      ingredients: cleanIngredients,
      author: memberName || "Me",
      createdAt: now,
      updatedAt: now,
    };
    resetForm();
    void sendRecipe(recipe);
  };

  const del = (r: Recipe) =>
    Alert.alert("Delete recipe?", `"${r.title}" will be removed for everyone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void sendRecipe({ ...r, deleted: true, updatedAt: Date.now() }) },
    ]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Recipes</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {adding ? (
          <View style={styles.card}>
            <Text style={styles.label}>Recipe name</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Spaghetti Bolognese"
              placeholderTextColor="#5b6478"
              accessibilityLabel="Recipe name"
            />
            <Text style={styles.label}>Feeds how many?</Text>
            <TextInput
              style={[styles.input, styles.servesInput]}
              value={serves}
              onChangeText={setServes}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Number of people it feeds"
            />
            <Text style={styles.label}>Ingredients</Text>
            {ingredients.map((row) => (
              <View key={row.key} style={styles.ingredientRow}>
                <TextInput
                  style={[styles.input, styles.ingredientName]}
                  value={row.name}
                  onChangeText={(v) => setIngredient(row.key, { name: v })}
                  placeholder="Ingredient"
                  placeholderTextColor="#5b6478"
                  accessibilityLabel="Ingredient name"
                />
                <TextInput
                  style={[styles.input, styles.ingredientQty]}
                  value={row.quantity}
                  onChangeText={(v) => setIngredient(row.key, { quantity: v })}
                  placeholder="Amount"
                  placeholderTextColor="#5b6478"
                  accessibilityLabel="Ingredient amount"
                />
                <TouchableOpacity
                  onPress={() => removeIngredient(row.key)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove ingredient"
                >
                  <Text style={styles.removeX}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              onPress={() => setIngredients((rows) => [...rows, emptyIngredient()])}
              accessibilityRole="button"
              accessibilityLabel="Add another ingredient"
            >
              <Text style={styles.addIngredient}>+ Add ingredient</Text>
            </TouchableOpacity>
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={resetForm} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={save} accessibilityRole="button" accessibilityLabel="Save recipe">
                <Text style={styles.primaryBtnText}>Save recipe</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="Add a recipe">
            <Text style={styles.primaryBtnText}>+ Add a recipe</Text>
          </TouchableOpacity>
        )}

        {shown.length === 0 && !adding && (
          <Text style={styles.empty}>No recipes yet. Add one — it shows up on the hub and any paired phone.</Text>
        )}

        {shown.map((r) => {
          const open = expandedId === r.id;
          return (
            <TouchableOpacity
              key={r.id}
              style={styles.card}
              onPress={() => setExpandedId(open ? null : r.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${r.title}, feeds ${r.serves}${open ? ", collapse" : ", expand"}`}
            >
              <View style={styles.cardHead}>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.cardMeta}>
                    Feeds {r.serves} · {r.ingredients.length} ingredient{r.ingredients.length === 1 ? "" : "s"}
                    {r.author ? ` · by ${r.author}` : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => del(r)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${r.title}`}
                >
                  <Text style={styles.removeX}>🗑️</Text>
                </TouchableOpacity>
              </View>
              {open && (
                <View style={styles.ingredientList}>
                  {r.ingredients.map((ing, i) => (
                    <Text key={`${r.id}_${i}`} style={styles.ingredientText}>
                      •  {ing.quantity ? `${ing.quantity} ` : ""}
                      {ing.name}
                    </Text>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080c18" },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,.08)" },
  title: { color: "#e8eeff", fontSize: 22, fontWeight: "800" },
  body: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "rgba(255,255,255,.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
    padding: 14,
    gap: 8,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { color: "#e8eeff", fontSize: 16, fontWeight: "700" },
  cardMeta: { color: "rgba(232,238,255,.55)", fontSize: 12 },
  label: { color: "rgba(232,238,255,.6)", fontSize: 13, marginTop: 4 },
  input: {
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
    color: "#e8eeff",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  servesInput: { width: 90 },
  ingredientRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ingredientName: { flex: 2 },
  ingredientQty: { flex: 1 },
  removeX: { color: "rgba(232,238,255,.5)", fontSize: 16, paddingHorizontal: 2 },
  addIngredient: { color: "#60a5fa", fontSize: 14, fontWeight: "600", paddingVertical: 6 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  primaryBtn: { backgroundColor: "#60a5fa", borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.15)",
  },
  secondaryBtnText: { color: "rgba(232,238,255,.7)", fontSize: 15, fontWeight: "600" },
  empty: { color: "rgba(232,238,255,.5)", fontSize: 14, textAlign: "center", paddingVertical: 20, lineHeight: 20 },
  ingredientList: { gap: 5, paddingLeft: 2 },
  ingredientText: { color: "rgba(232,238,255,.85)", fontSize: 14 },
});

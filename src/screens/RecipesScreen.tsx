/**
 * RecipesScreen — the household recipe book on the hub. Add, browse, and
 * remove recipes (title, how many it feeds, ingredients). Saves broadcast to
 * paired phones via saveRecipeFromHub; recipes also work with sharing off.
 */
import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { visibleRecipes, newId, type Recipe, type RecipeIngredient } from "@familyhub/shared";
import { useAppStore } from "../store/appStore";
import { saveRecipeFromHub } from "../services/HubTransportService";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

interface IngredientDraft {
  key: string;
  name: string;
  quantity: string;
}

const emptyIngredient = (): IngredientDraft => ({ key: newId(), name: "", quantity: "" });

export default function RecipesScreen() {
  const navigation = useNavigation<any>();
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);
  const recipes = useAppStore((st) => st.recipes);
  const hubName = useAppStore((st) => st.hubName);
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

  const setIngredient = useCallback((key: string, patch: Partial<IngredientDraft>) => {
    setIngredients((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const removeIngredient = useCallback((key: string) => {
    setIngredients((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  }, []);

  const onSave = useCallback(async () => {
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
    const feeds = Math.max(1, Math.round(Number(serves) || 1));
    const now = Date.now();
    const recipe: Recipe = {
      id: newId(),
      title: cleanTitle,
      serves: feeds,
      ingredients: cleanIngredients,
      author: hubName || "Hub",
      createdAt: now,
      updatedAt: now,
    };
    resetForm();
    try {
      await saveRecipeFromHub(recipe);
    } catch {
      // Store already has it; broadcast retries ride the outbox.
    }
  }, [title, serves, ingredients, hubName, resetForm]);

  const onDelete = useCallback((r: Recipe) => {
    Alert.alert("Delete recipe?", `"${r.title}" will be removed for the whole family.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void saveRecipeFromHub({ ...r, deleted: true, updatedAt: Date.now() }).catch(() => {});
        },
      },
    ]);
  }, []);

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={s.title}>Recipes</Text>
        <View style={s.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {adding ? (
            <View style={s.formCard}>
              <Text style={s.formLabel}>Recipe name</Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Spaghetti Bolognese"
                placeholderTextColor={t.textFaint}
                accessibilityLabel="Recipe name"
              />
              <Text style={s.formLabel}>Feeds how many?</Text>
              <TextInput
                style={[s.input, s.servesInput]}
                value={serves}
                onChangeText={setServes}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Number of people it feeds"
              />
              <Text style={s.formLabel}>Ingredients</Text>
              {ingredients.map((row) => (
                <View key={row.key} style={s.ingredientRow}>
                  <TextInput
                    style={[s.input, s.ingredientName]}
                    value={row.name}
                    onChangeText={(v) => setIngredient(row.key, { name: v })}
                    placeholder="Ingredient"
                    placeholderTextColor={t.textFaint}
                    accessibilityLabel="Ingredient name"
                  />
                  <TextInput
                    style={[s.input, s.ingredientQty]}
                    value={row.quantity}
                    onChangeText={(v) => setIngredient(row.key, { quantity: v })}
                    placeholder="Amount"
                    placeholderTextColor={t.textFaint}
                    accessibilityLabel="Ingredient amount"
                  />
                  <TouchableOpacity
                    onPress={() => removeIngredient(row.key)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove ingredient"
                  >
                    <Ionicons name="close-circle-outline" size={22} color={t.textFaint} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={s.addIngredientBtn}
                onPress={() => setIngredients((rows) => [...rows, emptyIngredient()])}
                accessibilityRole="button"
                accessibilityLabel="Add another ingredient"
              >
                <Ionicons name="add" size={18} color={t.accent} />
                <Text style={s.addIngredientText}>Add ingredient</Text>
              </TouchableOpacity>
              <View style={s.formActions}>
                <TouchableOpacity style={s.secondaryBtn} onPress={resetForm} accessibilityRole="button" accessibilityLabel="Cancel">
                  <Text style={s.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.primaryBtn} onPress={onSave} accessibilityRole="button" accessibilityLabel="Save recipe">
                  <Text style={s.primaryBtnText}>Save recipe</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a recipe"
            >
              <Text style={s.primaryBtnText}>+ Add a recipe</Text>
            </TouchableOpacity>
          )}

          {shown.length === 0 && !adding ? (
            <View style={s.empty}>
              <Ionicons name="restaurant-outline" size={34} color={t.textFaint} />
              <Text style={s.emptyText}>No recipes yet</Text>
              <Text style={s.emptySub}>Add one here, or from a phone with the Family Hub Remote app</Text>
            </View>
          ) : (
            shown.map((r) => {
              const open = expandedId === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={s.recipeCard}
                  onPress={() => setExpandedId(open ? null : r.id)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.title}, feeds ${r.serves}${open ? ", collapse" : ", expand"}`}
                >
                  <View style={s.recipeHead}>
                    <View style={s.recipeTitleWrap}>
                      <Text style={s.recipeTitle} numberOfLines={1}>{r.title}</Text>
                      <Text style={s.recipeMeta}>
                        Feeds {r.serves} · {r.ingredients.length} ingredient{r.ingredients.length === 1 ? "" : "s"}
                        {r.author ? ` · by ${r.author}` : ""}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => onDelete(r)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${r.title}`}
                    >
                      <Ionicons name="trash-outline" size={20} color={t.error} />
                    </TouchableOpacity>
                  </View>
                  {open && (
                    <View style={s.ingredientList}>
                      {r.ingredients.map((ing, i) => (
                        <View key={`${r.id}_${i}`} style={s.ingredientItem}>
                          <Ionicons name="ellipse" size={6} color={t.accent} />
                          <Text style={s.ingredientText}>
                            {ing.quantity ? `${ing.quantity} ` : ""}
                            {ing.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.divider,
    },
    title: { color: t.text, fontSize: 20, fontWeight: "700" },
    headerSpacer: { width: 26 },
    body: { padding: 20, gap: 14 },
    primaryBtn: {
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 20,
      alignItems: "center",
    },
    primaryBtnText: { color: t.textOnAccent, fontSize: 16, fontWeight: "700" },
    secondaryBtn: {
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 20,
      alignItems: "center",
      borderWidth: 1,
      borderColor: t.cardBorder,
    },
    secondaryBtnText: { color: t.textSub, fontSize: 16, fontWeight: "600" },
    formCard: {
      backgroundColor: t.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cardBorder,
      padding: 16,
      gap: 8,
    },
    formLabel: { color: t.textSub, fontSize: 13, marginTop: 6 },
    input: {
      backgroundColor: t.input,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.inputBorder,
      color: t.text,
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    servesInput: { width: 90 },
    ingredientRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    ingredientName: { flex: 2 },
    ingredientQty: { flex: 1 },
    addIngredientBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
    addIngredientText: { color: t.accent, fontSize: 14, fontWeight: "600" },
    formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
    emptyText: { color: t.textSub, fontSize: 16, fontWeight: "600" },
    emptySub: { color: t.textFaint, fontSize: 13, textAlign: "center", paddingHorizontal: 30 },
    recipeCard: {
      backgroundColor: t.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cardBorder,
      padding: 14,
      gap: 10,
    },
    recipeHead: { flexDirection: "row", alignItems: "center", gap: 10 },
    recipeTitleWrap: { flex: 1, gap: 2 },
    recipeTitle: { color: t.text, fontSize: 17, fontWeight: "700" },
    recipeMeta: { color: t.textSub, fontSize: 13 },
    ingredientList: { gap: 6, paddingLeft: 4 },
    ingredientItem: { flexDirection: "row", alignItems: "center", gap: 8 },
    ingredientText: { color: t.text, fontSize: 15 },
  });
}

import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { visibleRecipes } from "@familyhub/shared";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

/** Dashboard widget: the household recipe book (added on the hub or from phones). */
export default function RecipesWidget() {
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);
  const recipes = useAppStore((st) => st.recipes);
  const shown = useMemo(() => visibleRecipes(recipes), [recipes]);

  if (shown.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="restaurant-outline" size={28} color={t.textFaint} />
        <Text style={s.emptyText}>No recipes yet</Text>
        <Text style={s.emptySub}>Add recipes in Settings → Recipes, or from a phone</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
      {shown.map((r) => (
        <View key={r.id} style={s.card}>
          <View style={s.head}>
            <Text style={s.name} numberOfLines={1}>{r.title}</Text>
            <View style={s.feeds}>
              <Ionicons name="people-outline" size={13} color={t.textSub} />
              <Text style={s.feedsText}>{r.serves}</Text>
            </View>
          </View>
          {r.ingredients.slice(0, 6).map((ing, i) => (
            <View key={`${r.id}_${i}`} style={s.item}>
              <Ionicons name="ellipse" size={5} color={t.accent} />
              <Text style={s.itemText} numberOfLines={1}>
                {ing.quantity ? `${ing.quantity} ` : ""}
                {ing.name}
              </Text>
            </View>
          ))}
          {r.ingredients.length > 6 && <Text style={s.more}>+{r.ingredients.length - 6} more</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    list: { paddingVertical: 4, gap: 8 },
    card: {
      backgroundColor: t.toolbar,
      borderRadius: 12,
      padding: 10,
      gap: 4,
    },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    name: { flex: 1, color: t.text, fontSize: 15, fontWeight: "700" },
    feeds: { flexDirection: "row", alignItems: "center", gap: 3 },
    feedsText: { color: t.textSub, fontSize: 13, fontWeight: "600" },
    item: { flexDirection: "row", alignItems: "center", gap: 7 },
    itemText: { flex: 1, color: t.textSub, fontSize: 13 },
    more: { color: t.textFaint, fontSize: 12, marginTop: 2 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: 12 },
    emptyText: { color: t.textSub, fontSize: 15, fontWeight: "600" },
    emptySub: { color: t.textFaint, fontSize: 12, textAlign: "center" },
  });
}

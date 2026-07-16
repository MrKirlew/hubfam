import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { visibleItems } from "@familyhub/shared";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

/** Dashboard widget: collaborative lists the family edits from their phones. */
export default function SharedListsWidget() {
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);
  const lists = useAppStore((st) => st.sharedLists);

  if (lists.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="people-outline" size={28} color={t.textFaint} />
        <Text style={s.emptyText}>No shared lists yet</Text>
        <Text style={s.emptySub}>Lists your family adds from their phones appear here</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
      {lists.map((l) => {
        const items = visibleItems(l);
        const done = items.filter((i) => i.done).length;
        return (
          <View key={l.id} style={s.card}>
            <View style={s.head}>
              <Text style={s.name} numberOfLines={1}>
                {l.name}
              </Text>
              <Text style={s.count}>
                {done}/{items.length}
              </Text>
            </View>
            {items.slice(0, 8).map((it) => (
              <View key={it.id} style={s.item}>
                <Ionicons name={it.done ? "checkbox" : "square-outline"} size={16} color={it.done ? t.success : t.textSub} />
                <Text style={[s.itemText, it.done && s.itemDone]} numberOfLines={1}>
                  {it.text}
                </Text>
              </View>
            ))}
            {items.length > 8 && <Text style={s.more}>+{items.length - 8} more</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    list: { paddingVertical: 4, gap: 8 },
    card: {
      backgroundColor: t.toolbar,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cardBorder,
      padding: 12,
    },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    name: { flex: 1, color: t.text, fontSize: 16, fontWeight: "700" },
    count: { color: t.textFaint, fontSize: 12, marginLeft: 8 },
    item: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
    itemText: { flex: 1, color: t.textSub, fontSize: 14 },
    itemDone: { color: t.textFaint, textDecorationLine: "line-through" },
    more: { color: t.textFaint, fontSize: 12, marginTop: 4 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
    emptyText: { color: t.textSub, fontSize: 15, fontWeight: "600", marginTop: 8 },
    emptySub: { color: t.textFaint, fontSize: 12, textAlign: "center", marginTop: 4 },
  });
}

import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useCompanionStore } from "./src/store/companionStore";
import PairScreen from "./src/screens/PairScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ListsScreen from "./src/screens/ListsScreen";
import { startCompanionTransport } from "./src/services/CompanionTransportService";

function MainTabs() {
  const [tab, setTab] = useState<"send" | "lists">("send");
  return (
    <View style={styles.flex}>
      <View style={styles.flex}>{tab === "send" ? <HomeScreen /> : <ListsScreen />}</View>
      <SafeAreaView edges={["bottom"]} style={styles.tabbar}>
        <TouchableOpacity style={styles.tab} onPress={() => setTab("send")} accessibilityRole="button" accessibilityLabel="Send tab">
          <Text style={[styles.tabText, tab === "send" && styles.tabActive]}>✉️  Send</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setTab("lists")} accessibilityRole="button" accessibilityLabel="Lists tab">
          <Text style={[styles.tabText, tab === "lists" && styles.tabActive]}>📋  Lists</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  const paired = useCompanionStore((s) => s.paired);
  const [hydrated, setHydrated] = useState(useCompanionStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useCompanionStore.persist.onFinishHydration(() => setHydrated(true));
    if (useCompanionStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && paired) {
      startCompanionTransport().catch((e) => console.error("[Companion] transport:", e));
    }
  }, [hydrated, paired]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!hydrated ? (
        <View style={styles.center}>
          <ActivityIndicator color="#60a5fa" size="large" />
        </View>
      ) : paired ? (
        <MainTabs />
      ) : (
        <PairScreen />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#080c18" },
  center: { flex: 1, backgroundColor: "#080c18", alignItems: "center", justifyContent: "center" },
  tabbar: { flexDirection: "row", backgroundColor: "#0f1628", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.08)" },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { color: "rgba(232,238,255,.5)", fontSize: 15, fontWeight: "600" },
  tabActive: { color: "#60a5fa" },
});

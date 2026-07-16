import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useCompanionStore } from "./src/store/companionStore";
import PairScreen from "./src/screens/PairScreen";
import HomeScreen from "./src/screens/HomeScreen";
import { startCompanionTransport } from "./src/services/CompanionTransportService";

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
        <HomeScreen />
      ) : (
        <PairScreen />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#080c18", alignItems: "center", justifyContent: "center" },
});

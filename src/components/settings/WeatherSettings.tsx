import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

export default function WeatherSettings() {
  const weatherLocation = useAppStore(s => s.weatherLocation);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const handleAutoLocation = async () => {
    try {
      const Location = require("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Enable location to use auto weather.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const geo = await Location.reverseGeocodeAsync(loc.coords);
      const name = geo[0]?.city || geo[0]?.region || "Current Location";
      useAppStore.getState().setWeatherLocation({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude, name, isAuto: true,
      });
      Alert.alert("Weather Updated", `Location set to ${name}`);
    } catch {
      Alert.alert("Error", "Could not get location.");
    }
  };

  const handleManualLocation = () => {
    if (Alert.prompt) {
      Alert.prompt("Set Location", "Enter city name (e.g. Miami, FL):", (text: string) => {
          if (!text?.trim()) return;
          fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text.trim())}&count=1`)
            .then(r => r.json())
            .then(data => {
              if (data.results?.[0]) {
                const r = data.results[0];
                useAppStore.getState().setWeatherLocation({
                  latitude: r.latitude, longitude: r.longitude,
                  name: `${r.name}${r.admin1 ? ", " + r.admin1 : ""}`, isAuto: false,
                });
                Alert.alert("Weather Updated", `Location set to ${r.name}`);
              } else {
                Alert.alert("Not Found", "Could not find that location.");
              }
            })
            .catch(() => Alert.alert("Error", "Could not search location."));
      });
    } else {
      Alert.alert("Set Location", "Use the quick-add bar to set a city, or use 'My Location' above.");
    }
  };

  return (
    <>
      <Text style={s.sectionTitle}>Weather</Text>
      <View style={s.card}>
        <TouchableOpacity style={[s.row, s.border]} onPress={handleAutoLocation} activeOpacity={0.7}>
          <View style={s.icon}><Text style={s.iconText}>📍</Text></View>
          <View style={s.info}>
            <Text style={s.name}>Use My Location</Text>
            <Text style={s.desc}>
              {weatherLocation?.isAuto ? `Auto: ${weatherLocation.name || "detecting..."}` : "Tap to use GPS location"}
            </Text>
          </View>
          <Ionicons name="locate-outline" size={20} color={t.accent} />
        </TouchableOpacity>
        <TouchableOpacity style={s.row} onPress={handleManualLocation} activeOpacity={0.7}>
          <View style={s.icon}><Text style={s.iconText}>🌤️</Text></View>
          <View style={s.info}>
            <Text style={s.name}>Set Location Manually</Text>
            <Text style={s.desc}>
              {!weatherLocation?.isAuto && weatherLocation?.name ? `Set to: ${weatherLocation.name}` : "Enter a city name"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.textFaint} />
        </TouchableOpacity>
      </View>
    </>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    sectionTitle: { fontSize: 13, fontWeight: "600", color: t.textSub,
                    marginTop: 24, marginBottom: 10, marginLeft: 4, textTransform: "uppercase", letterSpacing: 1 },
    card:         { backgroundColor: t.card, borderRadius: 16, borderWidth: 1,
                    borderColor: t.cardBorder, overflow: "hidden" },
    row:          { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
    border:       { borderBottomWidth: 1, borderBottomColor: t.divider },
    icon:         { width: 36, height: 36, borderRadius: 10, backgroundColor: t.divider,
                    alignItems: "center", justifyContent: "center" },
    iconText:     { fontSize: 18 },
    info:         { flex: 1 },
    name:         { fontSize: 15, fontWeight: "600", color: t.text },
    desc:         { fontSize: 12, color: t.textSub, marginTop: 2 },
  });
}

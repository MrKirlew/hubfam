import React, { useEffect, useState, useRef, useMemo } from "react";
import { Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import * as Location from "expo-location";
import { useAppStore } from "../store/appStore";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

interface WeatherData {
  temp: number;
  code: number;
  wind: number;
}

const WMO_ICONS: Record<number, string> = {
  0: "\u2600\uFE0F",    // Clear sky
  1: "\uD83C\uDF24",    // Mainly clear
  2: "\u26C5",           // Partly cloudy
  3: "\u2601\uFE0F",    // Overcast
  45: "\uD83C\uDF2B",   // Fog
  48: "\uD83C\uDF2B",   // Rime fog
  51: "\uD83C\uDF26",   // Light drizzle
  53: "\uD83C\uDF26",   // Moderate drizzle
  55: "\uD83C\uDF27",   // Dense drizzle
  61: "\uD83C\uDF27",   // Slight rain
  63: "\uD83C\uDF27",   // Moderate rain
  65: "\uD83C\uDF27",   // Heavy rain
  71: "\uD83C\uDF28",   // Slight snow
  73: "\uD83C\uDF28",   // Moderate snow
  75: "\uD83C\uDF28",   // Heavy snow
  77: "\u2744\uFE0F",   // Snow grains
  80: "\uD83C\uDF26",   // Slight showers
  81: "\uD83C\uDF27",   // Moderate showers
  82: "\u26C8",          // Violent showers
  85: "\uD83C\uDF28",   // Slight snow showers
  86: "\uD83C\uDF28",   // Heavy snow showers
  95: "\u26A1",          // Thunderstorm
  96: "\u26A1",          // Thunderstorm w/ hail
  99: "\u26A1",          // Thunderstorm w/ heavy hail
};

function getWeatherIcon(code: number): string {
  return WMO_ICONS[code] || "\uD83C\uDF24";
}

function getWeatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 55) return "Drizzle";
  if (code <= 65) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  return "Storms";
}

export default function WeatherBar() {
  const weatherLocation = useAppStore(s => s.weatherLocation);
  const setWeatherLocation = useAppStore(s => s.setWeatherLocation);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const fetchWeather = async (lat: number, lon: number) => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m&temperature_unit=fahrenheit&windspeed_unit=mph`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.current) {
        setWeather({
          temp: Math.round(data.current.temperature_2m),
          code: data.current.weathercode,
          wind: Math.round(data.current.windspeed_10m),
        });
      }
    } catch (err) {
      console.log("[Weather] Fetch failed:", err);
    }
  };

  const initLocation = async () => {
    if (!weatherLocation?.isAuto) {
      if (weatherLocation && weatherLocation.latitude !== 0) {
        setLocationName(weatherLocation.name);
        fetchWeather(weatherLocation.latitude, weatherLocation.longitude);
      }
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("[Weather] Location permission denied");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const { latitude, longitude } = loc.coords;

      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        const name = geo[0]?.city || geo[0]?.region || "Current Location";
        setLocationName(name);
        setWeatherLocation({ latitude, longitude, name, isAuto: true });
      } catch {
        setLocationName("Current Location");
        setWeatherLocation({ latitude, longitude, name: "Current Location", isAuto: true });
      }

      fetchWeather(latitude, longitude);
    } catch (err) {
      console.log("[Weather] Location error:", err);
    }
  };

  useEffect(() => {
    initLocation();
    intervalRef.current = setInterval(() => {
      const loc = useAppStore.getState().weatherLocation;
      if (loc && loc.latitude !== 0) {
        fetchWeather(loc.latitude, loc.longitude);
      }
    }, 30 * 60 * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // Mount-only: initLocation is recreated each render; re-running would duplicate the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!weather) {
    return (
      <TouchableOpacity style={s.container} onPress={initLocation} accessibilityRole="button" accessibilityLabel="Loading weather, tap to retry">
        <Text style={s.loadingText}>Loading weather...</Text>
      </TouchableOpacity>
    );
  }

  const icon = getWeatherIcon(weather.code);
  const label = getWeatherLabel(weather.code);

  return (
    <TouchableOpacity
      style={s.container}
      onPress={() => {
        Alert.alert(
          `${icon} ${label}`,
          `${weather.temp}°F · Wind ${weather.wind} mph\n${locationName}`,
          [{ text: "OK" }]
        );
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Weather: ${weather.temp} degrees, ${label}, ${locationName}`}
      accessibilityHint="Tap for weather details"
    >
      <Text style={s.icon}>{icon}</Text>
      <Text style={s.temp}>{weather.temp}°</Text>
      <Text style={s.location} numberOfLines={1}>{locationName}</Text>
    </TouchableOpacity>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:    { flexDirection: "row", alignItems: "center", gap: 4,
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
                    backgroundColor: t.toolbar },
    icon:         { fontSize: 16 },
    temp:         { fontSize: 14, fontWeight: "700", color: t.text },
    location:     { fontSize: 11, color: t.textSub, maxWidth: 80 },
    loadingText:  { fontSize: 11, color: t.textFaint },
  });
}

import React from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import DashboardScreen             from "../screens/DashboardScreen";
import SettingsScreen              from "../screens/SettingsScreen";
import AppManagerScreen            from "../screens/AppManagerScreen";
import CalendarSubscriptionsScreen from "../screens/CalendarSubscriptionsScreen";
import CalendarScreen              from "../screens/CalendarScreen";
import ListsScreen                 from "../screens/ListsScreen";
import AlarmScheduleScreen         from "../screens/AlarmScheduleScreen";

const Stack = createNativeStackNavigator();

export const navigationRef = createNavigationContainerRef();

export default function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="Dashboard"               component={DashboardScreen} />
        <Stack.Screen name="Settings"                component={SettingsScreen}              options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="Calendar"                component={CalendarScreen}              options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="Lists"                   component={ListsScreen}                 options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="AppManager"              component={AppManagerScreen}             options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="CalendarSubscriptions"   component={CalendarSubscriptionsScreen}  options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="AlarmSchedule"           component={AlarmScheduleScreen}          options={{ animation: "slide_from_right" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

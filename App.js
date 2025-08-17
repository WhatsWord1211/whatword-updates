import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, ActivityIndicator } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./src/firebase";

// Import all screens
import AuthScreen from "./src/AuthScreen";
import HomeScreen from "./src/HomeScreen";
import GameScreen from "./src/GameScreen";
import FriendsScreen from "./src/FriendsScreen";
import LeaderboardScreen from "./src/LeaderboardScreen";
import HowToPlayScreen from "./src/HowToPlayScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Loading screen component
const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1F2937" }}>
    <ActivityIndicator size="large" color="#F59E0B" />
    <Text style={{ color: "#E5E7EB", marginTop: 20, fontSize: 18 }}>Loading WhatWord...</Text>
  </View>
);

// Main tab navigator
const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      tabBarStyle: {
        backgroundColor: "#1F2937",
        borderTopColor: "#374151",
        borderTopWidth: 1,
      },
      tabBarActiveTintColor: "#F59E0B",
      tabBarInactiveTintColor: "#9CA3AF",
      headerStyle: {
        backgroundColor: "#1F2937",
      },
      headerTintColor: "#E5E7EB",
      headerTitleStyle: {
        fontWeight: "600",
      },
    }}
  >
    <Tab.Screen 
      name="Home" 
      component={HomeScreen}
      options={{
        title: "WhatWord",
        tabBarIcon: ({ color, size }) => (
          <Text style={{ color, fontSize: size, fontWeight: "bold" }}>🏠</Text>
        ),
      }}
    />
    <Tab.Screen 
      name="Friends" 
      component={FriendsScreen}
      options={{
        title: "Friends",
        tabBarIcon: ({ color, size }) => (
          <Text style={{ color, fontSize: size, fontWeight: "bold" }}>👥</Text>
        ),
      }}
    />
    <Tab.Screen 
      name="Leaderboard" 
      component={LeaderboardScreen}
      options={{
        title: "Leaderboard",
        tabBarIcon: ({ color, size }) => (
          <Text style={{ color, fontSize: size, fontWeight: "bold" }}>🏆</Text>
        ),
      }}
    />
  </Tab.Navigator>
);

// Main app component
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: "#1F2937",
          },
          headerTintColor: "#E5E7EB",
          headerTitleStyle: {
            fontWeight: "600",
          },
        }}
      >
        {user ? (
          // User is authenticated - show main app
          <>
            <Stack.Screen 
              name="MainTabs" 
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="Game" 
              component={GameScreen}
              options={{ 
                title: "Word Game",
                headerShown: true,
              }}
            />
            <Stack.Screen 
              name="HowToPlay" 
              component={HowToPlayScreen}
              options={{ title: "How to Play" }}
            />
          </>
        ) : (
          // User is not authenticated - show auth screen
          <Stack.Screen 
            name="Auth" 
            component={AuthScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
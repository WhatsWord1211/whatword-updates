import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { StatusBar, LogBox, View, Text, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import { auth } from './src/firebase'; // Import auth from firebase.js

// Test component loading
import './src/componentTest';

import HomeScreen from './src/HomeScreen';
import GameScreen from './src/GameScreen';
import HowToPlayScreen from './src/HowToPlayScreen';
import LeaderboardScreen from './src/LeaderboardScreen';
import FriendsScreen from './src/FriendsScreen';
import AuthScreen from './src/AuthScreen';

// Debug: Check if components are loaded
console.log('App: Components loaded:', {
  HomeScreen: !!HomeScreen,
  GameScreen: !!GameScreen,
  HowToPlayScreen: !!HowToPlayScreen,
  LeaderboardScreen: !!LeaderboardScreen,
  FriendsScreen: !!FriendsScreen,
  AuthScreen: !!AuthScreen,
});

// Ignore specific warnings that might be causing issues
LogBox.ignoreLogs([
  'Require cycle:',
  'ViewPropTypes will be removed',
  'AsyncStorage has been extracted',
  'Non-serializable values were found in the navigation state',
]);

const Stack = createNativeStackNavigator();

// Loading component
const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
    <Text style={{ fontSize: 18, marginBottom: 20 }}>Loading WhatWord...</Text>
    <ActivityIndicator size="large" color="#0000ff" />
  </View>
);

export default function App() {
  const [fontsLoaded] = useFonts({
    'Roboto': require('./assets/fonts/Roboto-Regular.ttf'),
    'Roboto-Bold': require('./assets/fonts/Roboto-Bold.ttf'),
  });

  const navigationRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [authState, setAuthState] = useState(null);

  // Configure deep linking
  const linking = {
    prefixes: [Linking.createURL('/'), 'whatword://'],
    config: {
      screens: {
        Home: 'home',
        Game: 'game/:gameId',
        HowToPlay: 'howtoplay',
        Leaderboard: 'leaderboard',
        Friends: 'friends',
        Auth: 'auth',
      },
    },
  };

  useEffect(() => {
    console.log('App: Initializing...');
    
    // Listen to auth state changes
    const unsubscribe = auth.onAuthStateChanged((user) => {
      console.log('App: Auth state changed:', user ? 'User logged in' : 'No user');
      setAuthState(user);
    });
    
    // Set app as ready after a short delay
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Show loading screen while fonts and auth are loading
  if (!fontsLoaded || !isReady) {
    return <LoadingScreen />;
  }

  // Ensure all components are loaded before rendering
  if (!HomeScreen || !GameScreen || !HowToPlayScreen || !LeaderboardScreen || !FriendsScreen || !AuthScreen) {
    console.error('One or more screen components failed to load');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <Text style={{ fontSize: 18, color: 'red' }}>Failed to load app components</Text>
        <Text style={{ fontSize: 14, color: 'gray', marginTop: 10 }}>Please restart the app</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer 
        ref={navigationRef} 
        linking={linking}
        onReady={() => {
          console.log('Navigation is ready');
        }}
        fallback={<LoadingScreen />}
      >
        <StatusBar style="auto" />
        <Stack.Navigator
          initialRouteName={authState ? "Home" : "Auth"}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Game" component={GameScreen} />
          <Stack.Screen name="HowToPlay" component={HowToPlayScreen} />
          <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
          <Stack.Screen name="Friends" component={FriendsScreen} />
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
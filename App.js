import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/firebase';

import AuthScreen from './src/AuthScreen';
import CustomTabNavigator from './src/CustomTabNavigator';
import AddFriendsScreen from './src/AddFriendsScreen';
import FriendRequestsScreen from './src/FriendRequestsScreen';
import PendingChallengesScreen from './src/PendingChallengesScreen';
import FriendsListScreen from './src/FriendsListScreen';
import HowToPlayScreen from './src/HowToPlayScreen';
import GameScreen from './src/GameScreen';
import ProfileScreen from './src/ProfileScreen';
import SetWordScreen from './src/SetWordScreen';
import SetWordGameScreen from './src/SetWordGameScreen';
import CreateChallengeScreen from './src/CreateChallengeScreen';
import PvPGameScreen from './src/PvPGameScreen';
import ResumeGamesScreen from './src/ResumeGamesScreen';
import SettingsScreen from './src/SettingsScreen';
import PrivacySettingsScreen from './src/PrivacySettingsScreen';
import FriendDiscoveryScreen from './src/FriendDiscoveryScreen';
import LegalScreen from './src/LegalScreen';

import { ThemeProvider } from './src/ThemeContext';
import './src/adService'; // Initialize AdMob service
import { initializeConsentAndAds } from './src/consentManager';
import { loadSounds } from './src/soundsUtil';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Main tab navigator - MOVED OUTSIDE App component
const MainTabs = () => {
  return <CustomTabNavigator />;
};

// Main app component
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      // Initialize consent flow and ads SDK early
      await initializeConsentAndAds().catch(() => {});
      
      // Load sounds on app start - wait for completion
      await loadSounds().catch(() => {});
      console.log('App: Sounds loaded, app ready');
    };

    initializeApp();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Determine which component to render
  const navigationCondition = user ? 'MainTabs' : 'Auth';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName={user ? "MainTabs" : "Auth"}
          screenOptions={{ 
            headerShown: false, 
            animation: 'none',
            animationDuration: 0,
            presentation: 'transparentModal'
          }}
        >
          {user ? (
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen 
                name="HowToPlay" 
                component={HowToPlayScreen}
                options={{ 
                  animation: 'none',
                  animationDuration: 0,
                  presentation: 'transparentModal',
                  gestureEnabled: false
                }}
              />
              <Stack.Screen name="Game" component={GameScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="SetWord" component={SetWordScreen} />
              <Stack.Screen name="SetWordGame" component={SetWordGameScreen} />
              <Stack.Screen name="CreateChallenge" component={CreateChallengeScreen} />
              <Stack.Screen name="PvPGame" component={PvPGameScreen} />
                          <Stack.Screen name="ResumeGames" component={ResumeGamesScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
            <Stack.Screen name="FriendDiscovery" component={FriendDiscoveryScreen} />
            <Stack.Screen name="AddFriends" component={AddFriendsScreen} />
              <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
              <Stack.Screen name="PendingChallenges" component={PendingChallengesScreen} />
              <Stack.Screen name="FriendsList" component={FriendsListScreen} />
              {/* Legal screen accessible to authenticated users */}
              <Stack.Screen name="Legal" component={LegalScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Auth" component={AuthScreen} />
              {/* Legal screen accessible to unauthenticated users */}
              <Stack.Screen name="Legal" component={LegalScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1F2937',
  },
  loadingText: {
    color: '#E5E7EB',
    fontSize: 18,
  },
});
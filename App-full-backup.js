import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Alert } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/firebase-simple';

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
import * as Notifications from 'expo-notifications';
import { loadSounds } from './src/soundsUtil';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { getNotificationService } from './src/notificationService';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Main tab navigator - MOVED OUTSIDE App component
const MainTabs = () => {
  return <CustomTabNavigator />;
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('=== APP ERROR BOUNDARY CAUGHT ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error info:', errorInfo);
    console.error('=== END ERROR BOUNDARY ===');
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Something went wrong.</Text>
          <Text style={styles.errorSubtext}>Please restart the app.</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

// Main app component
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auto-apply OTA updates on startup (no second relaunch needed)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log('OTA: runtimeVersion =', Updates.runtimeVersion, 'updateId =', Updates.updateId);
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          console.log('OTA: Update available, fetching...');
          const fetched = await Updates.fetchUpdateAsync();
          if (!cancelled && fetched.isNew) {
            console.log('OTA: New update fetched, reloading app...');
            await Updates.reloadAsync();
          }
        } else {
          console.log('OTA: No update available');
        }
      } catch (e) {
        console.log('OTA: check/fetch failed:', e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('=== APP INITIALIZATION START ===');
        console.log('App: Starting initialization...');
        
        // Wait a moment to ensure Firebase is fully initialized
        console.log('App: Waiting 100ms for Firebase to be ready...');
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('App: Wait complete, proceeding with initialization...');
        
        // Initialize notification service early (temporarily disabled for debugging)
        // const notificationService = getNotificationService();
        // await notificationService.initialize().catch((err) => {
        //   console.warn('App: Notification service initialization failed:', err);
        // });
        console.log('App: Notification service initialization skipped for debugging');
        
        // Initialize consent flow and ads SDK early
        await initializeConsentAndAds().catch((err) => {
          console.warn('App: Consent and ads initialization failed:', err);
        });
        
        // Load sounds on app start - wait for completion
        await loadSounds().catch((err) => {
          console.warn('App: Sound loading failed:', err);
        });
        console.log('App: Sounds loaded, app ready');
        
        // Set up auth state listener after initialization
        console.log('App: Setting up auth state listener...');
        console.log('App: Auth object:', auth);
        console.log('App: onAuthStateChanged function:', typeof onAuthStateChanged);
        
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          try {
            console.log('=== AUTH STATE CHANGED ===');
            console.log('App: Auth state changed, user:', user ? 'logged in' : 'logged out');
            console.log('App: User details:', user ? { uid: user.uid, email: user.email } : 'null');
            if (user) {
              setUser(user);
            } else {
              setUser(null);
            }
            setLoading(false);
            console.log('=== AUTH STATE HANDLED ===');
          } catch (err) {
            console.error('=== AUTH STATE ERROR ===');
            console.error('App: Auth state change error:', err);
            console.error('Error message:', err.message);
            console.error('Error stack:', err.stack);
            setError(err);
            setLoading(false);
            console.error('=== END AUTH STATE ERROR ===');
          }
        });
        
        return unsubscribe;
      } catch (err) {
        console.error('App: Initialization error:', err);
        setError(err);
        setLoading(false);
        return null;
      }
    };

    let unsubscribe = null;
    initializeApp().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);


  // Determine which component to render
  const navigationCondition = user ? 'MainTabs' : 'Auth';

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>App failed to start</Text>
        <Text style={styles.errorSubtext}>Please restart the app</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    padding: 20,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorSubtext: {
    color: '#E5E7EB',
    fontSize: 16,
    textAlign: 'center',
  },
});
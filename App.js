import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Alert, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import * as Notifications from 'expo-notifications';
import { loadSounds, cleanupSounds } from './src/soundsUtil';
import { Audio } from 'expo-av';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { getNotificationService } from './src/notificationService';

// Configure notification handler at TOP LEVEL for background notifications
// This MUST be set before the app renders for background notifications to work
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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

  // Check for OTA updates on startup, fetch in background; do NOT auto-reload on launch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Only check for updates in production builds
        if (!Updates.isEnabled) {
          console.log('OTA: Updates are not enabled (likely development build)');
          return;
        }
        
        console.log('OTA: Checking for updates...');
        console.log('OTA: runtimeVersion =', Updates.runtimeVersion);
        console.log('OTA: currentUpdateId =', Updates.updateId);
        console.log('OTA: channel =', Updates.channel);
        console.log('OTA: isEmbeddedLaunch =', Updates.isEmbeddedLaunch);
        
        // On iOS, if this is an embedded launch (first launch after update), don't check again
        // This prevents reload loops
        if (Platform.OS === 'ios' && Updates.isEmbeddedLaunch) {
          console.log('OTA: iOS embedded launch detected - skipping update check to avoid reload loop');
          return;
        }
        
        const result = await Updates.checkForUpdateAsync();
        console.log('OTA: checkForUpdateAsync result:', {
          isAvailable: result.isAvailable,
          manifest: result.manifest ? {
            id: result.manifest.id,
            createdAt: result.manifest.createdAt,
            runtimeVersion: result.manifest.runtimeVersion
          } : null
        });
        
        if (result.isAvailable) {
          console.log('OTA: Update available, fetching...');
          const fetched = await Updates.fetchUpdateAsync();
          console.log('OTA: fetchUpdateAsync result:', {
            isNew: fetched.isNew,
            manifest: fetched.manifest ? {
              id: fetched.manifest.id,
              createdAt: fetched.manifest.createdAt,
              runtimeVersion: fetched.manifest.runtimeVersion
            } : null
          });
          
          if (!cancelled && fetched.isNew) {
            console.log('OTA: New update fetched successfully');
            // On iOS, reload after a short delay to ensure update is fully committed
            // On Android, the update will apply on next app restart
            if (Platform.OS === 'ios') {
              console.log('OTA: iOS - waiting briefly then reloading to apply update');
              // Small delay to ensure update is fully committed to disk
              await new Promise(resolve => setTimeout(resolve, 500));
              if (!cancelled) {
                console.log('OTA: iOS - reloading now to apply update');
                await Updates.reloadAsync();
              }
            } else {
              console.log('OTA: Android - update will apply on next app restart');
            }
          } else if (!cancelled) {
            console.log('OTA: Update fetched but not new (already have this update)');
          }
        } else {
          console.log('OTA: No update available (app is up to date)');
        }
      } catch (e) {
        console.error('OTA: check/fetch failed:', e?.message || e);
        console.error('OTA: Error details:', {
          code: e?.code,
          message: e?.message,
          stack: e?.stack
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Navigation bar configuration is handled by ThemeContext
    // This ensures it properly adapts to light/dark mode changes
    // and matches the app's background color automatically

    // Safety timeout - if loading takes more than 10 seconds, force it to complete
    const safetyTimeout = setTimeout(() => {
      console.warn('App: Loading timeout reached - forcing load completion');
      setLoading(false);
    }, 10000);

    const initializeApp = async () => {
      try {
        console.log('=== APP INITIALIZATION START ===');
        console.log('App: Starting initialization...');

        // Minimal delay for platform stability
        const initialDelay = Platform.OS === 'ios' ? 200 : 50;
        console.log(`App: Waiting ${initialDelay}ms for platform stability...`);
        await new Promise(resolve => setTimeout(resolve, initialDelay));
        console.log('App: Platform stability wait complete');

        // Configure audio with error handling (non-blocking)
        try {
          await Audio.setAudioModeAsync({
            // Respect iOS hardware silent/mute switch
            playsInSilentModeIOS: false,
            staysActiveInBackground: false,
            allowsRecordingIOS: false,
            shouldDuckAndroid: true,
            interruptionModeAndroid: 1,
            interruptionModeIOS: 1,
          });
          console.log('App: Audio mode configured (respects iOS silent mode)');
        } catch (audioModeErr) {
          console.warn('App: Failed to set audio mode:', audioModeErr?.message || audioModeErr);
          // Don't fail initialization for audio issues
        }
        
        // Initialize ads service BEFORE UI shows (industry standard)
        try {
          const consentPromise = initializeConsentAndAds();
          const consentTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Consent/ads initialization timeout')), 8000)
          );
          await Promise.race([consentPromise, consentTimeout]);
          console.log('App: Ads service initialized before UI');
        } catch (err) {
          console.warn('App: Ads service initialization failed:', err);
          // Continue without ads
        }
        
        console.log('App: Setting up auth listener for immediate UI...');
        
        // Set up auth state listener - show UI immediately after auth check
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          try {
            console.log('=== AUTH STATE CHANGED ===');
            console.log('App: Auth state changed, user:', user ? 'logged in' : 'logged out');
            console.log('App: User details:', user ? { uid: user.uid, email: user.email } : 'null');
            
            // Show UI immediately after auth check (like normal iOS/Android apps)
            if (user) {
              setUser(user);
            } else {
              setUser(null);
            }
            setLoading(false);
            console.log('=== AUTH STATE HANDLED - UI SHOWN ===');
            
        // Load services in background after UI is visible
        setTimeout(() => {
          initializeBackgroundServices();
        }, 100);
            
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

    // Background service initialization (non-blocking)
    const initializeBackgroundServices = async () => {
      try {
        console.log('App: Starting background service initialization...');
        
        // Load sounds with timeout (non-blocking)
        try {
          const soundsPromise = loadSounds();
          const soundsTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Sound loading timeout')), 3000)
          );
          await Promise.race([soundsPromise, soundsTimeout]);
          console.log('App: Background - Sounds loaded');
        } catch (err) {
          console.warn('App: Background - Sound loading failed:', err);
        }
        
        // iOS-specific delay between services
        if (Platform.OS === 'ios') {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Initialize notification service (ads already initialized before UI)
        try {
          const notificationService = getNotificationService();
          const notificationPromise = notificationService.initialize();
          const notificationTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Notification service timeout')), 5000)
          );
          await Promise.race([notificationPromise, notificationTimeout]);
          console.log('App: Background - Notification service initialized');
        } catch (err) {
          console.warn('App: Background - Notification service initialization failed:', err);
        }
        
        // iOS-specific delay before sounds
        if (Platform.OS === 'ios') {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log('App: Background services initialization complete');
      } catch (err) {
        console.error('App: Background services initialization error:', err);
      }
    };

    let unsubscribe = null;
    initializeApp().then((unsub) => {
      unsubscribe = unsub;
      clearTimeout(safetyTimeout); // Clear timeout on successful init
    });

    return () => {
      // Industry standard: Clean up all app-level resources
      clearTimeout(safetyTimeout);
      if (unsubscribe) {
        unsubscribe();
      }
      
      // Clean up audio resources
      try {
        cleanupSounds().catch(error => {
          console.warn('App: Error during sounds cleanup:', error);
        });
        Audio.unloadAsync().catch(error => {
          console.warn('App: Error unloading audio:', error);
        });
      } catch (error) {
        console.warn('App: Error during audio cleanup:', error);
      }
      
      // Clean up notification service
      try {
        const notificationService = getNotificationService();
        if (notificationService && typeof notificationService.cleanup === 'function') {
          notificationService.cleanup();
        }
      } catch (error) {
        console.warn('App: Error during notification service cleanup:', error);
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
                <Stack.Screen 
                  name="SetWordGame" 
                  component={SetWordGameScreen}
                  options={{
                    headerShown: false,
                    gestureEnabled: false, // Prevent swipe back gesture
                    presentation: 'modal' // Treat as modal to prevent back navigation
                  }}
                />
                <Stack.Screen 
                  name="CreateChallenge" 
                  component={CreateChallengeScreen}
                  options={{
                    headerShown: false,
                    gestureEnabled: false, // Prevent swipe back gesture
                    presentation: 'modal' // Treat as modal to prevent back navigation
                  }}
                />
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
    </GestureHandlerRootView>
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
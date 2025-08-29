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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Main tab navigator - MOVED OUTSIDE App component
const MainTabs = () => {
  console.log('🔧 DEV MODE: MainTabs component is rendering!');
  return <CustomTabNavigator />;
};

// Main app component
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔧 DEV MODE: App.js useEffect running...');
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔧 DEV MODE: Auth state changed in App.js:', user ? `User authenticated: ${user.uid}` : 'No user');
      
      if (user) {
        console.log('🔧 DEV MODE: Setting user state to:', user.uid);
        setUser(user);
      } else {
        console.log('🔧 DEV MODE: Setting user state to: null');
        setUser(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  console.log('🔧 DEV MODE: App.js rendering with user:', user ? user.uid : 'null');
  console.log('🔧 DEV MODE: Loading state:', loading);

  // Determine which component to render
  const navigationCondition = user ? 'MainTabs' : 'Auth';
  console.log('🔧 DEV MODE: Navigation condition - user ? MainTabs : Auth =', navigationCondition);
  console.log('🔧 DEV MODE: User object:', user);

  if (loading) {
    console.log('🔧 DEV MODE: Showing loading screen');
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  console.log('🔧 DEV MODE: About to render navigation. User exists:', !!user);
  
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ 
        headerShown: false, 
        animation: 'none',
        animationDuration: 0,
        presentation: 'transparentModal'
      }}>
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
            <Stack.Screen name="AddFriends" component={AddFriendsScreen} />
            <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
            <Stack.Screen name="PendingChallenges" component={PendingChallengesScreen} />
            <Stack.Screen name="FriendsList" component={FriendsListScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
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
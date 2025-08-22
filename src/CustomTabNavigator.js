import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';

import HomeScreen from './HomeScreen';
import FriendsScreen from './FriendsScreen';
import LeaderboardScreen from './LeaderboardScreen';

const Tab = createBottomTabNavigator();

const CustomTabNavigator = () => {
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activePvPGames, setActivePvPGames] = useState([]);
  const [notificationsSeen, setNotificationsSeen] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen for pending challenges
    const challengesQuery = query(
      collection(db, 'challenges'),
      where('to', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );

    const challengesUnsubscribe = onSnapshot(challengesQuery, (snapshot) => {
      const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingChallenges(challenges);
      // Reset notifications seen flag when new challenges arrive
      if (challenges.length > 0) {
        setNotificationsSeen(false);
      }
    });

    // Listen for pending friend requests
    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('to', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );

    const requestsUnsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingRequests(requests);
      // Reset notifications seen flag when new requests arrive
      if (requests.length > 0) {
        setNotificationsSeen(false);
      }
    });

    // Listen for active PvP games
    const activeGamesQuery = query(
      collection(db, 'games'),
      where('players', 'array-contains', auth.currentUser.uid),
      where('status', 'in', ['ready', 'active'])
    );
    
    const activeGamesUnsubscribe = onSnapshot(activeGamesQuery, (snapshot) => {
      const activeGames = [];
      snapshot.forEach((doc) => {
        const gameData = doc.data();
        if (gameData.type === 'pvp' && ['ready', 'active'].includes(gameData.status)) {
          activeGames.push({ id: doc.id, ...gameData });
        }
      });
      
      setActivePvPGames(activeGames);
      
      // Reset notifications seen flag when new active games arrive
      if (activeGames.length > 0) {
        setNotificationsSeen(false);
      }
    });

    return () => {
      challengesUnsubscribe();
      requestsUnsubscribe();
      activeGamesUnsubscribe();
    };
  }, []);

  // Mark notifications as seen when Friends tab is focused
  useFocusEffect(
    React.useCallback(() => {
      setNotificationsSeen(true);
    }, [])
  );

  const getNotificationCount = () => {
    // Only count items that are actually visible and actionable on the Friends screen
    // - pendingChallenges: shown in "Pending Challenges" section
    // - pendingRequests: shown in "Friends Management" section  
    // - activePvPGames: shown as "Active PvP Game" notification (count as 1 if exists)
    // Only show count if notifications haven't been seen yet
    const count = !notificationsSeen ? 
      pendingChallenges.length + pendingRequests.length + (activePvPGames.length > 0 ? 1 : 0) : 0;
    
    return count;
  };

  const renderTabIcon = (icon, color, size, hasNotifications = false) => (
    <View style={styles.tabIconContainer}>
      <Text style={{ color, fontSize: size, fontWeight: "bold" }}>{icon}</Text>
      {hasNotifications && (
        <View style={styles.notificationBadge}>
          <Text style={styles.notificationText}>
            {getNotificationCount() > 99 ? '99+' : getNotificationCount()}
          </Text>
        </View>
      )}
    </View>
  );

  return (
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
          title: "",
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
          tabBarIcon: ({ color, size }) => renderTabIcon(
            "👥", 
            color, 
            size, 
            (pendingChallenges.length > 0 || pendingRequests.length > 0 || activePvPGames.length > 0) && !notificationsSeen
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
};

const styles = StyleSheet.create({
  tabIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1F2937',
  },
  notificationText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default CustomTabNavigator;

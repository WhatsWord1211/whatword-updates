import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, PanGestureHandler, State, Animated, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { collection, query, where, onSnapshot, updateDoc, doc, getDoc, getDocs } from 'firebase/firestore';
import { db, auth } from './firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { playSound } from './soundsUtil';

// ✅ UPDATED TO USE NEW SUBCONNECTION SYSTEM ⚠️
// This file now uses the NEW subcollection system (users/{userId}/friends/{friendId})
// Consistent with FriendRequestsScreen.js and friendsService.js
console.log('✅ [CustomTabNavigator] Using NEW subcollection system - consistent with other screens');

import HomeScreen from './HomeScreen';
import FriendsManagementScreen from './FriendsManagementScreen';
import LeaderboardScreen from './LeaderboardScreen';
import ProfileScreen from './ProfileScreen';

const Tab = createBottomTabNavigator();

const CustomTabNavigator = () => {
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activePvPGames, setActivePvPGames] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsSeen, setNotificationsSeen] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState(new Set());
  const [badgeScale] = useState(new Animated.Value(1));

  // Load dismissed notifications and notifications seen state from AsyncStorage on component mount
  useEffect(() => {
    loadPersistedData();
  }, []);


  // Load dismissed notifications and notifications seen state from AsyncStorage
  const loadPersistedData = async () => {
    try {
      // Load dismissed notifications
      const storedDismissed = await AsyncStorage.getItem('dismissedNotifications');
      if (storedDismissed) {
        const dismissedArray = JSON.parse(storedDismissed);
        setDismissedNotifications(new Set(dismissedArray));
      }

      // Load notifications seen state
      const storedSeen = await AsyncStorage.getItem('notificationsSeen');
      if (storedSeen) {
        setNotificationsSeen(JSON.parse(storedSeen));
      }
    } catch (error) {
      console.error('Failed to load persisted data:', error);
    }
  };

  // Save dismissed notifications to AsyncStorage
  const saveDismissedNotifications = async (dismissedSet) => {
    try {
      const dismissedArray = Array.from(dismissedSet);
      await AsyncStorage.setItem('dismissedNotifications', JSON.stringify(dismissedArray));
    } catch (error) {
      console.error('Failed to save dismissed notifications:', error);
    }
  };

  // Save notifications seen state to AsyncStorage
  const saveNotificationsSeen = async (seen) => {
    try {
      await AsyncStorage.setItem('notificationsSeen', JSON.stringify(seen));
    } catch (error) {
      console.error('Failed to save notifications seen state:', error);
    }
  };

  // Clear dismissed notifications when there are no actual notifications
  const clearDismissedNotificationsIfNoNew = () => {
    const hasActualNotifications = (pendingChallenges.length > 0 || pendingRequests.length > 0 || activePvPGames.length > 0 || notifications.length > 0);
    if (!hasActualNotifications) {
      setDismissedNotifications(new Set());
      saveDismissedNotifications(new Set());
      setNotificationsSeen(true);
      saveNotificationsSeen(true);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen for pending challenges
    const challengesQuery = query(
      collection(db, 'challenges'),
      where('toUid', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );

    const challengesUnsubscribe = onSnapshot(challengesQuery, (snapshot) => {
      const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingChallenges(challenges);
      // Reset notifications seen flag when new challenges arrive
      if (challenges.length > 0) {
        setNotificationsSeen(false);
        saveNotificationsSeen(false);
      }
      
      // Clear dismissed notifications if there are no actual notifications
      clearDismissedNotificationsIfNoNew();
    }, (error) => {
      console.error('CustomTabNavigator: Challenges query error:', error);
    });

    // Listen for pending friend requests
    console.log('🔍 [CustomTabNavigator] Setting up friend request listener');
    console.log('🔍 [CustomTabNavigator] Current user ID:', auth.currentUser?.uid);
    
    // Use NEW subcollection system - query user's friends subcollection for pending requests
    const friendsRef = collection(db, 'users', auth.currentUser.uid, 'friends');
    const requestsQuery = query(
      friendsRef,
      where('status', '==', 'pending')
    );

    console.log('🔍 [CustomTabNavigator] Querying NEW subcollection system for user:', auth.currentUser?.uid);
    console.log('🔍 [CustomTabNavigator] Query: users/', auth.currentUser.uid, '/friends where status == pending');

    const requestsUnsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      console.log('🔍 [CustomTabNavigator] Friend request listener triggered');
      console.log('🔍 [CustomTabNavigator] Snapshot size:', snapshot.docs.length);
      console.log('🔍 [CustomTabNavigator] Snapshot docs:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('🔍 [CustomTabNavigator] Processed requests:', requests);
      setPendingRequests(requests);
      
      // Reset notifications seen flag when new requests arrive
      if (requests.length > 0) {
        setNotificationsSeen(false);
        saveNotificationsSeen(false);
      }
      
      // Clear dismissed notifications if there are no actual notifications
      clearDismissedNotificationsIfNoNew();
    }, (error) => {
      console.error('❌ [CustomTabNavigator] Friend requests query error:', error);
    });

    // Listen for active PvP games using a different approach
    // Instead of querying games collection directly, we'll listen to user's activeGames array
    // and then fetch individual game documents
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    
    const activeGamesUnsubscribe = onSnapshot(userDocRef, async (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const activeGameIds = userData.activeGames || [];
        
        if (activeGameIds.length > 0) {
          // Fetch game documents for active games
          const gamePromises = activeGameIds.map(gameId => getDoc(doc(db, 'games', gameId)));
          const gameDocs = await Promise.all(gamePromises);
          
          const activeGames = [];
          gameDocs.forEach((gameDoc, index) => {
            if (gameDoc.exists()) {
              const gameData = gameDoc.data();
              
              // Only include PvP games that are in active states
              if (gameData.type === 'pvp' && ['ready', 'active', 'waiting_for_opponent'].includes(gameData.status)) {
                activeGames.push({ id: activeGameIds[index], ...gameData });
              }
            }
          });
          
          setActivePvPGames(activeGames);
          
          // Reset notifications seen flag when new active games arrive
          if (activeGames.length > 0) {
            setNotificationsSeen(false);
            saveNotificationsSeen(false);
          }
          
          // Clear dismissed notifications if there are no actual notifications
          clearDismissedNotificationsIfNoNew();
        } else {
          setActivePvPGames([]);
        }
      }
    }, (error) => {
      console.error('CustomTabNavigator: User document query error:', error);
    });

    // Listen for notifications
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('toUid', '==', auth.currentUser.uid),
      where('read', '==', false)
    );
    
    const notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const userNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(userNotifications);
      
      // Reset notifications seen flag when new notifications arrive
      if (userNotifications.length > 0) {
        setNotificationsSeen(false);
        saveNotificationsSeen(false);
      }
      
      // Clear dismissed notifications if there are no actual notifications
      clearDismissedNotificationsIfNoNew();
    }, (error) => {
      console.error('CustomTabNavigator: Notifications query error:', error);
    });

    return () => {
      challengesUnsubscribe();
      requestsUnsubscribe();
      activeGamesUnsubscribe();
      notificationsUnsubscribe();
    };
  }, []);

  // Add manual refresh when component comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('🔍 [CustomTabNavigator] Component focused - refreshing friend requests');
      if (auth.currentUser) {
        // Manually check for friend requests
        const requestsQuery = query(
          collection(db, 'friendRequests'),
          where('toUid', '==', auth.currentUser.uid),
          where('status', '==', 'pending')
        );
        
        getDocs(requestsQuery).then((snapshot) => {
          console.log('🔍 [CustomTabNavigator] Manual refresh - Found', snapshot.docs.length, 'friend requests');
          const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setPendingRequests(requests);
          
          if (requests.length > 0) {
            setNotificationsSeen(false);
            saveNotificationsSeen(false);
          }
        }).catch((error) => {
          console.error('CustomTabNavigator: Manual refresh error:', error);
        });
      }
    }, [auth.currentUser])
  );

  // Note: We don't automatically mark notifications as seen when Friends tab is focused
  // The user needs to actually interact with the requests to clear the badge
  // This ensures the badge persists until the user takes action

  // Animate notification badge dismissal
  const animateDismissal = () => {
    Animated.sequence([
      Animated.timing(badgeScale, {
        toValue: 1.2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(badgeScale, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      badgeScale.setValue(1);
    });
  };

  // Dismiss specific notification by ID
  const dismissNotification = (notificationId, type) => {
    animateDismissal();
    setDismissedNotifications(prev => {
      const newSet = new Set([...prev, `${type}_${notificationId}`]);
      saveDismissedNotifications(newSet); // Save to AsyncStorage
      return newSet;
    });
    // Add subtle visual feedback
  };

  // Mark notification as read
  const markNotificationAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true
      });
      // Also add to dismissed notifications to prevent showing again
      setDismissedNotifications(prev => {
        const newSet = new Set([...prev, `notification_${notificationId}`]);
        saveDismissedNotifications(newSet); // Save to AsyncStorage
        return newSet;
      });
      // Notification marked as read
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Dismiss all notifications
  const dismissAllNotifications = () => {
    animateDismissal();
    setDismissedNotifications(prev => {
      const newSet = new Set(prev);
      // Add all current notifications to dismissed set
      pendingChallenges.forEach(challenge => newSet.add(`challenge_${challenge.id}`));
      pendingRequests.forEach(request => newSet.add(`request_${request.id}`));
      if (activePvPGames.length > 0) {
        newSet.add('activeGame_1');
      }
      notifications.forEach(notification => newSet.add(`notification_${notification.id}`));
      saveDismissedNotifications(newSet); // Save to AsyncStorage
      return newSet;
    });
    setNotificationsSeen(true);
    saveNotificationsSeen(true);
  };

  // Show help for notification dismissal
  const showNotificationHelp = () => {
    Alert.alert(
      'Notification Help',
      '💡 Tap notification badge to dismiss individual notifications\n\n👆 Long press to dismiss all notifications\n\n📱 Notifications also auto-dismiss when you visit the Friends tab',
      [{ text: 'Got it!', style: 'default' }]
    );
  };

  // Check if a specific notification is dismissed
  const isNotificationDismissed = (notificationId, type) => {
    return dismissedNotifications.has(`${type}_${notificationId}`);
  };

  const getNotificationCount = () => {
    // Only count items that are actually visible and actionable on the Friends screen
    // - pendingChallenges: shown in "Pending Challenges" section
    // - pendingRequests: shown in "Friends Management" section  
    // - activePvPGames: shown as "Active PvP Game" notification (count as 1 if exists)
    // - notifications: general notifications like gameStarted
    // Only show count if notifications haven't been seen yet and haven't been manually dismissed
    const visibleChallenges = pendingChallenges.filter(challenge => 
      !isNotificationDismissed(challenge.id, 'challenge')
    );
    const visibleRequests = pendingRequests.filter(request => 
      !isNotificationDismissed(request.id, 'request')
    );
    const visibleActiveGames = activePvPGames.length > 0 && 
      !isNotificationDismissed('1', 'activeGame') ? 1 : 0;
    const visibleNotifications = notifications.filter(notification => 
      !isNotificationDismissed(notification.id, 'notification')
    );
    
    const count = visibleChallenges.length + visibleRequests.length + visibleActiveGames + visibleNotifications.length;
    
    return count;
  };

  // Handle tab press and play sound
  const handleTabPress = () => {
    playSound('customTab').catch(() => {});
  };

  // Handle Friends tab press - clear notifications and play sound
  const handleFriendsTabPress = () => {
    playSound('customTab').catch(() => {});
    // Clear notifications when Friends tab is clicked
    setNotificationsSeen(true);
    saveNotificationsSeen(true);
  };

  const renderTabIcon = (icon, color, size, hasNotifications = false) => (
    <View style={styles.tabIconContainer}>
      <Text style={{ color, fontSize: size, fontWeight: "bold" }}>{icon}</Text>
      {hasNotifications && (
        <Animated.View style={[styles.notificationBadge, { transform: [{ scale: badgeScale }] }]}>
          <Text style={styles.notificationText}>
            {getNotificationCount() > 99 ? '99+' : getNotificationCount()}
          </Text>
        </Animated.View>
      )}
    </View>
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false, // Hide the header bar at the top
        tabBarStyle: {
          backgroundColor: "#1F2937",
          borderTopColor: "#374151",
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: "#F59E0B",
        tabBarInactiveTintColor: "#9CA3AF",
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
        listeners={{
          tabPress: handleTabPress,
        }}
      />
      <Tab.Screen 
        name="Friends" 
        options={{
          title: "Friends",
          tabBarIcon: ({ color, size }) => {
            const hasNotifications = (pendingChallenges.length > 0 || pendingRequests.length > 0 || activePvPGames.length > 0 || notifications.length > 0) && !notificationsSeen;
            return renderTabIcon("👥", color, size, hasNotifications);
          },
        }}
        listeners={{
          tabPress: handleFriendsTabPress,
        }}
      >
        {(props) => <FriendsManagementScreen {...props} onClearNotifications={() => {
          setNotificationsSeen(true);
          saveNotificationsSeen(true);
        }} />}
      </Tab.Screen>
      <Tab.Screen 
        name="Leaderboard" 
        component={LeaderboardScreen}
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size, fontWeight: "bold" }}>🏆</Text>
          ),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size, fontWeight: "bold" }}>👤</Text>
          ),
        }}
        listeners={{
          tabPress: handleTabPress,
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
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  notificationText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  helpIndicator: {
    position: 'absolute',
    bottom: -15,
    left: '50%',
    marginLeft: -10,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    width: 20,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
  },
  helpText: {
    color: 'white',
    fontSize: 8,
    fontWeight: 'bold',
  },
  hintContainer: {
    position: 'absolute',
    bottom: -25,
    left: '50%',
    marginLeft: -40,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    width: 80,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
  },
  hintText: {
    color: 'white',
    fontSize: 8,
    fontWeight: 'bold',
  },
});

export default CustomTabNavigator;

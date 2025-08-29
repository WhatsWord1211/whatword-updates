import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, PanGestureHandler, State, Animated, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from './firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from './HomeScreen';
import AddFriendsScreen from './AddFriendsScreen';
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
      where('to', '==', auth.currentUser.uid),
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
        saveNotificationsSeen(false);
      }
      
      // Clear dismissed notifications if there are no actual notifications
      clearDismissedNotificationsIfNoNew();
    });

    // Listen for active PvP games
    const activeGamesQuery = query(
      collection(db, 'games'),
      where('players', 'array-contains', auth.currentUser.uid),
              where('status', 'in', ['ready', 'active', 'waiting_for_opponent'])
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
        saveNotificationsSeen(false);
      }
      
      // Clear dismissed notifications if there are no actual notifications
      clearDismissedNotificationsIfNoNew();
    });

    // Listen for notifications
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('to', '==', auth.currentUser.uid),
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
    });

    return () => {
      challengesUnsubscribe();
      requestsUnsubscribe();
      activeGamesUnsubscribe();
      notificationsUnsubscribe();
    };
  }, []);

  // Mark notifications as seen when Friends tab is focused (only if there are actual notifications)
  useFocusEffect(
    React.useCallback(() => {
      const hasNotifications = (pendingChallenges.length > 0 || pendingRequests.length > 0 || activePvPGames.length > 0 || notifications.length > 0);
      if (hasNotifications && !notificationsSeen) {
        setNotificationsSeen(true);
        saveNotificationsSeen(true);
      }
    }, [pendingChallenges.length, pendingRequests.length, activePvPGames.length, notifications.length, notificationsSeen])
  );

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
    
    const count = !notificationsSeen ? 
      visibleChallenges.length + visibleRequests.length + visibleActiveGames + visibleNotifications.length : 0;
    
    return count;
  };

  const renderTabIcon = (icon, color, size, hasNotifications = false) => (
    <View style={styles.tabIconContainer}>
      <Text style={{ color, fontSize: size, fontWeight: "bold" }}>{icon}</Text>
      {hasNotifications && (
                        <Animated.View style={[styles.notificationBadge, { transform: [{ scale: badgeScale }] }]}>
                  <TouchableOpacity
                    style={styles.notificationBadgeInner}
                    onPress={() => {
                      // Tap to dismiss this specific notification type
                      if (pendingChallenges.length > 0) {
                        dismissNotification(pendingChallenges[0].id, 'challenge');
                      } else if (pendingRequests.length > 0) {
                        dismissNotification(pendingRequests[0].id, 'request');
                      } else if (activePvPGames.length > 0) {
                        dismissNotification('1', 'activeGame');
                      }
                    }}
                    onLongPress={dismissAllNotifications}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.notificationText}>
                      {getNotificationCount() > 99 ? '99+' : getNotificationCount()}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
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
        component={AddFriendsScreen}
        options={{
          title: "Friends",
          tabBarIcon: ({ color, size }) => (
            <View style={styles.tabIconContainer}>
              <Text style={{ color, fontSize: size, fontWeight: "bold" }}>👥</Text>
              {(pendingChallenges.length > 0 || pendingRequests.length > 0 || activePvPGames.length > 0 || notifications.length > 0) && !notificationsSeen && (
                <TouchableOpacity
                  style={styles.notificationBadge}
                  onPress={() => {
                    // Tap to dismiss this specific notification type
                    if (pendingChallenges.length > 0) {
                      dismissNotification(pendingChallenges[0].id, 'challenge');
                    } else if (pendingRequests.length > 0) {
                      dismissNotification(pendingRequests[0].id, 'request');
                    } else if (activePvPGames.length > 0) {
                      dismissNotification('1', 'activeGame');
                    } else if (notifications.length > 0) {
                      // Mark the first notification as read and dismiss it
                      const firstNotification = notifications[0];
                      markNotificationAsRead(firstNotification.id);
                      dismissNotification(firstNotification.id, 'notification');
                    }
                  }}
                  onLongPress={dismissAllNotifications}
                  activeOpacity={0.7}
                >
                  <Text style={styles.notificationText}>
                    {getNotificationCount() > 99 ? '99+' : getNotificationCount()}
                  </Text>
                </TouchableOpacity>
              )}
              {/* Small help indicator for first-time users */}
              {getNotificationCount() > 0 && (
                <TouchableOpacity
                  style={styles.helpIndicator}
                  onPress={showNotificationHelp}
                  activeOpacity={0.7}
                >
                  <Text style={styles.helpText}>💡</Text>
                </TouchableOpacity>
              )}

            </View>
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
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size, fontWeight: "bold" }}>👤</Text>
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
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  notificationBadgeInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
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

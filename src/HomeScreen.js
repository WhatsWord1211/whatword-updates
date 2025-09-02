import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, Image, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, updateDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styles from './styles';
import { loadSounds, playSound } from './soundsUtil';
import authService from './authService';
import { useTheme } from './ThemeContext';

const HomeScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [navigationReady, setNavigationReady] = useState(false);

  const [showInvalidPopup, setShowInvalidPopup] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [user, setUser] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [gameInvites, setGameInvites] = useState([]);
  const [displayName, setDisplayName] = useState('Player');
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [badgeCleared, setBadgeCleared] = useState(false);

  const [userProfile, setUserProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const invitesUnsubscribeRef = useRef(null);
  const challengesUnsubscribeRef = useRef(null);

  const notificationsUnsubscribeRef = useRef(null);

  // Load user profile and set up listeners
  const markNotificationAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true
      });
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const permanentlyDeleteNotifications = async (notificationIds) => {
    try {
      // Delete all notifications permanently
      const deletePromises = notificationIds.map(notificationId => 
        deleteDoc(doc(db, 'notifications', notificationId))
      );
      await Promise.all(deletePromises);
      console.log('HomeScreen: Permanently deleted', notificationIds.length, 'notifications');
    } catch (error) {
      console.error('Failed to permanently delete notifications:', error);
    }
  };



  // Refresh user profile to get updated averages and ranks
  const refreshUserProfile = async (currentUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserProfile(userData);
        console.log('HomeScreen: Refreshed user profile with updated averages:', {
          easy: userData.easyAverageScore,
          regular: userData.regularAverageScore,
          hard: userData.hardAverageScore
        });
      }
    } catch (error) {
      console.error('HomeScreen: Failed to refresh user profile:', error);
    }
  };

  const loadUserProfile = async (currentUser) => {
    try {
      console.log('HomeScreen: Loading profile for user:', currentUser.uid);
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('HomeScreen: User data from Firestore:', userData);
        
        // Try multiple sources for display name
        let displayNameToUse = 'Player';
        
        if (currentUser.displayName && currentUser.displayName.trim()) {
          displayNameToUse = currentUser.displayName.trim();
          console.log('HomeScreen: Using Firebase displayName:', displayNameToUse);
        } else if (userData.displayName && userData.displayName.trim()) {
          displayNameToUse = userData.displayName.trim();
          console.log('HomeScreen: Using Firestore displayName:', displayNameToUse);
        } else if (userData.username && userData.username.trim()) {
          displayNameToUse = userData.username.trim();
          console.log('HomeScreen: Using Firestore username:', displayNameToUse);
        } else if (currentUser.email) {
          // Use email prefix as fallback
          displayNameToUse = currentUser.email.split('@')[0];
          console.log('HomeScreen: Using email prefix as displayName:', displayNameToUse);
        }
        
        console.log('HomeScreen: Final displayName set to:', displayNameToUse);
        setDisplayName(displayNameToUse);
        
        // Store user profile data for rank calculation
        setUserProfile(userData);
        
        // Set up listeners for all authenticated users
        setTimeout(() => {
          try {
            // Set up game invites listener - TEMPORARILY DISABLED TO TEST
            // const invitesQuery = query(
            //   collection(db, 'gameInvites'),
            //   where('toUid', '==', currentUser.uid),
            //   where('status', '==', 'pending')
            // );
            // const unsubscribeInvites = onSnapshot(invitesQuery, (snapshot) => {
            //   const invites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            //   console.log('HomeScreen: Game invites snapshot update', { invites: invites.length });
            //   setGameInvites(invites);
            // }, (error) => {
            //   console.error('HomeScreen: Game invites query error:', error);
            // });
            // if (invitesUnsubscribeRef.current) {
            //   invitesUnsubscribeRef.current();
            // }
            // invitesUnsubscribeRef.current = unsubscribeInvites;
            
            // Set empty game invites for now
            setGameInvites([]);
            
            // Set up pending challenges listener (challenges received)
            // Query for challenges where current user is the recipient
            const challengesQuery = query(
              collection(db, 'challenges'),
              where('toUid', '==', currentUser.uid),
              where('status', '==', 'pending')
            );
            const unsubscribeChallenges = onSnapshot(challengesQuery, (snapshot) => {
              const userChallenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              
              // Debug logging
              console.log('HomeScreen: Challenge snapshot update', {
                userChallenges: userChallenges.length,
                challengeStatuses: userChallenges.map(c => ({ id: c.id, status: c.status, from: c.fromUid || c.from, to: c.toUid || c.to }))
              });
              
              setPendingChallenges(userChallenges);
              
              // Reset badge cleared state if new challenges come in
              if (userChallenges.length > 0) {
                setBadgeCleared(false);
              }
            }, (error) => {
              console.error('HomeScreen: Challenges query error:', error);
            });
            

            
            // Store the unsubscribe functions for cleanup
            // invitesUnsubscribeRef.current = unsubscribeInvites; // Disabled since gameInvites query is disabled
            
            if (challengesUnsubscribeRef.current) {
              challengesUnsubscribeRef.current();
            }
            challengesUnsubscribeRef.current = unsubscribeChallenges;
            

            
            // Set up notifications listener
            const notificationsQuery = query(
              collection(db, 'notifications'),
              where('toUid', '==', currentUser.uid),
              where('read', '==', false)
            );
            const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
              const newNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              console.log('HomeScreen: Notifications snapshot update', { notifications: newNotifications.length });
              setNotifications(newNotifications);
              
              // Reset badge cleared state if new notifications come in
              if (newNotifications.length > 0) {
                setBadgeCleared(false);
              }
            }, (error) => {
              console.error('HomeScreen: Notifications query error:', error);
            });
            
            if (notificationsUnsubscribeRef.current) {
              notificationsUnsubscribeRef.current();
            }
            notificationsUnsubscribeRef.current = unsubscribeNotifications;
            challengesUnsubscribeRef.current = unsubscribeChallenges;
          } catch (error) {
            console.error('HomeScreen: Failed to set up listeners:', error);
          }
        }, 100); // Small delay to ensure UI is responsive
        
      } else {
        console.log('HomeScreen: No user document found, creating one...');
        // Create user profile if it doesn't exist
        const username = currentUser.email ? currentUser.email.split('@')[0] : `Player${Math.floor(Math.random() * 10000)}`;
        await setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          username: username,
          displayName: username,
          email: currentUser.email,
          createdAt: new Date(),
          lastLogin: new Date(),
          // Solo mode stats by difficulty
          easyGamesPlayed: 0,
          easyAverageScore: 0,
          regularGamesPlayed: 0,
          regularAverageScore: 0,
          hardGamesPlayed: 0,
          hardAverageScore: 0,
          totalScore: 0,
          // PvP mode stats
          pvpGamesPlayed: 0,
          pvpGamesWon: 0,
          pvpWinRate: 0,
          previousRank: 'Unranked',
          friends: [],
          isAnonymous: false,
          // Premium status
          isPremium: false,
          hardModeUnlocked: false
        });
        setDisplayName(username);
      }
    } catch (error) {
      console.error('HomeScreen: Failed to load user profile:', error);
      // Fallback to email prefix if available
      if (currentUser.email) {
        const emailName = currentUser.email.split('@')[0];
        setDisplayName(emailName);
        console.log('HomeScreen: Fallback to email prefix:', emailName);
      } else {
        setDisplayName('Player');
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    const authenticate = async () => {
      try {
        // Check if user is already signed in - this should be instant
        const currentUser = auth.currentUser;
        if (currentUser) {
          if (mounted) {
            setUser(currentUser);
            setIsAuthenticating(false);
            
            // Load profile and other data in background
            Promise.all([
              loadUserProfile(currentUser),
              loadSounds(),
              checkFirstLaunch(),
              
              clearStuckGameState() // Clear any stuck game state
            ]).catch(console.error);
          }
          return;
        }

        // Set up auth state listener
        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
          if (mounted) {
            if (currentUser) {
              setUser(currentUser);
              setIsAuthenticating(false);
              
              // Load profile and other data in background
              Promise.all([
                loadUserProfile(currentUser),
                loadSounds(),
                checkFirstLaunch(),

                clearStuckGameState() // Clear any stuck game state
              ]).catch(console.error);
            } else {
              // No user authenticated - this shouldn't happen in the new flow
              setIsAuthenticating(false);
            }
          }
        });

        return unsubscribeAuth;
      } catch (error) {
        console.error('HomeScreen: Authentication failed:', error);
        if (mounted) {
          setIsAuthenticating(false);
        }
      }
    };

    // Start authentication immediately
    authenticate();

    return () => {
      mounted = false;
        // if (invitesUnsubscribeRef.current) {
        //   invitesUnsubscribeRef.current();
        // }
        if (challengesUnsubscribeRef.current) {
          challengesUnsubscribeRef.current();
        }

        if (notificationsUnsubscribeRef.current) {
          notificationsUnsubscribeRef.current();
        }

    };
  }, []);

  // Refresh user profile when screen comes into focus to get updated averages and ranks
  useFocusEffect(
    React.useCallback(() => {
      if (user && !isAuthenticating) {
        refreshUserProfile(user);
      }
    }, [user, isAuthenticating])
  );

  const checkFirstLaunch = async () => {
    try {
      const hasLaunched = await AsyncStorage.getItem('hasLaunched');
      if (!hasLaunched) {
        setIsFirstLaunch(true);
        await AsyncStorage.setItem('hasLaunched', 'true');
      }
    } catch (error) {
      console.error('HomeScreen: Failed to check first launch:', error);
    }
  };

  const clearStuckGameState = async () => {
    try {
      // Clear any potentially stuck game state from AsyncStorage
      const keysToRemove = ['currentGame', 'gameState'];
      
      for (const key of keysToRemove) {
        try {
          await AsyncStorage.removeItem(key);
          console.log(`HomeScreen: Cleared ${key} from AsyncStorage`);
        } catch (error) {
          console.error(`HomeScreen: Failed to clear ${key}:`, error);
        }
      }
      
      console.log('HomeScreen: Cleared stuck game state');
    } catch (error) {
      console.error('HomeScreen: Failed to clear stuck game state:', error);
    }
  };



  const handleSignOut = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setDisplayName('Player');

      setGameInvites([]);
      setPendingChallenges([]);
      setBadgeCleared(false);
      

    } catch (error) {
      console.error('HomeScreen: Sign out failed:', error);
    }
  };

  const handleRefreshProfile = async () => {
    try {
      if (user) {
        console.log('HomeScreen: Refreshing user profile...');
        await loadUserProfile(user);
        console.log('HomeScreen: Profile refresh completed');
      }
    } catch (error) {
      console.error('HomeScreen: Failed to refresh profile:', error);
    }
  };

  // Function to get player rank
  const getPlayerRank = () => {
    if (!userProfile) return 'Unranked';
    
    const easyAvg = userProfile.easyAverageScore || 0;
    const regularAvg = userProfile.regularAverageScore || 0;
    const hardAvg = userProfile.hardAverageScore || 0;
    
    // Check if player has played any games
    if (easyAvg === 0 && regularAvg === 0 && hardAvg === 0) {
      return 'Unranked';
    }
    
    if (hardAvg > 0 && hardAvg <= 8) return 'Word Master';
    if (regularAvg > 0 && regularAvg <= 8) return 'Word Expert';
    if (regularAvg > 0 && regularAvg <= 12) return 'Word Pro';
    if (easyAvg > 0 && easyAvg <= 8) return 'Word Enthusiast';
    if (easyAvg > 0 && easyAvg <= 15) return 'Word Learner';
    if (easyAvg > 0 && easyAvg <= 20) return 'Rookie';
    
    return 'Unranked';
  };

  const handleButtonPress = (screen, params) => {
    try {
      console.log('HomeScreen: Attempting navigation to', screen, 'with params:', params);
      
      // Simple navigation with error handling
      navigation.navigate(screen, params);
      playSound('chime');
      console.log('HomeScreen: Navigation successful to', screen);
    } catch (error) {
      console.error('HomeScreen: Navigation failed', error);
      // Don't show alert for navigation errors, just log them
      // This prevents blocking the UI for minor navigation issues
    }
  };

  const acceptGameInvite = async (invite) => {
    try {
      // Navigate to Friends screen to handle the invite
      navigation.navigate('Friends');
      await playSound('chime');
    } catch (error) {
      console.error('HomeScreen: Failed to accept game invite:', error);
      Alert.alert('Error', 'Failed to accept game invite. Please try again.');
    }
  };



  const renderInvite = ({ item }) => (
    <View style={styles.friendItem}>
      <Text style={styles.friendText}>Game Invite from {item.fromUid}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => acceptGameInvite(item)}
      >
        <Text style={styles.buttonText}>View</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      {/* FAB - Positioned outside SafeAreaView to avoid any container constraints */}
      <TouchableOpacity
        style={styles.fabTopHomeScreen}
        onPress={() => {
          setShowMenuModal(true);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.fabText}>☰</Text>
      </TouchableOpacity>
      
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.screenContainer, { backgroundColor: colors.background }]}>
        {/* Fixed Header Image - Outside ScrollView */}
        <View style={{ alignItems: 'center', width: '100%' }}>
          <Image
            source={require('../assets/images/WhatWord-header.png')}
            style={[styles.imageHeader, { marginTop: 5, marginBottom: 5 }]}
            resizeMode="contain"
          />
        </View>
      
      {/* Content */}
      <View
        style={{ flex: 1, width: '100%', paddingTop: 0, paddingBottom: 20, alignItems: 'center' }}
      >
        <Text style={[styles.header, { marginBottom: 40, color: colors.textPrimary }]}>Welcome, {displayName}</Text>
        
        {/* Player Rank Display */}
        <View style={[styles.rankDisplay, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
          <Text style={[styles.rankLabel, { color: colors.textSecondary }]}>Rank:</Text>
          <Text style={[styles.rankValue, { color: colors.primary }]}>{getPlayerRank()}</Text>
        </View>
        

        



        
        {/* PvP Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            playSound('chime');
            navigation.navigate('CreateChallenge');
          }}
        >
          <Text style={styles.buttonText}>Play A Friend</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.button}
          onPress={() => handleButtonPress('Game', { gameMode: 'solo', showDifficulty: true })}
        >
          <Text style={styles.buttonText}>Play Solo</Text>
        </TouchableOpacity>
        

        
        <View style={{ position: 'relative', width: '100%' }}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              // Permanently delete notifications when user acknowledges them by going to Resume screen
              if (notifications.length > 0) {
                const notificationIds = notifications.map(notification => notification.id);
                permanentlyDeleteNotifications(notificationIds);
              }
              
              // Clear the badge when user acknowledges by clicking Resume
              setBadgeCleared(true);
              
              // Debug: Log what's causing the badge to show
              console.log('HomeScreen: Resume button clicked - Badge sources:', {
                pendingChallenges: pendingChallenges.length,
                notifications: notifications.length,
                total: pendingChallenges.length + notifications.length,
                badgeCleared: true
              });
              
              handleButtonPress('ResumeGames');
            }}
          >
            <Text style={styles.buttonText}>Resume</Text>
          </TouchableOpacity>
          {/* Notification Badge */}
          {!badgeCleared && (pendingChallenges.length > 0 || notifications.length > 0) && (
            <View style={[styles.notificationBadge, { backgroundColor: '#FF4444' }]}>
              <Text style={styles.notificationBadgeText}>
                {pendingChallenges.length + notifications.length}
              </Text>
            </View>
          )}
        </View>
        
        <TouchableOpacity
          style={styles.button}
          onPress={() => handleButtonPress('HowToPlay')}
        >
          <Text style={styles.buttonText}>How To Play</Text>
        </TouchableOpacity>
        


        {/* Game Invites */}
        {gameInvites.length > 0 && (
          <>
            <Text style={[styles.header, { color: colors.textPrimary }]}>Game Invites</Text>
            <FlatList
              data={gameInvites}
              renderItem={renderInvite}
              keyExtractor={item => item.id}
              style={{ width: "100%", maxHeight: 200 }}
            />
          </>
        )}




      </View>
      </View>
      
      <Modal visible={showMenuModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.header, { color: colors.textPrimary }]}>Menu</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={handleSignOut}
            >
              <Text style={styles.buttonText}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={handleRefreshProfile}
            >
              <Text style={styles.buttonText}>Refresh Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                handleButtonPress('Settings');
                setShowMenuModal(false);
              }}
            >
              <Text style={styles.buttonText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => setShowMenuModal(false)}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      <Modal visible={showInvalidPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.invalidGuessPopup, styles.modalShadow]}>
            <Text style={styles.header}>Error</Text>
            <Text style={styles.invalidGuessMessage}>An error occurred. Please try again.</Text>
            <TouchableOpacity
              style={styles.invalidGuessButtonContainer}
              onPress={() => setShowInvalidPopup(false)}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
        {isAuthenticating && !user && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Authenticating...</Text>
          </View>
        )}
      </SafeAreaView>
    </>
  );
};

export default HomeScreen;
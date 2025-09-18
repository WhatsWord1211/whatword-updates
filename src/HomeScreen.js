import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, Image, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, updateDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styles from './styles';
import { playSound } from './soundsUtil';
import authService from './authService';
import { useTheme } from './ThemeContext';
import { getNotificationService } from './notificationService';
import pushNotificationService from './pushNotificationService';
import appUpdateService from './appUpdateService';

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
  const [unseenResultsCount, setUnseenResultsCount] = useState(0);
  const [isSoundReady, setIsSoundReady] = useState(false);

  const [userProfile, setUserProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [startedGameCount, setStartedGameCount] = useState(0);
  const startedGameIdsRef = useRef(new Set());
  const [showRankModal, setShowRankModal] = useState(false);
  const invitesUnsubscribeRef = useRef(null);
  const challengesUnsubscribeRef = useRef(null);

  const notificationsUnsubscribeRef = useRef(null);
  const completedResultsUnsubscribeRef = useRef(null);
  const prevUnseenCountRef = useRef(0);

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
      }
    } catch (error) {
      console.error('HomeScreen: Failed to refresh user profile:', error);
    }
  };

  const loadUserProfile = async (currentUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Try multiple sources for display name
        let displayNameToUse = 'Player';
        
        if (currentUser.displayName && currentUser.displayName.trim()) {
          displayNameToUse = currentUser.displayName.trim();
        } else if (userData.displayName && userData.displayName.trim()) {
          displayNameToUse = userData.displayName.trim();
        } else if (userData.username && userData.username.trim()) {
          displayNameToUse = userData.username.trim();
        } else if (currentUser.email) {
          // Use email prefix as fallback
          displayNameToUse = currentUser.email.split('@')[0];
        }
        
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
            
            // Set up pending challenges listeners
            // Incoming (to current user)
            const incomingChallengesQuery = query(
              collection(db, 'challenges'),
              where('toUid', '==', currentUser.uid),
              where('status', '==', 'pending')
            );

            // Outgoing (from current user) awaiting acceptance
            const outgoingChallengesQuery = query(
              collection(db, 'challenges'),
              where('fromUid', '==', currentUser.uid),
              where('status', '==', 'pending')
            );

            const unsubscribeIncoming = onSnapshot(incomingChallengesQuery, (snapshot) => {
              const incoming = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'incoming' }));
              setPendingChallenges(prev => {
                const outgoing = prev.filter(c => c._source === 'outgoing');
                const merged = [...incoming, ...outgoing];
                // Only incoming pending challenges should influence the Resume badge
                if (incoming.length > 0) setBadgeCleared(false);
                return merged;
              });
            }, (error) => {
              console.error('HomeScreen: Incoming challenges query error:', error);
            });

            const unsubscribeOutgoing = onSnapshot(outgoingChallengesQuery, (snapshot) => {
              const outgoing = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'outgoing' }));
              setPendingChallenges(prev => {
                const incoming = prev.filter(c => c._source === 'incoming');
                const merged = [...incoming, ...outgoing];
                // Outgoing pending challenges should not trigger/break the Resume badge state
                return merged;
              });
            }, (error) => {
              console.error('HomeScreen: Outgoing challenges query error:', error);
            });
            

            
            // Store the unsubscribe functions for cleanup
            // invitesUnsubscribeRef.current = unsubscribeInvites; // Disabled since gameInvites query is disabled
            
            if (challengesUnsubscribeRef.current) {
              const prev = challengesUnsubscribeRef.current;
              if (Array.isArray(prev)) prev.forEach(fn => fn && fn()); else if (typeof prev === 'function') prev();
            }
            challengesUnsubscribeRef.current = [unsubscribeIncoming, unsubscribeOutgoing];
            

            
            // Set up notifications listener
            const notificationsQuery = query(
              collection(db, 'notifications'),
              where('toUid', '==', currentUser.uid),
              where('read', '==', false)
            );
            const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
              const newNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

            // Listen for completed games with unseen results for badge on Resume
            // Use a more specific approach that respects Firestore security rules
            // Instead of querying all games, we'll track completed games through user's activeGames array
            // and check for completed status in a way that doesn't violate permissions
            const userDocRef = doc(db, 'users', currentUser.uid);
            
            const completedGamesQuery = onSnapshot(userDocRef, async (userDoc) => {
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const activeGameIds = userData.activeGames || [];
                const completedGameIds = userData.completedGames || [];
                
                // Combine both active and completed game IDs to check
                const allGameIds = [...activeGameIds, ...completedGameIds];
                
                if (allGameIds.length > 0) {
                  // Fetch game documents for these specific games
                  const gamePromises = allGameIds.map(gameId => getDoc(doc(db, 'games', gameId)));
                  const gameDocs = await Promise.all(gamePromises);
                  
                  const completedGames = [];
                  gameDocs.forEach((gameDoc) => {
                    if (gameDoc.exists()) {
                      const gameData = gameDoc.data();
                      if (gameData.type === 'pvp' && gameData.status === 'completed') {
                        completedGames.push({ id: gameDoc.id, ...gameData });
                      }
                    }
                  });
                  
                  // Process completed games for unseen results
                  let unseen = 0;
                  completedGames.forEach((gameData) => {
                    const playersArray = gameData.playerIds || gameData.players || [];
                    const seen = Array.isArray(gameData.resultsSeenBy) ? gameData.resultsSeenBy : [];
                    const firstFinisherId = gameData.firstFinisherId || null;
                    
                    if (firstFinisherId) {
                      if (firstFinisherId === currentUser.uid && !seen.includes(currentUser.uid)) unseen += 1;
                    } else {
                      const isPlayer1 = playersArray[0] === currentUser.uid;
                      const meSolved = isPlayer1 ? gameData.player1?.solved : gameData.player2?.solved;
                      const oppSolved = isPlayer1 ? gameData.player2?.solved : gameData.player1?.solved;
                      if (meSolved && !seen.includes(currentUser.uid)) {
                        unseen += 1;
                      }
                    }
                  });
                  
                  setUnseenResultsCount(unseen);
                  if (unseen > 0) setBadgeCleared(false);
                  prevUnseenCountRef.current = unseen;
                } else {
                  setUnseenResultsCount(0);
                }
              }
            }, (error) => {
              console.error('HomeScreen: User document query error for completed games:', error);
            });

            // Store the completed games query unsubscribe function
            if (completedResultsUnsubscribeRef.current) {
              completedResultsUnsubscribeRef.current();
            }
            completedResultsUnsubscribeRef.current = completedGamesQuery;

            // Listen for accepted challenges that indicate a game has started (P2 set their word)
            const acceptedChallengesQuery = query(
              collection(db, 'challenges'),
              where('fromUid', '==', currentUser.uid),
              where('status', '==', 'accepted')
            );

            const unsubscribeAccepted = onSnapshot(acceptedChallengesQuery, async (snapshot) => {
              try {
                let newCount = startedGameIdsRef.current.size;
                const notificationService = getNotificationService();
                snapshot.docs.forEach((docSnap) => {
                  const data = docSnap.data();
                  const challengeId = docSnap.id;
                  if (!startedGameIdsRef.current.has(challengeId)) {
                    startedGameIdsRef.current.add(challengeId);
                    newCount = startedGameIdsRef.current.size;
                    // Fire a local notification so P1 gets an immediate alert in Expo Go
                    notificationService.showLocalNotification({
                      title: 'Game Started',
                      body: `${data.toUsername || 'Your opponent'} set their word. Let the game begin!`,
                      data: { type: 'challenge_accepted', challengeId, gameId: data.gameId || null },
                      sound: true,
                      priority: 'high',
                    }).catch(() => {});
                    // Chime removed to prevent multiple sounds during sign-in
                  }
                });
                // Contribute to Resume badge when a game actually starts (P2 set word)
                setStartedGameCount(newCount);
                if (newCount > 0) setBadgeCleared(false);
              } catch (e) {
                console.error('HomeScreen: Accepted challenges listener error:', e);
              }
            }, (error) => {
              console.error('HomeScreen: Accepted challenges query error:', error);
            });

            // Include in cleanup
            challengesUnsubscribeRef.current = [unsubscribeIncoming, unsubscribeOutgoing, unsubscribeAccepted];
          } catch (error) {
            console.error('HomeScreen: Failed to set up listeners:', error);
          }
        }, 100); // Small delay to ensure UI is responsive
        
      } else {
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
              Promise.resolve().then(() => setIsSoundReady(true)).catch(() => setIsSoundReady(false)),
              checkFirstLaunch(),
              clearStuckGameState(), // Clear any stuck game state
              checkForResumableSoloGames(currentUser.uid), // Check for resumable solo games
              appUpdateService.checkForUpdates() // Check for app updates
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
                Promise.resolve(),
                checkFirstLaunch(),
                clearStuckGameState(), // Clear any stuck game state
                checkForResumableSoloGames(currentUser.uid), // Check for resumable solo games
                initializePushNotifications(currentUser.uid), // Initialize push notifications
                appUpdateService.checkForUpdates() // Check for app updates
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
          const prev = challengesUnsubscribeRef.current;
          if (Array.isArray(prev)) {
            prev.forEach(fn => fn && fn());
          } else if (typeof prev === 'function') {
            prev();
          }
        }

        if (notificationsUnsubscribeRef.current) {
          notificationsUnsubscribeRef.current();
        }

        if (completedResultsUnsubscribeRef.current) {
          completedResultsUnsubscribeRef.current();
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
        } catch (error) {
          console.error(`HomeScreen: Failed to clear ${key}:`, error);
        }
      }
      
    } catch (error) {
      console.error('HomeScreen: Failed to clear stuck game state:', error);
    }
  };

  const checkForResumableSoloGames = async (userId) => {
    try {
      const savedGames = await AsyncStorage.getItem('savedGames');
      if (savedGames) {
        const games = JSON.parse(savedGames);
        const resumableSoloGames = games.filter(game => 
          game.gameMode === 'solo' && 
          game.gameState !== 'gameOver' && 
          game.gameState !== 'maxGuesses' &&
          game.targetWord &&
          (game.playerId === userId || !game.playerId) // Include legacy games without playerId
        );
        
        if (resumableSoloGames.length > 0) {
          console.log('HomeScreen: Found resumable solo games:', resumableSoloGames.length);
          // The ResumeGamesScreen will handle displaying these
          // We could also show a notification here if desired
        }
      }
    } catch (error) {
      console.error('HomeScreen: Failed to check for resumable solo games:', error);
    }
  };

  const initializePushNotifications = async (userId) => {
    try {
      console.log('HomeScreen: Initializing push notifications for user:', userId);
      
      // Initialize the push notification service
      const pushToken = await pushNotificationService.initialize();
      
      if (pushToken) {
        // Save the push token to the user's Firestore document
        await pushNotificationService.savePushTokenToFirestore(userId, pushToken);
        console.log('HomeScreen: Push notifications initialized successfully');
        
        // Set up notification listeners
        pushNotificationService.setupNotificationListeners();
        
        // Show success message to user
        Alert.alert(
          'Notifications Enabled!',
          'You\'ll now receive notifications about new challenges, friend requests, and game updates.',
          [{ text: 'Got it!' }]
        );
      } else {
        console.log('HomeScreen: Push notifications not available (likely simulator)');
        
        // Show info message about notifications
        Alert.alert(
          'Notifications',
          'To receive notifications about new challenges and friend requests, please enable them in your device settings.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('HomeScreen: Failed to initialize push notifications:', error);
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
      
      // Note: Solo games are preserved across sign out/in
      // They are stored locally and will be available when user signs back in

    } catch (error) {
      console.error('HomeScreen: Sign out failed:', error);
    }
  };

  const handleRefreshProfile = async () => {
    try {
      if (user) {
        await loadUserProfile(user);
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
      
      // Simple navigation with error handling
      navigation.navigate(screen, params);
      playSound('chime');
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
        
        {/* Player Rank Display - Clickable to show rank ladder */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowRankModal(true)}
          style={[styles.rankDisplay, { backgroundColor: colors.surface, borderColor: colors.primary }]}
        >
          <Text style={[styles.rankLabel, { color: colors.textSecondary }]}>Rank:</Text>
          <Text style={[styles.rankValue, { color: colors.primary }]}>{getPlayerRank()}</Text>
        </TouchableOpacity>
        

        



        
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
            onPress={async () => {
              // Permanently delete notifications when user acknowledges them by going to Resume screen
              if (notifications.length > 0) {
                const notificationIds = notifications.map(notification => notification.id);
                await permanentlyDeleteNotifications(notificationIds);
              }
              
              // Clear the badge when user acknowledges by clicking Resume
              setBadgeCleared(true);
              
              handleButtonPress('ResumeGames');
            }}
          >
            <Text style={styles.buttonText}>Resume</Text>
          </TouchableOpacity>
          {/* Notification Badge: only incoming pending challenges and unread notifications */}
          {!badgeCleared && ((pendingChallenges.filter(c => c._source === 'incoming').length > 0) || notifications.length > 0) && (
            <View style={[styles.notificationBadge, { backgroundColor: '#FF4444' }]}>
              <Text style={styles.notificationBadgeText}>
                {pendingChallenges.filter(c => c._source === 'incoming').length + notifications.length}
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
              style={[styles.button, { backgroundColor: '#8B5CF6' }]}
              onPress={async () => {
                try {
                  const success = await pushNotificationService.sendTestNotification();
                  if (success) {
                    Alert.alert('Test Sent', 'Push notification sent! Check your notification bar.');
                  } else {
                    Alert.alert('Test Failed', 'Could not send test notification. Check console for details.');
                  }
                  setShowMenuModal(false);
                } catch (error) {
                  console.error('Test notification error:', error);
                  Alert.alert('Error', 'Failed to send test notification');
                  setShowMenuModal(false);
                }
              }}
            >
              <Text style={styles.buttonText}>Test Push Notification</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#FF6B35' }]}
              onPress={async () => {
                try {
                  await appUpdateService.forceCheckForUpdates();
                  Alert.alert('Update Check', 'Update check completed. Check console for details.');
                  setShowMenuModal(false);
                } catch (error) {
                  console.error('Update check error:', error);
                  Alert.alert('Error', 'Failed to check for updates');
                  setShowMenuModal(false);
                }
              }}
            >
              <Text style={styles.buttonText}>Test Update Check</Text>
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
      
      {/* Rank Ladder Modal */}
      <Modal visible={showRankModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.header, { color: colors.textPrimary }]}>Rank Ladder</Text>
            {(() => {
              const easyAvg = userProfile?.easyAverageScore ?? 0;
              const regularAvg = userProfile?.regularAverageScore ?? 0;
              const hardAvg = userProfile?.hardAverageScore ?? 0;

              const rankDefs = [
                { name: 'Rookie', metric: 'easy', label: 'Easy avg ≤ 20', target: 20 },
                { name: 'Word Learner', metric: 'easy', label: 'Easy avg ≤ 15', target: 15 },
                { name: 'Word Enthusiast', metric: 'easy', label: 'Easy avg ≤ 8', target: 8 },
                { name: 'Word Pro', metric: 'regular', label: 'Regular avg ≤ 12', target: 12 },
                { name: 'Word Expert', metric: 'regular', label: 'Regular avg ≤ 8', target: 8 },
                { name: 'Word Master', metric: 'hard', label: 'Hard avg ≤ 8', target: 8 },
              ];

              const metricValue = (metric) => {
                if (metric === 'easy') return easyAvg || 0;
                if (metric === 'regular') return regularAvg || 0;
                if (metric === 'hard') return hardAvg || 0;
                return 0;
              };
              const isMet = (metric, target) => {
                const v = metricValue(metric);
                return v > 0 && v <= target;
              };

              const ranks = ['Unranked', ...rankDefs.map(r => r.name)];
              const current = getPlayerRank();

              // Determine next rank target relative to current progress
              const highestMetIndex = rankDefs.reduce((acc, def, idx) => (isMet(def.metric, def.target) ? idx : acc), -1);
              const next = rankDefs[highestMetIndex + 1] || null;
              const youVal = next ? metricValue(next.metric) : 0;

              return (
                <View style={{ width: '100%', marginTop: 10, marginBottom: 10 }}>
                  {next && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700', textAlign: 'center' }}>
                        Next: {next.name}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 2 }}>
                        {next.label} • You: {youVal ? youVal.toFixed(1) : '—'}
                      </Text>
                    </View>
                  )}

                  {ranks.map((rank, index) => {
                    const def = rankDefs.find(d => d.name === rank);
                    const criteria = def ? def.label : null;
                    return (
                      <View key={`${rank}-${index}`} style={{ paddingVertical: 6 }}>
                        <Text style={{ color: rank === current ? colors.primary : colors.textPrimary, fontWeight: rank === current ? '700' : '500' }}>
                          {`${index + 1}. ${rank}`}{rank === current ? '  (You)' : ''}
                        </Text>
                        {criteria && (
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {criteria}
                          </Text>
                        )}
                        {rank === current && next && (
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            Next: {next.name} • {next.label} • You: {youVal ? youVal.toFixed(1) : '—'}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })()}
            <TouchableOpacity
              style={styles.button}
              onPress={() => setShowRankModal(false)}
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
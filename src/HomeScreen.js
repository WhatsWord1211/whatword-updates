import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, Image, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, updateDoc, deleteDoc, getDocs, orderBy, limit, getCountFromServer } from 'firebase/firestore';
import { generateUsernameFromEmail } from './usernameValidation';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styles from './styles';
import { playSound } from './soundsUtil';
import authService from './authService';
import { useTheme } from './ThemeContext';
import { getNotificationService } from './notificationService';
import pushNotificationService from './pushNotificationService';
import appUpdateService from './appUpdateService';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import AnimatedMeshGradient from './AnimatedMeshGradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, Easing } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

const HomeScreen = () => {
  const navigation = useNavigation();
  const { colors, updateNavigationBar } = useTheme();
  const insets = useSafeAreaInsets();

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
  // const [showRankModal, setShowRankModal] = useState(false); // OLD RANK SYSTEM - KEPT FOR FUTURE USE
  const [easyModeRank, setEasyModeRank] = useState(null);
  const [globalEasyRank, setGlobalEasyRank] = useState(null);
  const [timedStreakRank, setTimedStreakRank] = useState(null);
  const invitesUnsubscribeRef = useRef(null);
  const challengesUnsubscribeRef = useRef(null);

  const notificationsUnsubscribeRef = useRef(null);
  const completedResultsUnsubscribeRef = useRef(null);
  const prevUnseenCountRef = useRef(0);
  const prevNotificationCountRef = useRef(0);

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
      
      // Use the new permanent dismissal method
      const notificationService = getNotificationService();
      for (const id of notificationIds) {
        await notificationService.dismissNotificationPermanently(id);
      }
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

  // Load user's Easy Mode Solo leaderboard rank (same logic as LeaderboardScreen)
  const loadEasyModeRank = async (currentUser) => {
    try {
      // Load friends using same logic as LeaderboardScreen
      const friendsRef = collection(db, 'users', currentUser.uid, 'friends');
      const friendsQuery = query(friendsRef, where('status', '==', 'accepted'));
      const friendsSnapshot = await getDocs(friendsQuery);
      
      const friends = [];
      
      // Always include current user
      const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (currentUserDoc.exists()) {
        friends.push({
          uid: currentUser.uid,
          ...currentUserDoc.data()
        });
      }
      
      // Add all friends
      for (const friendDoc of friendsSnapshot.docs) {
        const friendUid = friendDoc.id;
        const friendUserDoc = await getDoc(doc(db, 'users', friendUid));
        if (friendUserDoc.exists()) {
          friends.push({
            uid: friendUid,
            ...friendUserDoc.data()
          });
        }
      }
      
      // Build leaderboard data for Easy mode (same logic as LeaderboardScreen)
      const leaderboardData = [];
      
      for (const friend of friends) {
        const runningAverage = friend.easyAverageScore || 0;
        const gamesCount = friend.easyGamesCount || 0;
        
        // Include players who have played games OR show current user even with 0 games
        if (runningAverage > 0 || friend.uid === currentUser.uid) {
          leaderboardData.push({
            uid: friend.uid,
            username: friend.username || friend.displayName || 'Unknown Player',
            displayName: friend.displayName || friend.username || 'Unknown Player',
            runningAverage: runningAverage,
            gamesCount: gamesCount,
            totalGames: friend.gamesPlayed || 0
          });
        }
      }
      
      // Sort by running average (lowest is best) - same as LeaderboardScreen
      leaderboardData.sort((a, b) => a.runningAverage - b.runningAverage);
      
      // Add ranks - same as LeaderboardScreen
      const rankedData = leaderboardData.map((player, index) => ({
        ...player,
        rank: index + 1
      }));
      
      // Find current user's rank - same as LeaderboardScreen
      const userRank = rankedData.find(player => player.uid === currentUser.uid);
      if (userRank && userRank.runningAverage > 0) {
        setEasyModeRank(userRank.rank);
      } else {
        setEasyModeRank(null); // N/A if no games played
      }
    } catch (error) {
      console.error('HomeScreen: Failed to load easy mode rank:', error);
      setEasyModeRank(null);
    }
  };

  // Load user's Global Easy Mode rank
  const loadGlobalEasyRank = async (currentUser) => {
    try {
      console.log('HomeScreen: Loading global EASY mode rank for user:', currentUser.uid);
      setGlobalEasyRank(null);
      
      // Check if user has 15+ games in easy mode
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (!userDoc.exists()) {
        console.log('HomeScreen: User document does not exist');
        setGlobalEasyRank(null);
        return;
      }

      const userData = userDoc.data();
      const easyGamesCount = userData.easyGamesCount || 0;
      const MIN_GAMES_REQUIRED = 15;

      console.log(`HomeScreen: User has ${easyGamesCount} easy games (required: ${MIN_GAMES_REQUIRED})`);

      // Check if user has minimum games
      if (easyGamesCount < MIN_GAMES_REQUIRED) {
        console.log('HomeScreen: User does not have enough easy games');
        setGlobalEasyRank(null); // N/A - not enough games
        return;
      }

      // Check inactivity (7 days threshold)
      let lastSoloActivity = userData.lastSoloActivity;
      if (!lastSoloActivity) {
        // Fallback: use lastGamePlayed if available
        if (userData.lastGamePlayed) {
          lastSoloActivity = userData.lastGamePlayed;
        }
      }

      if (lastSoloActivity) {
        const lastActivityDate = new Date(lastSoloActivity);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (lastActivityDate < sevenDaysAgo) {
          console.log('HomeScreen: User is inactive (last activity:', lastActivityDate, ')');
          setGlobalEasyRank(null); // N/A - inactive
          return;
        }
      } else {
        // No activity data - check if they have recent EASY games
        const recentGamesQuery = query(
          collection(db, 'leaderboard'),
          where('userId', '==', currentUser.uid),
          where('mode', '==', 'solo'),
          where('difficulty', '==', 'easy')
        );
        const recentGames = await getDocs(recentGamesQuery);
        if (recentGames.empty) {
          console.log('HomeScreen: No recent easy games found');
          setGlobalEasyRank(null); // N/A - no games
          return;
        }
        // Get most recent game
        const allGames = recentGames.docs.map(doc => ({
          timestamp: doc.data().timestamp
        }));
        const sortedGames = allGames.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (sortedGames.length > 0) {
          const lastGameDate = new Date(sortedGames[0].timestamp);
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (lastGameDate < sevenDaysAgo) {
            console.log('HomeScreen: User is inactive based on game timestamps');
            setGlobalEasyRank(null); // N/A - inactive
            return;
          }
        }
      }

      // Try to get rank from cached global leaderboard for EASY mode
      const leaderboardRef = doc(db, 'globalLeaderboard', 'easy');
      const leaderboardDoc = await getDoc(leaderboardRef);

      if (leaderboardDoc.exists()) {
        const cachedData = leaderboardDoc.data();
        const entries = cachedData.entries || [];
        const cachedAt = cachedData.calculatedAt?.toDate?.() || new Date(cachedData.calculatedAt || 0);
        console.log(`HomeScreen: Found cached easy leaderboard with ${entries.length} entries, cached at: ${cachedAt}`);
        
        // Check if user is in top 100
        const userEntry = entries.find(entry => entry.userId === currentUser.uid);
        
        if (userEntry && userEntry.rank !== undefined) {
          console.log('HomeScreen: Found user in cached easy leaderboard, rank:', userEntry.rank, 'finalScore:', userEntry.finalScore);
          setGlobalEasyRank(userEntry.rank);
          return;
        } else if (userEntry) {
          console.log('HomeScreen: User entry found but missing rank property:', userEntry);
          // Fall through to calculate estimated rank
        } else {
          console.log(`HomeScreen: User not in top ${entries.length} of cached easy leaderboard, will calculate estimated rank`);
        }
      } else {
        console.log('HomeScreen: No cached easy leaderboard document found');
      }

      // If not in cached top 100, calculate estimated rank using ONLY easy games
      // Use the same pattern as LeaderboardScreen (fetch all, filter in memory to avoid index requirement)
      const gamesQuery = query(
        collection(db, 'leaderboard'),
        where('userId', '==', currentUser.uid),
        where('mode', '==', 'solo')
      );
      
      const gamesSnapshot = await getDocs(gamesQuery);
      
      // Filter for easy games and sort in memory (same as LeaderboardScreen)
      // Use 'guesses' first (matching playerProfileService) for consistency with friends leaderboard
      const easyGames = gamesSnapshot.docs
        .map(doc => ({
          score: doc.data().guesses || doc.data().score || 0, // Use guesses first to match friends leaderboard
          timestamp: doc.data().timestamp,
          difficulty: doc.data().difficulty
        }))
        .filter(game => game.difficulty === 'easy')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, MIN_GAMES_REQUIRED);
      
      console.log(`HomeScreen: Found ${easyGames.length} easy games for score calculation`);
      
      if (easyGames.length < MIN_GAMES_REQUIRED) {
        console.log('HomeScreen: Not enough easy games for estimated rank calculation');
        setGlobalEasyRank(null); // N/A - not enough games
        return;
      }

      // Calculate user's score (rolling average of last 15 easy games)
      const totalScore = easyGames.reduce((sum, game) => sum + game.score, 0);
      const baseScore = totalScore / easyGames.length;
      
      console.log(`HomeScreen: Calculated base score for easy mode: ${baseScore.toFixed(2)}`);
      
      // Calculate activity bonuses (based on easy games only)
      let activityBonus = 0;
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentGames = easyGames.filter(game => new Date(game.timestamp) >= threeDaysAgo);
      if (recentGames.length >= 1) {
        activityBonus -= 0.5;
      }
      
      const last7DaysGames = easyGames.filter(game => new Date(game.timestamp) >= sevenDaysAgo);
      if (last7DaysGames.length >= 10) {
        activityBonus -= 0.5;
      }
      activityBonus = Math.max(activityBonus, -1.0);
      
      const finalScore = baseScore + activityBonus;
      console.log(`HomeScreen: Final score for easy mode: ${finalScore.toFixed(2)} (base: ${baseScore.toFixed(2)}, bonus: ${activityBonus.toFixed(2)})`);

      // Try to estimate rank from cached EASY leaderboard
      // Use the same logic as LeaderboardScreen
      if (leaderboardDoc.exists()) {
        const cachedData = leaderboardDoc.data();
        const entries = cachedData.entries || [];
        
        if (entries.length === 0) {
          console.log('HomeScreen: Cached easy leaderboard exists but has no entries');
          setGlobalEasyRank(null);
          return;
        }
        
        // Verify entries are sorted (they should be from LeaderboardScreen)
        // Count how many have better scores (lower is better) - same as LeaderboardScreen
        let rank = 1;
        for (const entry of entries) {
          // Ensure entry has finalScore (should always be the case)
          const entryScore = entry.finalScore !== undefined ? entry.finalScore : (entry.baseScore || 0) + (entry.activityBonus || 0);
          if (entryScore < finalScore) {
            rank++;
          } else {
            // Entries are sorted, so we can break here
            break;
          }
        }
        
        // Add the total eligible count if available (for users beyond top 100)
        // This gives a more accurate estimate
        const totalEligible = cachedData.totalEligible || entries.length;
        if (rank > entries.length) {
          // User is beyond top 100, but we know total eligible
          // Keep the estimated rank but it's beyond top 100
          console.log(`HomeScreen: Estimated easy mode rank: ${rank} (beyond top ${entries.length}, total eligible: ${totalEligible})`);
        } else {
          console.log(`HomeScreen: Estimated easy mode rank: ${rank}`);
        }
        
        setGlobalEasyRank(rank);
      } else {
        // No cached data - calculate leaderboard on-demand (same as LeaderboardScreen)
        // This happens when cache permissions fail or cache hasn't been created yet
        console.log('HomeScreen: No cached easy leaderboard found - calculating on-demand');
        
        // Calculate a minimal leaderboard to find user's rank
        // Get all users with 15+ easy games
        const usersQuery = query(
          collection(db, 'users'),
          where('easyGamesCount', '>=', MIN_GAMES_REQUIRED)
        );
        
        const usersSnapshot = await getDocs(usersQuery);
        console.log(`HomeScreen: Found ${usersSnapshot.size} users with ${MIN_GAMES_REQUIRED}+ easy games for on-demand calculation`);
        
        if (usersSnapshot.empty) {
          console.log('HomeScreen: No eligible users found');
          setGlobalEasyRank(null);
          return;
        }
        
        const leaderboardEntries = [];
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        // Process each user (similar to LeaderboardScreen but simplified)
        for (const userDoc of usersSnapshot.docs) {
          try {
            const userData = userDoc.data();
            const userId = userDoc.id;
            
            // Check inactivity
            let lastSoloActivity = userData.lastSoloActivity || userData.lastGamePlayed;
            if (lastSoloActivity) {
              const lastActivityDate = new Date(lastSoloActivity);
              if (lastActivityDate < sevenDaysAgo) {
                continue; // Skip inactive users
              }
            }
            
            // Get user's easy games
            const userGamesQuery = query(
              collection(db, 'leaderboard'),
              where('userId', '==', userId),
              where('mode', '==', 'solo')
            );
            
            const userGamesSnapshot = await getDocs(userGamesQuery);
            // Use 'guesses' first (matching playerProfileService) for consistency with friends leaderboard
            const allUserGames = userGamesSnapshot.docs.map(doc => ({
              score: doc.data().guesses || doc.data().score || 0, // Use guesses first to match friends leaderboard
              timestamp: doc.data().timestamp,
              difficulty: doc.data().difficulty
            }));
            
            const easyUserGames = allUserGames
              .filter(game => game.difficulty === 'easy')
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
              .slice(0, MIN_GAMES_REQUIRED);
            
            if (easyUserGames.length < MIN_GAMES_REQUIRED) continue;
            
            // Calculate score
            const totalScore = easyUserGames.reduce((sum, game) => sum + game.score, 0);
            const baseScore = totalScore / easyUserGames.length;
            
            let activityBonus = 0;
            const recentGames = easyUserGames.filter(game => new Date(game.timestamp) >= threeDaysAgo);
            if (recentGames.length >= 1) {
              activityBonus -= 0.5;
            }
            
            const last7DaysGames = easyUserGames.filter(game => new Date(game.timestamp) >= sevenDaysAgo);
            if (last7DaysGames.length >= 10) {
              activityBonus -= 0.5;
            }
            activityBonus = Math.max(activityBonus, -1.0);
            
            const finalScore = baseScore + activityBonus;
            
            leaderboardEntries.push({
              userId: userId,
              finalScore: finalScore
            });
          } catch (error) {
            console.error(`HomeScreen: Error processing user ${userDoc.id}:`, error);
            continue;
          }
        }
        
        // Calculate current user's finalScore (we already calculated it above, but ensure it's available)
        // We calculated finalScore earlier when checking cache, but if cache doesn't exist, we need to recalculate
        const userFinalScore = finalScore; // This should be defined from the earlier calculation above
        let rank = 1;
        for (const entry of leaderboardEntries) {
          if (entry.finalScore < userFinalScore) {
            rank++;
          } else {
            break;
          }
        }
        
        console.log(`HomeScreen: Calculated on-demand easy mode rank: ${rank} (out of ${leaderboardEntries.length} eligible users)`);
        setGlobalEasyRank(rank);
      }
    } catch (error) {
      console.error('HomeScreen: Failed to load global easy rank:', error);
      setGlobalEasyRank(null);
    }
  };

  const loadTimedStreakRank = async (currentUser) => {
    try {
      if (!currentUser) {
        setTimedStreakRank(null);
        return;
      }

      const streakField = 'timedStreakBest_easy';
      const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (!userDocSnap.exists()) {
        setTimedStreakRank(null);
        return;
      }

      const userData = userDocSnap.data();
      const userBestStreak = userData[streakField] || 0;

      if (userBestStreak <= 0) {
        setTimedStreakRank(null);
        return;
      }

      const topQuery = query(
        collection(db, 'users'),
        orderBy(streakField, 'desc'),
        limit(100)
      );
      const topSnapshot = await getDocs(topQuery);

      const topEntries = topSnapshot.docs
        .map((docSnap, index) => ({
          uid: docSnap.id,
          bestStreak: docSnap.data()[streakField] || 0,
          rank: index + 1,
        }))
        .filter(entry => entry.bestStreak > 0);

      const topMatch = topEntries.find(entry => entry.uid === currentUser.uid);
      if (topMatch) {
        setTimedStreakRank(topMatch.rank);
        return;
      }

      const countQuery = query(
        collection(db, 'users'),
        where(streakField, '>', userBestStreak),
        orderBy(streakField)
      );
      const countSnapshot = await getCountFromServer(countQuery);
      const higherCount = countSnapshot.data().count || 0;

      setTimedStreakRank(higherCount + 1);
    } catch (error) {
      console.error('HomeScreen: Failed to load timed streak rank:', error);
      setTimedStreakRank(null);
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
          displayNameToUse = await generateUsernameFromEmail(currentUser.email);
        }
        
        setDisplayName(displayNameToUse);
        
        // Store user profile data for rank calculation
        setUserProfile(userData);
        
        // Set up listeners for all authenticated users
        const setupListeners = () => {
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
              
              // Industry standard: Use ref to avoid badge flicker from concurrent updates
              if (newNotifications.length > prevNotificationCountRef.current) {
                setBadgeCleared(false);
              }
              prevNotificationCountRef.current = newNotifications.length;
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
              try {
                // Industry standard: Check if component is still mounted before async operations
                // Note: mounted is not available in this scope, so we'll handle errors gracefully instead
                
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  const activeGameIds = userData.activeGames || [];
                  const completedGameIds = userData.completedGames || [];
                  
                  // Combine both active and completed game IDs to check
                  const allGameIds = [...activeGameIds, ...completedGameIds];
                  
                  if (allGameIds.length > 0) {
                    // Fetch game documents for these specific games with error handling
                    const gamePromises = allGameIds.map(gameId => 
                      getDoc(doc(db, 'games', gameId)).catch(error => {
                        console.warn(`HomeScreen: Failed to fetch game ${gameId}:`, error);
                        return null; // Return null for failed fetches
                      })
                    );
                    
                    // Industry standard: Wrap Promise.all in try-catch to prevent unhandled rejections
                    let gameDocs;
                    try {
                      gameDocs = await Promise.all(gamePromises);
                    } catch (error) {
                      console.error('HomeScreen: Failed to fetch game documents:', error);
                      return; // Exit early if Promise.all fails
                    }
                    
                    // Async operation completed
                    
                    const completedGames = [];
                    gameDocs.forEach((gameDoc) => {
                      if (gameDoc && gameDoc.exists()) {
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
                        // Only show badge if current user is the first finisher and hasn't seen results
                        if (firstFinisherId === currentUser.uid && !seen.includes(currentUser.uid)) unseen += 1;
                      } else {
                        // Fallback for older games without firstFinisherId
                        // Determine who finished first by comparing solve times
                        const isPlayer1 = playersArray[0] === currentUser.uid;
                        const player1SolveTime = gameData.player1?.solveTime;
                        const player2SolveTime = gameData.player2?.solveTime;
                        
                        // Only show badge if current user finished first
                        let currentUserIsFirstFinisher = false;
                        if (player1SolveTime && player2SolveTime) {
                          // Both have solve times - compare them
                          if (isPlayer1) {
                            currentUserIsFirstFinisher = new Date(player1SolveTime) < new Date(player2SolveTime);
                          } else {
                            currentUserIsFirstFinisher = new Date(player2SolveTime) < new Date(player1SolveTime);
                          }
                        } else if (isPlayer1 && player1SolveTime && !player2SolveTime) {
                          // Only player1 solved
                          currentUserIsFirstFinisher = true;
                        } else if (!isPlayer1 && player2SolveTime && !player1SolveTime) {
                          // Only player2 solved
                          currentUserIsFirstFinisher = true;
                        }
                        
                        // Only count as unseen if user was first finisher and hasn't seen results
                        if (currentUserIsFirstFinisher && !seen.includes(currentUser.uid)) {
                          unseen += 1;
                        }
                      }
                    });
                    
                    // Update state
                    setUnseenResultsCount(unseen);
                    if (unseen > 0) setBadgeCleared(false);
                    prevUnseenCountRef.current = unseen;
                  } else {
                    setUnseenResultsCount(0);
                  }
                }
              } catch (error) {
                console.error('HomeScreen: Error in completed games query callback:', error);
                // Don't crash the app, just log the error
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
                // Load previously seen challenges from AsyncStorage
                const seenChallengesKey = `seenChallenges_${currentUser.uid}`;
                let seenChallenges = new Set();
                try {
                  const stored = await AsyncStorage.getItem(seenChallengesKey);
                  if (stored) {
                    seenChallenges = new Set(JSON.parse(stored));
                  }
                } catch (error) {
                  console.warn('HomeScreen: Failed to load seen challenges:', error);
                }
                
                let newCount = 0;
                const newSeenChallenges = new Set(seenChallenges);
                
                // Only process challenges that were accepted recently (within last 24 hours)
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                
                snapshot.docs.forEach((docSnap) => {
                  const data = docSnap.data();
                  const challengeId = docSnap.id;
                  
                  // Skip old challenges - check multiple possible timestamp fields
                  const acceptedAt = data.acceptedAt?.toDate?.() || 
                                   data.timestamp?.toDate?.() || 
                                   data.updatedAt?.toDate?.() ||
                                   new Date(0); // Default to epoch if no timestamp
                  
                  if (acceptedAt < oneDayAgo) {
                    return; // Skip old challenges
                  }
                  
                  // Track unseen challenges for badge count only (no notification on app open)
                  // Real-time push notifications are sent when events occur via gameService
                  if (!seenChallenges.has(challengeId)) {
                    newSeenChallenges.add(challengeId);
                    newCount++;
                  }
                });
                
                // Save updated seen challenges to AsyncStorage
                try {
                  await AsyncStorage.setItem(seenChallengesKey, JSON.stringify(Array.from(newSeenChallenges)));
                } catch (error) {
                  console.warn('HomeScreen: Failed to save seen challenges:', error);
                }
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
        }; // Call immediately instead of setTimeout to prevent memory leaks
        setupListeners();
        
      } else {
        // Create user profile if it doesn't exist
        const username = currentUser.email ? await generateUsernameFromEmail(currentUser.email) : `Player${Math.floor(Math.random() * 10000)}`;
        await setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          username: username,
          displayName: username,
          email: currentUser.email,
          createdAt: new Date(),
          lastLogin: new Date(),
          // Solo mode stats by difficulty
          easyGamesCount: 0,
          easyAverageScore: 0,
          regularGamesCount: 0,
          regularAverageScore: 0,
          hardGamesCount: 0,
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
        const emailName = await generateUsernameFromEmail(currentUser.email);
        setDisplayName(emailName);
      } else {
        setDisplayName('Player');
      }
    }
  };

  // Initialize push notifications - defined here so it's available in useEffect
  const initializePushNotifications = async (userId) => {
    try {
      console.log('HomeScreen: Initializing push notifications for user:', userId);
      
      // Check if we've already requested permissions for this user in this session
      const permissionRequestedKey = `notification_permission_requested_${userId}`;
      const hasRequestedPermissions = await AsyncStorage.getItem(permissionRequestedKey);
      
      // For existing users, check if they have notification permissions
      const { status: permissionStatus } = await Notifications.getPermissionsAsync();
      console.log('HomeScreen: Current permission status:', permissionStatus);
      
      if (permissionStatus === 'granted') {
        console.log('HomeScreen: Permissions already granted, initializing...');
        
        // Always initialize to ensure token validation runs (fixes corrupted tokens)
        const pushToken = await pushNotificationService.initialize(userId);
        
        if (pushToken) {
          console.log('HomeScreen: Push notifications initialized successfully');
          
          // Set up notification listeners
          pushNotificationService.setupNotificationListeners();
        }
      } else {
        console.log('HomeScreen: Permissions not granted yet - will ask at relevant moment');
        // Industry standard: Don't ask here - will ask contextually when user uses social features
      }
    } catch (error) {
      console.error('HomeScreen: Failed to initialize push notifications:', error);
      // Don't show error alert for initialization failures
    }
  };

  // Update navigation bar when modals appear/disappear - with delay to ensure it happens after modal renders
  useEffect(() => {
    if (updateNavigationBar) {
      // Immediate update
      updateNavigationBar();
      // Also update after a small delay to catch any system resets
      const timeout = setTimeout(() => {
        updateNavigationBar();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [showMenuModal, showInvalidPopup, updateNavigationBar]);

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
              loadEasyModeRank(currentUser),
              loadGlobalEasyRank(currentUser),
              loadTimedStreakRank(currentUser),
              Promise.resolve().then(() => setIsSoundReady(true)).catch(() => setIsSoundReady(false)),
              checkFirstLaunch(),
              clearStuckGameState(), // Clear any stuck game state
              checkForResumableSoloGames(currentUser.uid), // Check for resumable solo games
              appUpdateService.checkForUpdates(), // Check for Google Play Store updates
              checkForEASUpdates() // Check for EAS Updates
            ]).catch(console.error);
            
            // Initialize push notifications separately to avoid blocking other operations
            initializePushNotifications(currentUser.uid).catch(error => {
              console.error('HomeScreen: Push notification initialization failed:', error);
            });
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
                loadEasyModeRank(currentUser),
                loadGlobalEasyRank(currentUser),
                loadTimedStreakRank(currentUser),
                Promise.resolve(),
                checkFirstLaunch(),
                clearStuckGameState(), // Clear any stuck game state
                checkForResumableSoloGames(currentUser.uid), // Check for resumable solo games
                appUpdateService.checkForUpdates() // Check for app updates
              ]).catch(console.error);
              
              // Initialize push notifications separately to avoid blocking other operations
              initializePushNotifications(currentUser.uid).catch(error => {
                console.error('HomeScreen: Push notification initialization failed:', error);
              });
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
      
      // Industry standard: Clean up all listeners to prevent memory leaks
      try {
        // Clean up challenges listeners
        if (challengesUnsubscribeRef.current) {
          const prev = challengesUnsubscribeRef.current;
          if (Array.isArray(prev)) {
            prev.forEach(fn => {
              try {
                if (fn && typeof fn === 'function') fn();
              } catch (error) {
                console.warn('HomeScreen: Error cleaning up challenges listener:', error);
              }
            });
          } else if (typeof prev === 'function') {
            try {
              prev();
            } catch (error) {
              console.warn('HomeScreen: Error cleaning up challenges listener:', error);
            }
          }
        }

        // Clean up notifications listener
        if (notificationsUnsubscribeRef.current) {
          try {
            notificationsUnsubscribeRef.current();
          } catch (error) {
            console.warn('HomeScreen: Error cleaning up notifications listener:', error);
          }
        }

        // Clean up completed results listener
        if (completedResultsUnsubscribeRef.current) {
          try {
            completedResultsUnsubscribeRef.current();
          } catch (error) {
            console.warn('HomeScreen: Error cleaning up completed results listener:', error);
          }
        }
      } catch (error) {
        console.error('HomeScreen: Error during cleanup:', error);
      }
    };
  }, []);

  // Refresh user profile when screen comes into focus to get updated averages and ranks
  useFocusEffect(
    React.useCallback(() => {
      if (user && !isAuthenticating) {
        refreshUserProfile(user);
        loadEasyModeRank(user);
        loadGlobalEasyRank(user);
        loadTimedStreakRank(user);
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

  const checkForEASUpdates = async () => {
    try {
      console.log('HomeScreen: EAS Updates check starting...');
      console.log('HomeScreen: __DEV__:', __DEV__);
      console.log('HomeScreen: Updates.isEnabled:', Updates.isEnabled);
      
      if (!__DEV__ && Updates.isEnabled) {
        console.log('HomeScreen: Checking for EAS Updates...');
        const update = await Updates.checkForUpdateAsync();
        
        console.log('HomeScreen: Update check result:', update);
        
        if (update.isAvailable) {
          console.log('HomeScreen: EAS Update available, downloading...');
          await Updates.fetchUpdateAsync();
          console.log('HomeScreen: EAS Update downloaded, restarting app...');
          await Updates.reloadAsync();
        } else {
          console.log('HomeScreen: No EAS Updates available');
        }
      } else {
        console.log('HomeScreen: EAS Updates disabled - __DEV__:', __DEV__, 'Updates.isEnabled:', Updates.isEnabled);
      }
    } catch (error) {
      console.error('HomeScreen: Failed to check for EAS Updates:', error);
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


  // Function to get player rank (KEPT FOR FUTURE USE)
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

  // Format rank with ordinal suffix (1st, 2nd, 3rd, etc.)
  const formatRankOrdinal = (rank) => {
    if (!rank) return '---';
    const suffix = ['th', 'st', 'nd', 'rd'];
    const value = rank % 100;
    return rank + (suffix[(value - 20) % 10] || suffix[value] || suffix[0]) + ' Place';
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

  // Animated Button Component with gradient, inner shadow, scale, and shine
  const AnimatedButton = ({ onPress, children, style }) => {
    const scale = useSharedValue(1);
    const shinePosition = useSharedValue(-200);
    const buttonRef = useRef(null);
    const [buttonDimensions, setButtonDimensions] = useState({ width: 0, height: 0 });
    const gradientIdRef = useRef(`gradient-${Math.random().toString(36).substr(2, 9)}`);

    const animatedStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: scale.value }],
      };
    });

    const shineStyle = useAnimatedStyle(() => {
      return {
        transform: [{ translateX: shinePosition.value }],
      };
    });

    const handlePressIn = () => {
      scale.value = withSpring(1.05, {
        damping: 10,
        stiffness: 300,
      });
      shinePosition.value = withTiming(buttonDimensions.width || 200, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      });
    };

    const handlePressOut = () => {
      scale.value = withSpring(1, {
        damping: 10,
        stiffness: 300,
      });
      shinePosition.value = withTiming(-200, {
        duration: 0,
      });
    };

    const onLayout = (event) => {
      const { width, height } = event.nativeEvent.layout;
      if (width > 0 && height > 0) {
        setButtonDimensions({ width, height });
      }
    };

    return (
      <Animated.View style={[animatedStyle, { width: '90%', maxWidth: 500, minWidth: 280, alignSelf: 'center' }]}>
        <TouchableOpacity
          ref={buttonRef}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onLayout={onLayout}
          activeOpacity={1}
          style={[styles.animatedButton, style]}
        >
          {/* Gradient Background using SVG with proper dimensions */}
          {buttonDimensions.width > 0 && buttonDimensions.height > 0 && (
            <Svg 
              style={StyleSheet.absoluteFill} 
              width={buttonDimensions.width} 
              height={buttonDimensions.height}
              viewBox={`0 0 ${buttonDimensions.width} ${buttonDimensions.height}`}
            >
              <Defs>
                <SvgLinearGradient id={gradientIdRef.current} x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor="#FF8C42" stopOpacity="1" />
                  <Stop offset="100%" stopColor="#FF6B35" stopOpacity="1" />
                </SvgLinearGradient>
              </Defs>
              <Rect 
                width={buttonDimensions.width} 
                height={buttonDimensions.height} 
                rx={8} 
                fill={`url(#${gradientIdRef.current})`} 
              />
            </Svg>
          )}
          
          {/* Fallback solid color while dimensions are being measured */}
          {buttonDimensions.width === 0 && (
            <View style={styles.buttonGradientBase} />
          )}
          
          {/* Inner Shadow Overlay */}
          <View style={styles.buttonInnerShadow} />
          
          {/* Shine Effect */}
          <Animated.View style={[styles.buttonShine, shineStyle]} />
          
          {/* Button Content */}
          <View style={{ zIndex: 10, position: 'relative' }}>
            {children}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // iOS PvP completion ad handling removed - now handled directly in PvPGameScreen

  return (
    <>
      {/* Show status bar on menu screens */}
      <StatusBar hidden={false} barStyle="light-content" />
      
      {/* Animated Mesh Gradient Background */}
      <AnimatedMeshGradient style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }} />
      
      {/* FAB - Positioned outside SafeAreaView to avoid any container constraints */}
      <TouchableOpacity
        style={[styles.fabTopHomeScreen, { top: insets.top + 5, zIndex: 10 }]}
        onPress={() => {
          setShowMenuModal(true);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.fabText}>☰</Text>
      </TouchableOpacity>
      
      <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: 'transparent' }}>
        <View style={[styles.screenContainer, { backgroundColor: 'transparent', paddingTop: insets.top + 55, zIndex: 1 }]}>
        {/* Fixed Header Image - Outside ScrollView */}
        <View style={{ alignItems: 'center', width: '100%' }}>
          <Image
            source={require('../assets/images/WhatWord-header.png')}
            style={[styles.imageHeader, { marginTop: -10, marginBottom: 20 }]}
            resizeMode="contain"
          />
        </View>
      
      {/* Content */}
      <View
        style={{ flex: 1, width: '100%', paddingTop: 0, paddingBottom: 20, alignItems: 'center' }}
      >
        
        {/* Easy Mode Leaderboard Positions - Clickable to go to Leaderboard */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            playSound('rank');
            navigation.navigate('Leaderboard', { initialTab: 'solo', initialDifficulty: 'easy' });
          }}
          style={[styles.rankDisplay, { backgroundColor: colors.surface, borderColor: colors.primary, marginTop: 10, marginBottom: 10 }]}
        >
          <Text style={[styles.rankLabel, { color: colors.textSecondary }]}>Friends Rank:</Text>
          <Text style={[styles.rankValue, { color: colors.primary }]}>
            {easyModeRank ? formatRankOrdinal(easyModeRank) : 'N/A'}
          </Text>
        </TouchableOpacity>

        {/* Global Rank - HIDDEN */}
        {/* <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            playSound('rank');
            navigation.navigate('Leaderboard', { initialTab: 'global', initialDifficulty: 'easy' });
          }}
          style={[styles.rankDisplay, { backgroundColor: colors.surface, borderColor: colors.primary, marginBottom: 10 }]}
        >
          <Text style={[styles.rankLabel, { color: colors.textSecondary }]}>Global Rank:</Text>
          <Text style={[styles.rankValue, { color: colors.primary }]}>
            {globalEasyRank ? formatRankOrdinal(globalEasyRank) : 'N/A'}
          </Text>
        </TouchableOpacity> */}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            playSound('rank');
            navigation.navigate('Leaderboard', { initialTab: 'global', initialDifficulty: 'timed' });
          }}
          style={[styles.rankDisplay, { backgroundColor: colors.surface, borderColor: colors.primary, marginBottom: 35 }]}
        >
          <Text style={[styles.rankLabel, { color: colors.textSecondary }]}>Streak Rank:</Text>
          <Text style={[styles.rankValue, { color: colors.primary }]}>
            {timedStreakRank ? formatRankOrdinal(timedStreakRank) : 'N/A'}
          </Text>
        </TouchableOpacity>
        

        



        
        {/* PvP Button */}
        <AnimatedButton
          onPress={() => {
            playSound('chime');
            navigation.navigate('CreateChallenge');
          }}
        >
          <Text style={styles.buttonText}>Play A Friend</Text>
        </AnimatedButton>
        
        <AnimatedButton
          onPress={() => handleButtonPress('SoloModeSelect')}
        >
          <Text style={styles.buttonText}>Play Solo</Text>
        </AnimatedButton>
        

        
        <View style={{ position: 'relative', width: '100%' }}>
          <AnimatedButton
            onPress={async () => {
              // Permanently delete notifications when user acknowledges them by going to Resume screen
              if (notifications.length > 0) {
                const notificationIds = notifications.map(notification => notification.id);
                await permanentlyDeleteNotifications(notificationIds);
              }
              
              // Best-effort: clear delivered notifications and reset app badge on device
              try {
                // Check if getDeliveredNotificationsAsync is available (not in Expo Go)
                if (Notifications.getDeliveredNotificationsAsync) {
                  const delivered = await Notifications.getDeliveredNotificationsAsync();
                  const deliveredIds = (delivered || []).map(n => n.request?.identifier).filter(Boolean);
                  if (deliveredIds.length > 0) {
                    await Notifications.dismissAllNotificationsAsync();
                  }
                } else {
                  // Fallback for Expo Go - just dismiss all
                  await Notifications.dismissAllNotificationsAsync();
                }
                console.log('HomeScreen: Cleared all device notifications');
              } catch (error) {
                console.error('HomeScreen: Failed to clear device notifications:', error);
              }
            
            try {
              // Reset badge count to zero on platforms that support it
              await Notifications.setBadgeCountAsync(0);
              console.log('HomeScreen: Reset badge count to 0');
            } catch (error) {
              console.error('HomeScreen: Failed to reset badge count:', error);
            }

            // Clear the badge when user acknowledges by clicking Resume
            setBadgeCleared(true);
            
            // Delete all game completion and game started notifications since user is acknowledging them
            // These are one-time notifications that don't need to persist
            if (notifications.length > 0) {
              const gameNotifs = notifications.filter(n => 
                n.type === 'game_completed' || n.data?.type === 'game_completed' ||
                n.type === 'game_started' || n.data?.type === 'game_started'
              );
              
              gameNotifs.forEach(notification => {
                deleteDoc(doc(db, 'notifications', notification.id)).catch(err => 
                  console.error('Failed to delete game notification:', err)
                );
              });
              
              // Mark other notifications as read
              const otherNotifs = notifications.filter(n => 
                n.type !== 'game_completed' && n.data?.type !== 'game_completed' &&
                n.type !== 'game_started' && n.data?.type !== 'game_started'
              );
              
              otherNotifs.forEach(notification => {
                markNotificationAsRead(notification.id).catch(err => 
                  console.error('Failed to mark notification as read:', err)
                );
              });
            }
              
            handleButtonPress('ResumeGames');
            }}
          >
            <Text style={styles.buttonText}>Resume</Text>
          </AnimatedButton>
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
          activeOpacity={0.7}
          onPress={() => handleButtonPress('HowToPlay')}
          style={{ marginTop: 20, marginBottom: 8 }}
        >
          <View style={styles.howToPlayLinkContainer}>
            <Text style={styles.howToPlayLink}>How To Play</Text>
          </View>
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
      
      <Modal visible={showMenuModal} transparent animationType="fade" statusBarTranslucent={false}>
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
      
      {/* OLD RANK LADDER MODAL - KEPT FOR FUTURE USE BUT DISABLED */}
      {/* 
      <Modal visible={showRankModal} transparent animationType="fade" statusBarTranslucent={false}>
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
      */}

      <Modal visible={showInvalidPopup} transparent animationType="fade" statusBarTranslucent={false}>
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.winTitle, { color: colors.textPrimary }]}>Error</Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary }]}>An error occurred. Please try again.</Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
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
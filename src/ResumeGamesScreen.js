import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, FlatList, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, onSnapshot, collection, query, where, updateDoc, addDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';
import adService from './adService';
import gameService from './gameService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './ThemeContext';

const ResumeGamesScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [user, setUser] = useState(null);
  const [soloGames, setSoloGames] = useState([]);
  const [pvpGames, setPvpGames] = useState([]);
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [waitingForOpponentGames, setWaitingForOpponentGames] = useState([]);
  const [completedUnseenGames, setCompletedUnseenGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChallengeResponsePopup, setShowChallengeResponsePopup] = useState(false);
  const [challengeData, setChallengeData] = useState(null);
  const [showCancelChallengeConfirm, setShowCancelChallengeConfirm] = useState(false);
  const [showChallengeCanceledPopup, setShowChallengeCanceledPopup] = useState(false);
  const [challengeToCancel, setChallengeToCancel] = useState(null);
  
  // This screen now shows:
  // 1. Pending challenges (waiting for acceptance)
  // 2. Active games (games in progress)
  // 3. Games waiting for opponent to solve
  // 4. Solo games (if any)

  useFocusEffect(
    React.useCallback(() => {
      let authUnsubscribe = null;
      let challengesUnsubscribe = null;
      let gamesUnsubscribe = null;
      let completedUnsubscribe = null;

      const setupListeners = async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          const unsubscribers = await loadUserGames(currentUser.uid);
          if (unsubscribers) {
            challengesUnsubscribe = unsubscribers.challengesUnsubscribe;
            gamesUnsubscribe = unsubscribers.gamesUnsubscribe;
            completedUnsubscribe = unsubscribers.completedUnsubscribe;
          }
        }
      };

      authUnsubscribe = auth.onAuthStateChanged(setupListeners);

      return () => {
        // Industry standard: Clean up all Firebase listeners to prevent memory leaks
        try {
          if (authUnsubscribe) authUnsubscribe();
          if (challengesUnsubscribe) challengesUnsubscribe();
          if (gamesUnsubscribe) gamesUnsubscribe();
          if (completedUnsubscribe) completedUnsubscribe();
        } catch (error) {
          console.warn('ResumeGamesScreen: Error during cleanup:', error);
        }
      };
    }, [])
  );

  const loadSoloGames = async (userId) => {
    try {
      const savedGames = await AsyncStorage.getItem('savedGames');
      if (savedGames) {
        const games = JSON.parse(savedGames);
        // Filter for solo games that are not completed AND belong to the current user
        // For backward compatibility, also include solo games without playerId (legacy games)
        const soloGames = games.filter(game => 
          game.gameMode === 'solo' && 
          game.gameState !== 'gameOver' && 
          game.gameState !== 'maxGuesses' &&
          game.targetWord &&
          (game.playerId === userId || !game.playerId) // Include legacy games without playerId
        );
        
        // Migrate legacy solo games by adding playerId
        let needsUpdate = false;
        const migratedGames = soloGames.map(game => {
          if (!game.playerId) {
            needsUpdate = true;
            return { ...game, playerId: userId };
          }
          return game;
        });
        
        // Update AsyncStorage if any games were migrated
        if (needsUpdate) {
          const updatedGames = games.map(game => {
            if (game.gameMode === 'solo' && !game.playerId) {
              return { ...game, playerId: userId };
            }
            return game;
          });
          await AsyncStorage.setItem('savedGames', JSON.stringify(updatedGames));
          console.log('ResumeGamesScreen: Migrated legacy solo games with playerId');
        }
        
        // Sort solo games chronologically with oldest first
        migratedGames.sort((a, b) => {
          const dateA = new Date(a.timestamp || 0);
          const dateB = new Date(b.timestamp || 0);
          return dateA - dateB; // Oldest first (ascending order)
        });
        
        setSoloGames(migratedGames);
      } else {
        setSoloGames([]);
      }
    } catch (error) {
      console.error('ResumeGamesScreen: Failed to load solo games:', error);
      setSoloGames([]);
    }
  };

  const loadUserGames = async (userId) => {
    try {
      setLoading(true);
      
      // Get user document
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        setSoloGames([]);
        setPvpGames([]);
        setPendingChallenges([]);
        setWaitingForOpponentGames([]);
        setCompletedUnseenGames([]);
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      
      // Load solo games from AsyncStorage (these are stored locally)
      await loadSoloGames(userId);
      
      // Load pending challenges (games waiting for acceptance)
      const challengesUnsubscribe = await loadPendingChallenges(userId);
      
      // Load active games and games waiting for opponent
      const gamesUnsubscribe = await loadActiveAndWaitingGames(userId);
      
      // Check for quit notifications
      await checkQuitNotifications(userId);
      
      // Store unsubscribe functions for cleanup
      return { challengesUnsubscribe, gamesUnsubscribe };
      
    } catch (error) {
      console.error('Failed to load user games:', error);
      Alert.alert('Error', 'Failed to load games. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const markResultsSeen = async (gameId) => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      await updateDoc(doc(db, 'games', gameId), {
        resultsSeenBy: arrayUnion(uid)
      });

      // After marking as seen, check if both players have seen results and archive
      const gameRef = doc(db, 'games', gameId);
      const snap = await getDoc(gameRef);
      if (snap.exists()) {
        const data = snap.data();
        const playerIds = data.playerIds || data.players || [];
        const seen = Array.isArray(data.resultsSeenBy) ? data.resultsSeenBy : [];
        if (playerIds.length >= 2 && playerIds.every(p => seen.includes(p))) {
          await gameService.deleteCompletedGame(gameId, data);
        }
      }
    } catch (error) {
      console.error('Failed to mark results seen:', error);
    }
  };

  const handleClearAllCompleted = () => {
    try {
      if (!completedUnseenGames || completedUnseenGames.length === 0) return;
      Alert.alert(
        'Clear Completed Results',
        'Are you sure you want to clear all completed games from this list? This will mark them as viewed for you.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear All',
            style: 'destructive',
            onPress: async () => {
              try {
                const ids = completedUnseenGames.map(g => g.gameId);
                await Promise.all(ids.map(id => markResultsSeen(id)));
                setCompletedUnseenGames([]);
                playSound('chime').catch(() => {});
              } catch (error) {
                console.error('Failed to clear all completed games:', error);
                Alert.alert('Error', 'Failed to clear completed games. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error preparing clear all completed:', error);
    }
  };

  const loadPendingChallenges = async (userId) => {
    try {
      // Incoming pending challenges (to current user)
      const incomingQuery = query(
        collection(db, 'challenges'),
        where('toUid', '==', userId),
        where('status', '==', 'pending')
      );

      // Outgoing pending challenges (from current user)
      const outgoingQuery = query(
        collection(db, 'challenges'),
        where('fromUid', '==', userId),
        where('status', '==', 'pending')
      );

      const unsubscribeIncoming = onSnapshot(incomingQuery, (snapshot) => {
        const incoming = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'incoming' }));
        setPendingChallenges(prev => {
          const outgoing = prev.filter(c => c._source === 'outgoing');
          const merged = [...incoming, ...outgoing].map(challenge => {
            const isRecipient = (challenge.toUid === userId || challenge.to === userId);
            return {
              ...challenge,
              fromUsername: challenge.fromUsername || 'Loading...',
              toUsername: challenge.toUsername || 'Loading...',
              gameType: isRecipient ? 'pending_challenge' : 'awaiting_acceptance'
            };
          });
          
          // Group challenges by type and sort each group chronologically
          const challengeFrom = merged.filter(c => c.gameType === 'pending_challenge');
          const waitingFor = merged.filter(c => c.gameType === 'awaiting_acceptance');
          
          // Sort each subgroup chronologically with oldest first
          challengeFrom.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
            const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
            return dateA - dateB;
          });
          
          waitingFor.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
            const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
            return dateA - dateB;
          });
          
          // Combine with "Challenge from" first, then "Waiting for"
          const sorted = [...challengeFrom, ...waitingFor];
          
          return sorted;
        });
        
        // Then fetch usernames asynchronously
        snapshot.docs.forEach(async (docSnap) => {
          const challenge = { id: docSnap.id, ...docSnap.data() };
          try {
            // Get sender and recipient UIDs (handle both field naming conventions)
            const senderUid = challenge.fromUid || challenge.from;
            const recipientUid = challenge.toUid || challenge.to;
            
            // Fetch sender username
            const senderDoc = await getDoc(doc(db, 'users', senderUid));
            const fromUsername = senderDoc.exists() ? (senderDoc.data().username || 'Unknown User') : 'Unknown User';
            
            // Fetch recipient username
            const recipientDoc = await getDoc(doc(db, 'users', recipientUid));
            const toUsername = recipientDoc.exists() ? (recipientDoc.data().username || 'Unknown User') : 'Unknown User';
            
            // Update the challenge with both usernames
            setPendingChallenges(prevChallenges => 
              prevChallenges.map(prevChallenge => 
                prevChallenge.id === challenge.id 
                  ? { ...prevChallenge, fromUsername, toUsername }
                  : prevChallenge
              )
            );
          } catch (error) {
            console.error('Failed to get usernames:', error);
          }
        });
      });

      const unsubscribeOutgoing = onSnapshot(outgoingQuery, (snapshot) => {
        const outgoing = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'outgoing' }));
        setPendingChallenges(prev => {
          const incoming = prev.filter(c => c._source === 'incoming');
          const merged = [...incoming, ...outgoing].map(challenge => {
            const isRecipient = (challenge.toUid === userId || challenge.to === userId);
            return {
              ...challenge,
              fromUsername: challenge.fromUsername || 'Loading...',
              toUsername: challenge.toUsername || 'Loading...',
              gameType: isRecipient ? 'pending_challenge' : 'awaiting_acceptance'
            };
          });
          
          // Group challenges by type and sort each group chronologically
          const challengeFrom = merged.filter(c => c.gameType === 'pending_challenge');
          const waitingFor = merged.filter(c => c.gameType === 'awaiting_acceptance');
          
          // Sort each subgroup chronologically with oldest first
          challengeFrom.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
            const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
            return dateA - dateB;
          });
          
          waitingFor.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
            const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
            return dateA - dateB;
          });
          
          // Combine with "Challenge from" first, then "Waiting for"
          const sorted = [...challengeFrom, ...waitingFor];
          
          return sorted;
        });
      });

      // Store unsubscribe function for cleanup
      return () => {
        unsubscribeIncoming && unsubscribeIncoming();
        unsubscribeOutgoing && unsubscribeOutgoing();
      };
    } catch (error) {
      console.error('Failed to load pending challenges:', error);
      setPendingChallenges([]);
    }
  };

  const loadActiveAndWaitingGames = async (userId) => {
    try {
      // Simplified query - only use playerIds to avoid conflicts
      const gamesQuery = query(
        collection(db, 'games'),
        where('type', '==', 'pvp'),
        where('playerIds', 'array-contains', userId)
      );

      const unsubscribeActive = onSnapshot(gamesQuery, (snapshot) => {
        try {
          const activeGames = [];
          const waitingGames = [];
          const completedPendingResults = [];

          snapshot.docs.forEach(docSnap => {
            const gameData = docSnap.data();
            const gameId = docSnap.id;
            const playersArray = gameData.playerIds || [];
            if (!playersArray.includes(userId)) return;

            const playerIndex = playersArray.indexOf(userId);
            const opponentIndex = playerIndex === 0 ? 1 : 0;
            const opponentUid = playersArray[opponentIndex];
            if (!opponentUid) return;

            const isPlayer1 = userId === playersArray[0];
            const currentPlayerSolved = isPlayer1 ? gameData.player1?.solved : gameData.player2?.solved;
            const opponentSolved = isPlayer1 ? gameData.player2?.solved : gameData.player1?.solved;

            const base = {
              gameId: docSnap.id, // Use the document ID as gameId
              opponent: 'Loading...',
              opponentUid,
              wordLength: gameData.wordLength || 4,
              lastActivity: gameData.lastActivity || gameData.createdAt,
              createdAt: gameData.createdAt, // Ensure createdAt is available for sorting
              gameMode: 'pvp',
              gameStatus: gameData.status,
              currentPlayerSolved: !!currentPlayerSolved,
              opponentSolved: !!opponentSolved,
              isMyTurn: !currentPlayerSolved
            };

            if (gameData.status === 'completed') {
              const resultsSeenBy = Array.isArray(gameData.resultsSeenBy) ? gameData.resultsSeenBy : [];
              if (!resultsSeenBy.includes(userId)) {
                completedPendingResults.push({
                  ...base,
                  gameType: 'completed_pending_results'
                });
              }
            } else if (gameData.status === 'waiting_for_opponent') {
              if (currentPlayerSolved && !opponentSolved) {
                waitingGames.push({ ...base, gameType: 'waiting_for_opponent' });
              } else {
                activeGames.push({
                  ...base,
                  gameType: 'active_game',
                  message: base.isMyTurn ? 'Your turn' : 'Waiting'
                });
              }
            } else if (gameData.status === 'active' || gameData.status === 'ready') {
              activeGames.push({
                ...base,
                gameType: 'active_game',
                message: currentPlayerSolved ? 'Waiting for opponent' : (base.isMyTurn ? 'Your turn' : 'Waiting')
              });
            }
          });

          // Sort completed games chronologically with oldest first
          completedPendingResults.sort((a, b) => {
            // Use createdAt for chronological ordering (when game was started)
            // Fallback to lastActivity if createdAt is not available
            const dateA = a.createdAt?.toDate?.() || a.createdAt || a.lastActivity?.toDate?.() || a.lastActivity || new Date(0);
            const dateB = b.createdAt?.toDate?.() || b.createdAt || b.lastActivity?.toDate?.() || b.lastActivity || new Date(0);
            return dateA - dateB; // Oldest first (ascending order)
          });

          // Sort active games chronologically with oldest first
          activeGames.sort((a, b) => {
            // Use createdAt for chronological ordering (when game was started)
            // Fallback to lastActivity if createdAt is not available
            const dateA = a.createdAt?.toDate?.() || a.createdAt || a.lastActivity?.toDate?.() || a.lastActivity || new Date(0);
            const dateB = b.createdAt?.toDate?.() || b.createdAt || b.lastActivity?.toDate?.() || b.lastActivity || new Date(0);
            return dateA - dateB; // Oldest first (ascending order)
          });

          setPvpGames(activeGames);
          setWaitingForOpponentGames(waitingGames);
          setCompletedUnseenGames(completedPendingResults);

          // Populate opponent usernames asynchronously
          const allGames = [...activeGames, ...waitingGames, ...completedPendingResults];
          allGames.forEach(async (g) => {
            try {
              const opponentDoc = await getDoc(doc(db, 'users', g.opponentUid));
              if (opponentDoc.exists()) {
                const opponentUsername = opponentDoc.data().username || 'Unknown Player';
                
                if (g.gameType === 'waiting_for_opponent') {
                  setWaitingForOpponentGames(prev => 
                    prev.map(x => x.gameId === g.gameId ? { ...x, opponent: opponentUsername } : x)
                  );
                } else if (g.gameType === 'completed_pending_results') {
                  setCompletedUnseenGames(prev => 
                    prev.map(x => x.gameId === g.gameId ? { ...x, opponent: opponentUsername } : x)
                  );
                } else {
                  setPvpGames(prev => 
                    prev.map(x => x.gameId === g.gameId ? { ...x, opponent: opponentUsername } : x)
                  );
                }
              }
            } catch (e) {
              console.error('Failed to get opponent username:', e);
            }
          });
        } catch (error) {
          console.error('ResumeGamesScreen: Error processing games snapshot:', error);
        }
      }, (error) => {
        console.error('ResumeGamesScreen: Error in games snapshot:', error);
        setPvpGames([]);
        setWaitingForOpponentGames([]);
        setCompletedUnseenGames([]);
      });

      return () => {
        unsubscribeActive && unsubscribeActive();
      };
    } catch (error) {
      console.error('Failed to load active games:', error);
      setPvpGames([]);
      setWaitingForOpponentGames([]);
      setCompletedUnseenGames([]);
    }
  };

  const handleGameAction = (game) => {
    try {
      // Validate game object
      if (!game || !game.gameType) {
        console.error('Invalid game object:', game);
        Alert.alert('Error', 'Invalid game data. Please try again.');
        return;
      }

      playSound('chime');
      
      switch (game.gameType) {
        case 'pending_challenge':
          // Handle specific challenge response directly
          handleChallengeResponse(game);
          break;
          
        case 'awaiting_acceptance':
          // Show awaiting acceptance status
          Alert.alert(
            'Challenge Sent',
            `Challenge sent to ${game.toUsername || 'Unknown'}. Waiting for their response.`,
            [{ text: 'OK' }]
          );
          break;
          
        case 'active_game':
          // Resume active game
          if (game.gameId) {
            navigation.navigate('PvPGame', { gameId: game.gameId });
          } else {
            Alert.alert('Error', 'Game ID not found. Please try again.');
          }
          break;
          
        case 'waiting_for_opponent':
          // Show game results or wait for opponent
          if (game.opponentSolved) {
            // Both players solved, show results
            showGameResults(game);
          } else {
            // Still waiting for opponent
            Alert.alert(
              'Waiting for Opponent',
              `${game.opponent || 'Your opponent'} is still solving their word. You'll be notified when they finish!`,
              [{ text: 'OK' }]
            );
          }
          break;
        
        case 'completed_pending_results':
          // Navigate to PvPGameScreen to show the game over popup
          console.log('ResumeGamesScreen: handleGameAction called for completed_pending_results');
          if (game.gameId) {
            navigation.navigate('PvPGame', { 
              gameId: game.gameId, 
              showResults: true 
            });
          } else {
            Alert.alert('Error', 'Game ID not found. Please try again.');
          }
          break;
          
        default:
          console.warn('Unknown game type:', game.gameType);
          Alert.alert('Error', 'Unknown game type. Please try again.');
      }
    } catch (error) {
      console.error('Failed to handle game action:', error);
      Alert.alert('Error', 'Failed to process game action. Please try again.');
    }
  };

  const handleChallengeResponse = (challenge) => {
    setChallengeData(challenge);
    setShowChallengeResponsePopup(true);
  };

  const acceptChallenge = async (challenge) => {
    try {
      playSound('chime');
      setShowChallengeResponsePopup(false);
      setChallengeData(null);
      // Navigate to SetWordGameScreen to set the mystery word
      navigation.navigate('SetWordGame', {
        challenge: challenge,
        isAccepting: true
      });
    } catch (error) {
      console.error('Failed to accept challenge:', error);
      Alert.alert('Error', 'Failed to accept challenge. Please try again.');
    }
  };

  const declineChallenge = async (challenge) => {
    try {
      playSound('backspace');
      setShowChallengeResponsePopup(false);
      setChallengeData(null);
      // Update challenge status to declined
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'declined',
        declinedAt: new Date()
      });
      
      Alert.alert('Challenge Declined', 'You have declined the challenge.');
    } catch (error) {
      console.error('Failed to decline challenge:', error);
      Alert.alert('Error', 'Failed to decline challenge. Please try again.');
    }
  };

  const handleQuitGame = async (game) => {
    try {
      Alert.alert(
        'Quit Game?',
        `Are you sure you want to quit this game with ${game.opponent}? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Quit Game', 
            style: 'destructive',
            onPress: async () => {
              try {
                console.log('ResumeGamesScreen: Starting quit game for:', game.gameId);
                console.log('ResumeGamesScreen: Game data:', game);
                
                // Use the gameService.forfeitGame function instead of direct Firestore update
                await gameService.forfeitGame(game.gameId);
                
                // Remove from waiting games list
                setWaitingForOpponentGames(prevGames => 
                  prevGames.filter(g => g.gameId !== game.gameId)
                );
                
                playSound('chime');
                Alert.alert('Game Quit', 'The game has been abandoned and your opponent has been notified.');
              } catch (error) {
                console.error('ResumeGamesScreen: Failed to quit game:', error);
                console.error('ResumeGamesScreen: Error details:', {
                  message: error.message,
                  code: error.code,
                  stack: error.stack
                });
                Alert.alert('Error', `Failed to quit game: ${error.message || 'Please try again.'}`);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('ResumeGamesScreen: Failed to handle quit game:', error);
      Alert.alert('Error', 'Failed to process quit game action. Please try again.');
    }
  };

  const handleCancelChallenge = async (challenge) => {
    try {
      setChallengeToCancel(challenge);
      setShowCancelChallengeConfirm(true);
    } catch (error) {
      console.error('Failed to handle cancel challenge:', error);
      Alert.alert('Error', 'Failed to process cancel challenge action. Please try again.');
    }
  };

  const confirmCancelChallenge = async () => {
    try {
      if (!challengeToCancel) return;
      
      // Delete the challenge from Firestore
      await deleteDoc(doc(db, 'challenges', challengeToCancel.id));
      
      // Remove from pending challenges list immediately
      setPendingChallenges(prevChallenges => 
        prevChallenges.filter(c => c.id !== challengeToCancel.id)
      );
      
      playSound('chime');
      setShowCancelChallengeConfirm(false);
      setChallengeToCancel(null);
      setShowChallengeCanceledPopup(true);
    } catch (error) {
      console.error('Failed to cancel challenge:', error);
      Alert.alert('Error', 'Failed to cancel challenge. Please try again.');
      setShowCancelChallengeConfirm(false);
      setChallengeToCancel(null);
    }
  };

  const checkQuitNotifications = async (userId) => {
    try {
      // Check for unread quit notifications
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('toUid', '==', userId),
        where('type', '==', 'gameQuit'),
        where('read', '==', false)
      );
      
      const snapshot = await getDocs(notificationsQuery);
      
      snapshot.docs.forEach(async (doc) => {
        const notification = doc.data();
        
        // Show alert that opponent quit
        Alert.alert(
          'Opponent Quit Game',
          notification.message,
          [
            { 
              text: 'OK', 
              onPress: async () => {
                // Mark notification as read
                await updateDoc(doc(db, 'notifications', doc.id), {
                  read: true
                });
              }
            }
          ]
        );
      });
    } catch (error) {
      console.error('Failed to check quit notifications:', error);
    }
  };


  const renderGameItem = ({ item }) => {
    const isAwaitingAcceptance = item.gameType === 'awaiting_acceptance';
    
    if (isAwaitingAcceptance) {
      // Special layout for awaiting acceptance boxes - left text, date below, red quit button right
      return (
        <View style={styles.awaitingAcceptanceItem}>
          <View style={styles.awaitingAcceptanceInfo}>
            <Text style={styles.awaitingAcceptanceTitle}>
              Waiting for
            </Text>
            <Text style={styles.awaitingAcceptanceUsername}>
              <Text style={styles.usernamePurple}>{item.toUsername || 'Unknown'}</Text>
            </Text>
            <Text style={styles.unifiedDate}>
              Sent: {new Date(item.createdAt?.toDate?.() || item.createdAt || Date.now()).toLocaleDateString()}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.redQuitButton}
            onPress={() => handleCancelChallenge(item)}
          >
            <Text style={styles.redQuitButtonText}>Quit</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    // Regular layout for other game types
    return (
      <TouchableOpacity
        style={styles.compactChallengeItem}
        onPress={() => handleGameAction(item)}
      >
        <View style={styles.compactChallengeInfo}>
          <Text style={styles.compactChallengeTitle}>
            {item.gameType === 'pending_challenge' ? 'Challenge from' : 'vs'}
          </Text>
          <Text style={styles.compactChallengeUsername}>
            <Text style={styles.usernamePurple}>
              {item.gameType === 'pending_challenge' ? (item.fromUsername || 'Unknown') : item.opponent}
            </Text>
          </Text>
          <Text style={styles.unifiedDate}>
            {item.gameType === 'pending_challenge' 
              ? `Sent: ${new Date(item.createdAt?.toDate?.() || item.createdAt || Date.now()).toLocaleDateString()}`
              : `Last: ${new Date(item.lastActivity?.toDate?.() || item.lastActivity || Date.now()).toLocaleDateString()}`}
          </Text>
        </View>
        {item.gameType === 'waiting_for_opponent' ? (
          // For waiting games, show only Quit button
          <TouchableOpacity
            style={[styles.challengeButton, styles.quitButton]}
            onPress={() => handleQuitGame(item)}
          >
            <Text style={styles.challengeButtonText}>Quit</Text>
          </TouchableOpacity>
        ) : (
          // For other game types, show single button
          <TouchableOpacity
            style={styles.compactChallengeButton}
            onPress={() => handleGameAction(item)}
          >
            <Text style={styles.compactChallengeButtonText}>
              {item.gameType === 'pending_challenge' ? 'Respond' : item.gameType === 'completed_pending_results' ? 'View Results' : 'Resume'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderSoloGameItem = ({ item }) => {
    const getDifficultyText = (wordLength) => {
      if (wordLength === 4) return '🟢 Easy';
      if (wordLength === 6) return '🔴 Hard';
      return '🟡 Regular';
    };

    const getGameStateText = (gameState) => {
      switch (gameState) {
        case 'playing':
          return '🎮 In Progress';
        case 'setWord':
          return '✏️ Set Word';
        default:
          return '🎮 Playing';
      }
    };

    const handleResumeSoloGame = async () => {
      try {
        await playSound('backspace').catch(() => {});
        navigation.navigate('Game', {
          gameMode: 'solo',
          gameId: item.gameId,
          wordLength: item.wordLength,
          difficulty: item.difficulty || (item.wordLength === 4 ? 'easy' : item.wordLength === 6 ? 'hard' : 'regular'),
          resumeGame: true
        });
      } catch (error) {
        console.error('ResumeGamesScreen: Failed to resume solo game:', error);
        Alert.alert('Error', 'Failed to resume game. Please try again.');
      }
    };

    return (
      <TouchableOpacity
        style={styles.soloGameItem}
        onPress={handleResumeSoloGame}
        activeOpacity={0.7}
      >
        <View style={styles.soloGameContent}>
          <View style={styles.soloGameInfo}>
            <Text style={styles.soloGameTitle}>
              {getDifficultyText(item.wordLength)}
            </Text>
            <Text style={styles.unifiedDate}>
              Started: {new Date(item.timestamp).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.soloGameAction}>
            <Text style={styles.soloGameResumeText}>Resume</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView edges={['left', 'right', 'top', 'bottom']} style={styles.screenContainer}>
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.resumeBackButton}
            onPress={() => {
              playSound('backspace').catch(() => {});
              navigation.goBack();
            }}
          >
            <Text style={styles.resumeBackButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Resume Games</Text>
        </View>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateTitle}>Loading games...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasGames = soloGames.length > 0 || pvpGames.length > 0 || 
                   pendingChallenges.length > 0 || waitingForOpponentGames.length > 0 ||
                   completedUnseenGames.length > 0;

  return (
    <SafeAreaView edges={['left', 'right', 'top', 'bottom']} style={styles.screenContainer}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.resumeBackButton}
          onPress={() => {
            playSound('backspace').catch(() => {});
            navigation.goBack();
          }}
        >
          <Text style={styles.resumeBackButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resume Games</Text>
      </View>

      <ScrollView 
        style={styles.scrollContent} 
        contentContainerStyle={{ paddingBottom: 20 }} // Add bottom padding
        showsVerticalScrollIndicator={false}
      >
        {!hasGames ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateTitle}>No Games in Progress</Text>
            <Text style={styles.emptyStateSubtitle}>
              This screen shows your pending challenges, active games, and games waiting for opponents.
            </Text>
            <TouchableOpacity
              style={styles.addFriendsButton}
              onPress={() => {
                playSound('backspace').catch(() => {});
                navigation.navigate('MainTabs');
              }}
            >
              <Text style={styles.addFriendsButtonText}>Go Home</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
                          {pendingChallenges.length > 0 && (
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Challenges ({pendingChallenges.length})</Text>
                  <Text style={styles.sectionSubtitle}>Pending battles and awaiting responses</Text>
                <FlatList
                  data={pendingChallenges}
                  renderItem={renderGameItem}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}
            
            {pvpGames.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Active Battles ({pvpGames.length})</Text>
                <Text style={styles.sectionSubtitle}>Battles in progress</Text>
                <FlatList
                  data={pvpGames}
                  renderItem={renderGameItem}
                  keyExtractor={(item) => item.gameId}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}
            
            {waitingForOpponentGames.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Waiting for Opponents ({waitingForOpponentGames.length})</Text>
                <Text style={styles.sectionSubtitle}>You solved your word, waiting for opponent</Text>
                <FlatList
                  data={waitingForOpponentGames}
                  renderItem={renderGameItem}
                  keyExtractor={(item) => item.gameId}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}

            {completedUnseenGames.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <Text style={[styles.sectionTitle, { flex: 1, marginRight: 12 }]} numberOfLines={1} ellipsizeMode="tail">View Results ({completedUnseenGames.length})</Text>
                  <TouchableOpacity onPress={handleClearAllCompleted} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 14 }}>Clear All</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sectionSubtitle}>Tap to view and archive</Text>
                <FlatList
                  data={completedUnseenGames}
                  renderItem={renderGameItem}
                  keyExtractor={(item) => item.gameId}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}

            {soloGames.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Solo Games ({soloGames.length})</Text>
                <Text style={styles.sectionSubtitle}>Continue your solo word games</Text>
                <FlatList
                  data={soloGames}
                  renderItem={renderSoloGameItem}
                  keyExtractor={(item) => item.gameId}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
      
      
      {/* Challenge Response Popup Modal */}
      <Modal visible={showChallengeResponsePopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow]}>
            <Text style={[styles.winTitle, { color: '#FFFFFF' }]}>
              Challenge from {challengeData?.fromUsername || 'Unknown'}
            </Text>
            <Text style={[styles.winMessage, { color: '#E5E7EB' }]}>
              {challengeData?.fromUsername || 'Someone'} has challenged you to a battle! Would you like to accept or decline?
            </Text>
            <View style={styles.challengeButtonContainer}>
              <TouchableOpacity
                style={[styles.winButtonContainer, styles.declineButton]}
                onPress={() => declineChallenge(challengeData)}
              >
                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.winButtonContainer, styles.acceptButton]}
                onPress={() => acceptChallenge(challengeData)}
              >
                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Accept</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.winButtonContainer, styles.backButton]}
              onPress={() => {
                setShowChallengeResponsePopup(false);
                setChallengeData(null);
                playSound('backspace').catch(() => {});
              }}
            >
              <Text style={[styles.buttonText, { color: '#E5E7EB' }]}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cancel Challenge Confirmation Modal */}
      <Modal visible={showCancelChallengeConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.header, { color: colors.textPrimary }]}>Cancel Challenge?</Text>
            <Text style={[styles.modalText, { color: colors.textSecondary }]}>
              Are you sure you want to cancel the challenge sent to {challengeToCancel?.toUsername}? This action cannot be undone.
            </Text>
            <View style={styles.modalActionsVertical}>
              <TouchableOpacity
                style={[styles.button, styles.deleteButton]}
                onPress={confirmCancelChallenge}
              >
                <Text style={styles.buttonText}>Cancel Challenge</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={() => {
                  setShowCancelChallengeConfirm(false);
                  setChallengeToCancel(null);
                  playSound('backspace').catch(() => {});
                }}
              >
                <Text style={styles.buttonText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Challenge Canceled Success Modal */}
      <Modal visible={showChallengeCanceledPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.winTitle, { color: colors.textPrimary }]}>Challenge Canceled</Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary }]}>
              The challenge has been canceled.
            </Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={() => {
                setShowChallengeCanceledPopup(false);
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ResumeGamesScreen;

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';
import adService from './adService';

const ResumeGamesScreen = () => {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [soloGames, setSoloGames] = useState([]);
  const [pvpGames, setPvpGames] = useState([]);
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [waitingForOpponentGames, setWaitingForOpponentGames] = useState([]);
  const [loading, setLoading] = useState(true);
  
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

      const setupListeners = async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          const unsubscribers = await loadUserGames(currentUser.uid);
          if (unsubscribers) {
            challengesUnsubscribe = unsubscribers.challengesUnsubscribe;
            gamesUnsubscribe = unsubscribers.gamesUnsubscribe;
          }
        }
      };

      authUnsubscribe = auth.onAuthStateChanged(setupListeners);

      return () => {
        if (authUnsubscribe) authUnsubscribe();
        if (challengesUnsubscribe) challengesUnsubscribe();
        if (gamesUnsubscribe) gamesUnsubscribe();
      };
    }, [])
  );

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
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      
      // Load solo games from AsyncStorage (these are stored locally)
      // For now, we'll focus on PvP games since those are in Firestore
      setSoloGames([]); // TODO: Implement local solo game loading
      
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

  const loadPendingChallenges = async (userId) => {
    try {
      // Get challenges where current user is the recipient
      const challengesQuery = query(
        collection(db, 'challenges'),
        where('toUid', '==', userId),
        where('status', '==', 'pending')
      );

      const unsubscribe = onSnapshot(challengesQuery, (snapshot) => {
        // Get challenges where current user is the recipient
        const userChallenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Set challenges with appropriate gameType based on user's role
        const challengesWithTypes = userChallenges.map(challenge => {
          const isRecipient = challenge.toUid === userId || challenge.to === userId;
          return {
            ...challenge,
            fromUsername: 'Loading...',
            toUsername: 'Loading...',
            gameType: isRecipient ? 'pending_challenge' : 'awaiting_acceptance'
          };
        });
        
        setPendingChallenges(challengesWithTypes);
        
        // Then fetch usernames asynchronously
        userChallenges.forEach(async (challenge) => {
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

      // Store unsubscribe function for cleanup
      return unsubscribe;
    } catch (error) {
      console.error('Failed to load pending challenges:', error);
      setPendingChallenges([]);
    }
  };

  const loadActiveAndWaitingGames = async (userId) => {
    try {
      // Get all games where current user is a player
      const gamesQuery = query(
        collection(db, 'games'),
        where('playerIds', 'array-contains', userId),
        where('type', '==', 'pvp')
      );

      const unsubscribe = onSnapshot(gamesQuery, (snapshot) => {
        console.log('ResumeGamesScreen: onSnapshot triggered with', snapshot.docs.length, 'games');
        const activeGames = [];
        const waitingGames = [];
        
        snapshot.docs.forEach(doc => {
          const gameData = doc.data();
          const gameId = doc.id;
          console.log('ResumeGamesScreen: Processing game', gameId, 'with status:', gameData.status, 'and playerIds:', gameData.playerIds);
          
          // Skip completed or abandoned games
          if (gameData.status === 'completed' || gameData.status === 'abandoned') {
            return;
          }
          
          // Get player positions from the playerIds array
          const playerIndex = gameData.playerIds.indexOf(userId);
          const opponentIndex = playerIndex === 0 ? 1 : 0;
          const opponentUid = gameData.playerIds[opponentIndex];
          
          if (!opponentUid) return;
          
          // Determine which fields to use based on player position
          const isPlayer1 = userId === gameData.playerIds[0];
          const currentPlayerSolved = isPlayer1 ? gameData.player1?.solved : gameData.player2?.solved;
          const opponentSolved = isPlayer1 ? gameData.player2?.solved : gameData.player1?.solved;
          
          // Get opponent username - we'll fetch this asynchronously
          let opponentUsername = 'Loading...';
          
          const gameInfo = {
            gameId: gameId,
            opponent: opponentUsername,
            opponentUid: opponentUid,
            wordLength: gameData.wordLength || 4,
            lastActivity: gameData.lastActivity || gameData.createdAt,
            gameMode: 'pvp',
            gameStatus: gameData.status,
            currentPlayerSolved: currentPlayerSolved || false,
            opponentSolved: opponentSolved || false,
            isMyTurn: gameData.status === 'waiting_for_opponent' ? false : !currentPlayerSolved
          };
          
          if (gameData.status === 'waiting_for_opponent' && currentPlayerSolved && !opponentSolved) {
            // Current player solved, waiting for opponent
            waitingGames.push({
              ...gameInfo,
              gameType: 'waiting_for_opponent'
            });
          } else if (gameData.status === 'active') {
            // Active game - include regardless of solve status
            activeGames.push({
              ...gameInfo,
              gameType: 'active_game',
              message: currentPlayerSolved ? 'Waiting for opponent' : (gameInfo.isMyTurn ? 'Your turn' : 'Waiting')
            });
          }
        });
        
        console.log('ResumeGamesScreen: Categorized games - Active:', activeGames.length, 'Waiting:', waitingGames.length);
        setPvpGames(activeGames);
        setWaitingForOpponentGames(waitingGames);
        
        // Fetch opponent usernames for all games
        const allGames = [...activeGames, ...waitingGames];
        allGames.forEach(async (game) => {
          try {
            const opponentDoc = await getDoc(doc(db, 'users', game.opponentUid));
            if (opponentDoc.exists()) {
              const opponentUsername = opponentDoc.data().username || 'Unknown Player';
              
              // Update the game with the username
              if (game.gameType === 'waiting_for_opponent') {
                setWaitingForOpponentGames(prevGames => 
                  prevGames.map(g => 
                    g.gameId === game.gameId 
                      ? { ...g, opponent: opponentUsername }
                      : g
                  )
                );
              } else {
                setPvpGames(prevGames => 
                  prevGames.map(g => 
                    g.gameId === game.gameId 
                      ? { ...g, opponent: opponentUsername }
                      : g
                  )
                );
              }
            }
          } catch (error) {
            console.error('Failed to get opponent username:', error);
          }
        });
      });

      // Store unsubscribe function for cleanup
      return unsubscribe;
    } catch (error) {
      console.error('Failed to load active games:', error);
      setPvpGames([]);
      setWaitingForOpponentGames([]);
    }
  };

  const handleGameAction = (game) => {
    try {
      playSound('chime');
      
      switch (game.gameType) {
        case 'pending_challenge':
          // Navigate to challenge response screen
          navigation.navigate('PendingChallenges');
          break;
          
        case 'awaiting_acceptance':
          // Show awaiting acceptance status
          Alert.alert(
            'Challenge Sent',
            `Challenge sent to ${game.toUsername}. Waiting for their response.`,
            [{ text: 'OK' }]
          );
          break;
          
        case 'active_game':
          // Resume active game
          navigation.navigate('PvPGame', { gameId: game.gameId });
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
              `${game.opponent} is still solving their word. You'll be notified when they finish!`,
              [{ text: 'OK' }]
            );
          }
          break;
          
        default:
          console.warn('Unknown game type:', game.gameType);
      }
    } catch (error) {
      console.error('Failed to handle game action:', error);
      Alert.alert('Error', 'Failed to process game action. Please try again.');
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
                // Get the opponent's UID
                const opponentUid = game.opponentUid;
                
                // Send notification to opponent that game was quit
                const notificationData = {
                  type: 'gameQuit',
                  from: auth.currentUser?.uid,
                  to: opponentUid,
                  gameId: game.gameId,
                  message: `${auth.currentUser?.displayName || 'Your opponent'} quit the game.`,
                  timestamp: new Date(),
                  read: false
                };
                
                await addDoc(collection(db, 'notifications'), notificationData);
                
                // Update game status to abandoned
                await updateDoc(doc(db, 'games', game.gameId), {
                  status: 'abandoned',
                  abandonedAt: new Date().toISOString(),
                  abandonedBy: auth.currentUser?.uid
                });
                
                // Remove from waiting games list
                setWaitingForOpponentGames(prevGames => 
                  prevGames.filter(g => g.gameId !== game.gameId)
                );
                
                playSound('chime');
                Alert.alert('Game Quit', 'The game has been abandoned and your opponent has been notified.');
              } catch (error) {
                console.error('Failed to quit game:', error);
                Alert.alert('Error', 'Failed to quit game. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Failed to handle quit game:', error);
      Alert.alert('Error', 'Failed to process quit game action. Please try again.');
    }
  };

  const handleCancelChallenge = async (challenge) => {
    try {
      Alert.alert(
        'Cancel Challenge?',
        `Are you sure you want to cancel the challenge sent to ${challenge.toUsername}? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Cancel Challenge', 
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete the challenge from Firestore
                await deleteDoc(doc(db, 'challenges', challenge.id));
                
                // Remove from pending challenges list immediately
                setPendingChallenges(prevChallenges => 
                  prevChallenges.filter(c => c.id !== challenge.id)
                );
                
                playSound('chime');
                Alert.alert('Challenge Cancelled', 'The challenge has been cancelled.');
              } catch (error) {
                console.error('Failed to cancel challenge:', error);
                Alert.alert('Error', 'Failed to cancel challenge. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Failed to handle cancel challenge:', error);
      Alert.alert('Error', 'Failed to process cancel challenge action. Please try again.');
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

  const showGameResults = (game) => {
    Alert.alert(
      'Game Complete!',
      `Both players have solved their words! Would you like to see the results?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'See Results', 
          onPress: async () => {
            // Show ad after PvP game completion
            try {
              await adService.showInterstitialAd();
            } catch (error) {
              console.error('Failed to show ad:', error);
            }
            
            // Navigate to results screen or show results modal
            // For now, we'll show a simple alert with basic info
            Alert.alert(
              'Game Results',
              `Game against ${game.opponent} completed!\n\nWord Length: ${game.wordLength} letters\n\nCheck the leaderboard for detailed results!`,
              [
                { text: 'OK' },
                { 
                  text: 'View Leaderboard', 
                  onPress: () => navigation.navigate('Leaderboard')
                }
              ]
            );
          }
        }
      ]
    );
  };

  const renderGameItem = ({ item }) => {
    const isAwaitingAcceptance = item.gameType === 'awaiting_acceptance';
    
    if (isAwaitingAcceptance) {
      // Special layout for awaiting acceptance boxes
      return (
        <View style={styles.awaitingAcceptanceItem}>
          {/* Text at the top */}
          <View style={styles.awaitingAcceptanceTextContainer}>
            <Text style={styles.awaitingAcceptanceTitle}>
              Waiting for {item.toUsername || 'Unknown'}
            </Text>
            {item.message || item.gameStatus && (
              <Text style={styles.awaitingAcceptanceSubtext}>
                {item.message || item.gameStatus}
              </Text>
            )}
          </View>
          
          {/* Buttons in the middle */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.challengeButton, styles.checkButton]}
              onPress={() => handleGameAction(item)}
            >
              <Text style={styles.challengeButtonText}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.challengeButton, styles.quitButton]}
              onPress={() => handleCancelChallenge(item)}
            >
              <Text style={styles.challengeButtonText}>Quit</Text>
            </TouchableOpacity>
          </View>
          
          {/* Date at the bottom */}
          <Text style={styles.awaitingAcceptanceDate}>
            Sent: {new Date(item.createdAt?.toDate?.() || item.createdAt || Date.now()).toLocaleDateString()}
          </Text>
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
            {item.gameType === 'pending_challenge' 
              ? `Challenge from ${item.fromUsername || 'Unknown'}` 
              : `vs ${item.opponent}`}
          </Text>
          <Text style={styles.compactChallengeDate}>
            {item.gameType === 'pending_challenge' 
              ? `Sent: ${new Date(item.createdAt?.toDate?.() || item.createdAt || Date.now()).toLocaleDateString()}`
              : `Last: ${new Date(item.lastActivity?.toDate?.() || item.lastActivity || Date.now()).toLocaleDateString()}`}
          </Text>
        </View>
        {item.gameType === 'waiting_for_opponent' ? (
          // For waiting games, show both Check and Quit buttons
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.challengeButton, styles.checkButton]}
              onPress={() => handleGameAction(item)}
            >
              <Text style={styles.challengeButtonText}>Check</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.challengeButton, styles.quitButton]}
              onPress={() => handleQuitGame(item)}
            >
              <Text style={styles.challengeButtonText}>Quit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // For other game types, show single button
          <TouchableOpacity
            style={styles.compactChallengeButton}
            onPress={() => handleGameAction(item)}
          >
            <Text style={styles.compactChallengeButtonText}>
              {item.gameType === 'pending_challenge' ? 'Respond' : 'Resume'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.screenContainer}>
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Resume Games</Text>
        </View>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateTitle}>Loading games...</Text>
        </View>
      </View>
    );
  }

  const hasGames = soloGames.length > 0 || pvpGames.length > 0 || 
                   pendingChallenges.length > 0 || waitingForOpponentGames.length > 0;

  return (
    <SafeAreaView style={styles.screenContainer}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resume Games</Text>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!hasGames ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateTitle}>No Games in Progress</Text>
            <Text style={styles.emptyStateSubtitle}>
              This screen shows your pending challenges, active games, and games waiting for opponents.
            </Text>
            <TouchableOpacity
              style={styles.addFriendsButton}
              onPress={() => navigation.navigate('Home')}
            >
              <Text style={styles.addFriendsButtonText}>Go Home</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
                          {pendingChallenges.length > 0 && (
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Challenges ({pendingChallenges.length})</Text>
                  <Text style={styles.sectionSubtitle}>Pending challenges and awaiting responses</Text>
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
                <Text style={styles.sectionTitle}>Active Games ({pvpGames.length})</Text>
                <Text style={styles.sectionSubtitle}>Games in progress</Text>
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
            
            {soloGames.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Solo Games</Text>
                <FlatList
                  data={soloGames}
                  renderItem={renderGameItem}
                  keyExtractor={(item) => item.gameId || `solo_${item.timestamp}`}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default ResumeGamesScreen;

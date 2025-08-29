import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, FlatList } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const ResumeGamesScreen = () => {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [soloGames, setSoloGames] = useState([]);
  const [pvpGames, setPvpGames] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // This screen shows:
  // - Up to one solo game in progress
  // - Up to one game per friend (most recent active game with each friend)
  // 
  // Game Filtering Logic:
  // - Only shows games where current player hasn't solved their opponent's word yet
  // - Games where player has already solved are filtered out (not shown as "active")
  // - This prevents players from seeing "active" games they've already completed
  // - Each player sees different games based on their individual progress

  useFocusEffect(
    React.useCallback(() => {
      const unsubscribe = auth.onAuthStateChanged((currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          loadUserGames(currentUser.uid);
        }
      });

      return unsubscribe;
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
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      
      // Load solo games from AsyncStorage (these are stored locally)
      // For now, we'll focus on PvP games since those are in Firestore
      setSoloGames([]); // TODO: Implement local solo game loading
      
      // Load PvP games - only one per friend
      const activeGames = userData.activeGames || [];
      const pvpGamesData = [];
      const friendGameMap = new Map(); // Track most recent game per friend
      
      for (const gameId of activeGames) {
        try {
          const gameDoc = await getDoc(doc(db, 'games', gameId));
          if (gameDoc.exists()) {
            const gameData = gameDoc.data();
            
            // Only show games that are not completed
            if (gameData.status === 'completed' || gameData.status === 'abandoned') {
              continue;
            }
            
            // Determine if this is the current user's game or opponent's
            const isMyGame = gameData.player1?.uid === userId;
            const opponent = isMyGame ? gameData.player2 : gameData.player1;
            const opponentUid = opponent?.uid;
            
            if (!opponentUid) continue;
            
            // Check if the current player has already solved their opponent's word
            const currentPlayerSolved = isMyGame ? gameData.player1?.solved : gameData.player2?.solved;
            
            // Only show the game if the current player hasn't solved their opponent's word yet
            if (!currentPlayerSolved) {
              // Only keep the most recent game per friend
              if (!friendGameMap.has(opponentUid)) {
                const gameInfo = {
                  gameId: gameId,
                  opponent: opponent?.username || 'Unknown Player',
                  opponentUid: opponentUid,
                  wordLength: gameData.player1?.word?.length || 4,
                  lastActivity: gameData.player1?.lastActivity || gameData.createdAt,
                  isMyTurn: gameData.status === 'waiting_for_opponent' ? false : (isMyGame ? !gameData.player1?.solved : !gameData.player2?.solved),
                  gameMode: 'pvp',
                  gameStatus: gameData.status,
                  // Add player-specific solved state
                  currentPlayerSolved: currentPlayerSolved,
                  opponentSolved: isMyGame ? gameData.player2?.solved : gameData.player1?.solved
                };
                
                friendGameMap.set(opponentUid, gameInfo);
                pvpGamesData.push(gameInfo);
              }
            }
          }
        } catch (error) {
          console.error('Failed to load game data:', error);
        }
      }
      
      setPvpGames(pvpGamesData);
    } catch (error) {
      console.error('Failed to load user games:', error);
      Alert.alert('Error', 'Failed to load games. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resumeGame = (game) => {
    try {
      playSound('chime');
      
      if (game.gameMode === 'pvp') {
        navigation.navigate('PvPGame', { gameId: game.gameId });
      } else {
        // For solo games, navigate to regular game screen
        navigation.navigate('Game', {
          gameMode: 'solo',
          wordLength: game.wordLength,
          // Add other solo game state as needed
        });
      }
    } catch (error) {
      console.error('Failed to resume game:', error);
      Alert.alert('Error', 'Failed to resume game. Please try again.');
    }
  };

  const renderGameItem = ({ item }) => (
    <TouchableOpacity
      style={styles.friendItem}
      onPress={() => resumeGame(item)}
    >
      <View style={styles.friendInfo}>
        <Text style={styles.friendUsername}>
          {item.gameMode === 'pvp' 
            ? `vs ${item.opponent}` 
            : `Solo Game`}
        </Text>
        <Text style={styles.friendText}>
          {item.wordLength} letters • {item.gameMode === 'pvp' && item.gameStatus === 'waiting_for_opponent' ? 'Waiting for opponent' : (item.currentPlayerSolved ? 'Completed' : (item.isMyTurn ? 'Your turn' : 'Waiting'))}
        </Text>
        <Text style={styles.friendText}>
          Last: {new Date(item.lastActivity).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.challengeButton}
        onPress={() => resumeGame(item)}
      >
        <Text style={styles.challengeButtonText}>Resume</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

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

  const hasGames = soloGames.length > 0 || pvpGames.length > 0;

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

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!hasGames ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateTitle}>No Games in Progress</Text>
            <Text style={styles.emptyStateSubtitle}>
              This screen shows your most recent solo game and one active game per friend.
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
            {pvpGames.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Active Games with Friends</Text>
                <FlatList
                  data={pvpGames}
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
    </View>
  );
};

export default ResumeGamesScreen;

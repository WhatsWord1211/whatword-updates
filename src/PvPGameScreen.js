import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Dimensions, Alert, Platform, InteractionManager, StatusBar, BackHandler } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import { db, auth } from './firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, increment, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Audio mode is now handled in soundsUtil.js
import { playSound } from './soundsUtil';
import adService from './adService';
import { getFeedback, isValidWord } from './gameLogic';
import styles from './styles';
import gameService from './gameService';
import playerProfileService from './playerProfileService';
import ThreeDPurpleRing from './ThreeDPurpleRing';
import ThreeDGreenDot from './ThreeDGreenDot';
import { getNotificationService } from './notificationService';
import friendRecordsService from './friendRecordsService';

/**
 * PvP Game State System:
 * 
 * There are 4 main game states that a player can encounter:
 * 
 * 1. PENDING: Game is created and waiting for P2's acceptance
 *    - status: 'pending' in Firestore
 *    - Both players see "waiting for opponent to accept"
 * 
 * 2. ACTIVE: Game is active and both players are trying to solve each other's words
 *    - status: 'active' in Firestore
 *    - Player sees input field and can make guesses
 *    - Player can solve their opponent's word
 * 
 * 3. SOLVED: Current player has solved their opponent's word
 *    - status: 'active' in Firestore (game not complete yet)
 *    - Player sees "You solved it in X attempts!"
 *    - Player sees "Waiting for opponent to finish..."
 *    - Input is disabled (canGuess() returns false)
 *    - Player cannot make more guesses
 * 
 * 4. GAMEOVER: Both players have solved each other's words OR game is abandoned
 *    - status: 'completed' or 'abandoned' in Firestore
 *    - Player sees game completion message
 *    - Player can return to home
 * 
 * Player-Specific State Tracking:
 * - Each player has individual solved state (player1.solved, player2.solved)
 * - A game can be 'active' but one player may have already solved
 * - ResumeGamesScreen only shows games where current player hasn't solved yet
 * - PvPGameScreen shows appropriate UI based on current player's solved state
 */

const PvPGameScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { gameId, showResults } = route.params || {};
  console.log('PvPGameScreen: Received params - gameId:', gameId, 'showResults:', showResults);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [game, setGame] = useState(null);
  const [inputWord, setInputWord] = useState('');
  const [guesses, setGuesses] = useState([]);
  const [alphabet, setAlphabet] = useState(Array(26).fill('unknown'));
  const [showInvalidPopup, setShowInvalidPopup] = useState(false);
  const [showCongratulationsPopup, setShowCongratulationsPopup] = useState(false);
  const [isSecondSolver, setIsSecondSolver] = useState(false);
  const [showGameOverPopup, setShowGameOverPopup] = useState(false);
  const [gameOverData, setGameOverData] = useState(null);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  const [showMaxGuessesPopup, setShowMaxGuessesPopup] = useState(false);
  const [showQuitConfirmPopup, setShowQuitConfirmPopup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingResultData, setPendingResultData] = useState(null);
  const [resultSoundPlayed, setResultSoundPlayed] = useState(false);
  const [opponentGuessCountOnSolve, setOpponentGuessCountOnSolve] = useState(null);
  const [showStartGamePopup, setShowStartGamePopup] = useState(false);
  const showGameOverPopupRef = useRef(false);
  const resultSoundPlayedRef = useRef(false);
  const handledCompletionRef = useRef(false);
  const showCongratulationsPopupRef = useRef(false);
  const hasRestoredStateRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const resultsShownForSessionRef = useRef(false);
  const hasShownStartGamePopupRef = useRef(false);
  
  const scrollViewRef = useRef(null);
  
  // Consolidated scroll function to prevent conflicts
  const scrollToBottom = useCallback((delay = 100, animated = true) => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollViewRef.current && guesses.length > 0) {
        scrollViewRef.current.scrollToEnd({ animated });
      }
    }, delay);
  }, [guesses]);
  
  // Adjustable padding variables
  const inputToKeyboardPadding = 20;
  const keyboardToButtonsPadding = 5;
  
  // Calculate optimal sizing for alphabet grid to use full width
  const windowWidth = Dimensions.get('window').width;
  const isIPad = Platform.OS === 'ios' && windowWidth >= 768;
  const availableWidth = isIPad ? Math.min(windowWidth * 0.7, 600) : windowWidth - 20;
  
  // Calculate optimal letter size and spacing to maximize usage
  const getOptimalSizing = () => {
    const longestRow = 10; // QWERTY top row has 10 letters
    const minSpacing = isIPad ? 3 : 2;
    const totalSpacing = (longestRow - 1) * minSpacing;
    const availableForLetters = availableWidth - totalSpacing;
    const letterSize = Math.floor(availableForLetters / longestRow);
    
    // Adjust sizing for iPad vs iPhone
    const maxSize = isIPad ? 55 : 50;
    const minSize = isIPad ? 32 : 28;
    const finalLetterSize = Math.max(Math.min(letterSize, maxSize), minSize);
    const actualSpacing = Math.max((availableWidth - (longestRow * finalLetterSize)) / (longestRow - 1), 1);
    
    // Make buttons taller by increasing height by 20%
    const buttonHeight = Math.floor(finalLetterSize * 1.2);
    
    return { letterSize: finalLetterSize, spacing: actualSpacing, buttonHeight: buttonHeight };
  };
  
  const { letterSize, spacing, buttonHeight } = getOptimalSizing();
  const maxKeyboardWidth = availableWidth;
  
  // QWERTY keyboard layout
  const qwertyKeys = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];
  
  const getMaxGuesses = () => (game && game.maxAttempts) ? game.maxAttempts : 25;

  // Preload game completion ad when game starts
  const preloadGameAd = useCallback(async () => {
    try {
      console.log('PvPGameScreen: Preloading game completion ad...');
      await adService.preloadGameCompletionAd();
    } catch (error) {
      console.error('PvPGameScreen: Failed to preload game completion ad:', error);
    }
  }, []);

  // Save PvP game state including alphabet
  const savePvPGameState = async () => {
    if (!game || !game.id || !currentUser) return;
    
    try {
      const gameData = {
        gameMode: 'pvp',
        gameId: game.id,
        playerId: currentUser.uid,
        isCreator: game.creatorId === currentUser.uid,
        guesses: guesses.map(guess => ({
          word: guess.word,
          dots: guess.dots || 0,
          circles: guess.circles || 0,
          feedback: guess.feedback,
          isCorrect: guess.isCorrect,
          isHint: guess.isHint || false
        })),
        inputWord,
        alphabet,
        targetWord: game.playerWord || game.opponentWord,
        gameState: 'playing',
        hintCount: 0, // PvP games don't use hints
        usedHintLetters: [],
        opponentGuessCountOnSolve: game.opponentGuessCountOnSolve,
        difficulty: 'regular', // PvP games are always regular difficulty
        timestamp: new Date().toISOString(),
      };
      
      let games = [];
      const savedGames = await AsyncStorage.getItem('savedGames');
      games = savedGames ? JSON.parse(savedGames) : [];
      const gameIndex = games.findIndex(g => g.gameId === gameData.gameId);
      if (gameIndex >= 0) {
        games[gameIndex] = gameData;
      } else {
        games.push(gameData);
      }
      await AsyncStorage.setItem('savedGames', JSON.stringify(games));
      console.log('PvPGameScreen: Saved PvP game state with alphabet');
    } catch (error) {
      console.error('PvPGameScreen: Failed to save PvP game state:', error);
    }
  };

  // Restore PvP game state including alphabet
  const restorePvPGameState = async () => {
    if (!game || !game.id || !currentUser || hasRestoredStateRef.current) return;
    
    try {
      const savedGames = await AsyncStorage.getItem('savedGames');
      if (savedGames) {
        const games = JSON.parse(savedGames);
        const savedGame = games.find(g => g.gameId === game.id && g.gameMode === 'pvp');
        
        if (savedGame) {
          console.log('PvPGameScreen: Restoring PvP game state with alphabet');
          
          // Add a small delay to ensure UI is ready before restoring state
          setTimeout(() => {
            setGuesses(savedGame.guesses || []);
            setInputWord(savedGame.inputWord || '');
            setAlphabet(savedGame.alphabet || Array(26).fill('unknown'));
            setOpponentGuessCountOnSolve(savedGame.opponentGuessCountOnSolve);
            hasRestoredStateRef.current = true;
          }, 100);
        } else {
          // No saved state found - this is a new game, just mark as restored
          console.log('PvPGameScreen: No saved state found - new game');
          hasRestoredStateRef.current = true;
        }
      } else {
        // No saved games at all - this is a new game, just mark as restored
        console.log('PvPGameScreen: No saved games - new game');
        hasRestoredStateRef.current = true;
      }
    } catch (error) {
      console.error('PvPGameScreen: Failed to restore PvP game state:', error);
      // Even on error, mark as restored to prevent infinite retries
      hasRestoredStateRef.current = true;
    }
  };

  // Preload game completion ad when game starts
  useEffect(() => {
    if (game && game.status === 'active') {
      preloadGameAd();
    }
  }, [game, preloadGameAd]);

  // Auto-save PvP game state when alphabet or other state changes
  useEffect(() => {
    if (game && game.status === 'active' && currentUser && hasRestoredStateRef.current) {
      // Only save state after we've restored it (to avoid saving initial state immediately)
      savePvPGameState();
    }
  }, [guesses, inputWord, alphabet, game, currentUser]);

  // Restore PvP game state when game loads
  useEffect(() => {
    if (game && game.status === 'active' && currentUser && !hasRestoredStateRef.current) {
      restorePvPGameState();
    }
  }, [game, currentUser]);

  // Save game state when component unmounts or user navigates away
  useEffect(() => {
    return () => {
      if (game && game.status === 'active' && currentUser) {
        savePvPGameState();
      }
      // Clear any pending scroll timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [game, currentUser]);

  // Clean up modal states when screen loses focus (navigates away)
  useFocusEffect(
    React.useCallback(() => {
      // Cleanup function when screen loses focus
      return () => {
        // Reset all modal states when navigating away
        setShowGameOverPopup(false);
        setShowCongratulationsPopup(false);
        setShowMenuPopup(false);
        setShowMaxGuessesPopup(false);
        setShowQuitConfirmPopup(false);
        setShowStartGamePopup(false);
      };
    }, [])
  );

  // Handle hardware back button - prevent going back to completed games
  useEffect(() => {
    const backAction = () => {
      // If viewing results from a completed game, go back to where we came from
      if (showResults && game && game.status === 'completed') {
        navigation.goBack();
        return true; // Prevent default back behavior
      }
      
      // If game is active, allow normal back behavior
      if (game && game.status === 'active') {
        return false; // Allow default back behavior
      }
      
      // For other cases (no game, loading, etc.), navigate to MainTabs
      navigation.navigate('MainTabs');
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [navigation, showResults, game]);

  // Keep refs in sync with state to avoid stale closures inside snapshot listener
  useEffect(() => {
    showGameOverPopupRef.current = showGameOverPopup;
  }, [showGameOverPopup]);
  useEffect(() => {
    resultSoundPlayedRef.current = resultSoundPlayed;
  }, [resultSoundPlayed]);
  useEffect(() => {
    showCongratulationsPopupRef.current = showCongratulationsPopup;
  }, [showCongratulationsPopup]);
  useEffect(() => {
    // Reset guards when switching to a different game
    handledCompletionRef.current = false;
    resultSoundPlayedRef.current = false;
    setResultSoundPlayed(false);
    hasRestoredStateRef.current = false; // Reset restore flag for new game
    resultsShownForSessionRef.current = false; // Reset results shown flag for new game
    hasShownStartGamePopupRef.current = false; // Reset start game popup flag for new game
  }, [gameId]);

  // Helper functions to get player data
  const getCurrentPlayerData = (gameData) => {
    if (gameData.player1?.uid === currentUser?.uid) {
      return { ...gameData.player1, field: 'player1', uid: gameData.player1.uid };
    } else {
      return { ...gameData.player2, field: 'player2', uid: gameData.player2.uid };

    }
  };

  const updateUserStats = async (userId, isWin) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        gamesPlayed: increment(1),
        ...(isWin && { gamesWon: increment(1) })
      });
    } catch (error) {
      console.error('PvPGameScreen: Failed to update user stats', error);
    }
  };

  // Determine final game result when both players have finished
  const determineGameResult = async (gameData, currentUserId) => {
    try {
      // CRITICAL: Always fetch fresh game data to get accurate attempt counts
      const gameRef = doc(db, 'games', gameId);
      const freshGameDoc = await getDoc(gameRef);
      if (!freshGameDoc.exists()) {
        console.error('determineGameResult: Game not found');
        return;
      }
      const freshGameData = freshGameDoc.data();
      
      const currentPlayerData = getMyPlayerData(freshGameData);
      const opponentPlayerData = getOpponentPlayerData(freshGameData);
      
      // Safety checks for player data
      if (!currentPlayerData || !opponentPlayerData) {
        console.error('determineGameResult: Missing player data', { 
          currentPlayerData, 
          opponentPlayerData,
          freshGameData: {
            hasPlayer1: !!freshGameData.player1,
            hasPlayer2: !!freshGameData.player2,
            player1Solved: freshGameData.player1?.solved,
            player2Solved: freshGameData.player2?.solved,
            player1Attempts: freshGameData.player1?.attempts,
            player2Attempts: freshGameData.player2?.attempts,
            currentUserId: currentUser?.uid
          }
        });
        return;
      }
      
      console.log('determineGameResult: Player data:', {
        currentPlayer: { uid: currentPlayerData.uid, attempts: currentPlayerData.attempts, solved: currentPlayerData.solved },
        opponent: { uid: opponentPlayerData.uid, attempts: opponentPlayerData.attempts, solved: opponentPlayerData.solved }
      });
      
      let winnerId = null;
      let tie = false;
      
      if (currentPlayerData.solved && opponentPlayerData.solved) {
        // Both solved - LOWER attempts wins
        console.log('determineGameResult: Both solved, comparing attempts:', currentPlayerData.attempts, 'vs', opponentPlayerData.attempts);
        if (currentPlayerData.attempts < opponentPlayerData.attempts) {
          winnerId = currentUserId;
          console.log('determineGameResult: Current player wins with fewer attempts');
        } else if (opponentPlayerData.attempts < currentPlayerData.attempts) {
          winnerId = opponentPlayerData.uid;
          console.log('determineGameResult: Opponent wins with fewer attempts');
        } else {
          tie = true;
          console.log('determineGameResult: Tie - same attempts');
        }
      } else if (currentPlayerData.solved && !opponentPlayerData.solved) {
        // Only current player solved
        winnerId = currentUserId;
        console.log('determineGameResult: Current player wins - only solver');
      } else if (!currentPlayerData.solved && opponentPlayerData.solved) {
        // Only opponent solved
        winnerId = opponentPlayerData.uid;
        console.log('determineGameResult: Opponent wins - only solver');
      } else {
        // Neither solved - tie
        tie = true;
        console.log('determineGameResult: Tie - neither solved');
      }
      
      // Determine second finisher using fresh data
      const secondFinisherId = (freshGameData.player1?.solveTime && freshGameData.player2?.solveTime && (new Date(freshGameData.player1.solveTime) > new Date(freshGameData.player2.solveTime))) ? freshGameData.player1?.uid
                              : (freshGameData.player1?.solveTime && freshGameData.player2?.solveTime) ? freshGameData.player2?.uid
                              : null;
      
      // Update game status and track results visibility
      // Initialize resultsSeenBy with second finisher since they're seeing results right now
      await updateDoc(doc(db, 'games', gameId), {
        status: 'completed',
        completedAt: new Date().toISOString(),
        winnerId: winnerId,
        tie: tie,
        resultsSeenBy: secondFinisherId ? [secondFinisherId] : [],
        // Mark first and second finisher for precise badge logic on Home
        firstFinisherId: (freshGameData.player1?.solved && !freshGameData.player2?.solved) ? freshGameData.player1?.uid
                         : (!freshGameData.player1?.solved && freshGameData.player2?.solved) ? freshGameData.player2?.uid
                         : (freshGameData.player1?.solveTime && freshGameData.player2?.solveTime && (new Date(freshGameData.player1.solveTime) < new Date(freshGameData.player2.solveTime))) ? freshGameData.player1?.uid
                         : (freshGameData.player1?.solveTime && freshGameData.player2?.solveTime) ? freshGameData.player2?.uid
                         : null,
        secondFinisherId: secondFinisherId
      });
      
      console.log('determineGameResult: Final result set - winnerId:', winnerId, 'tie:', tie);
      
      // Remove game from both players' activeGames arrays since game is now completed
      try {
        const player1Uid = freshGameData.player1?.uid;
        const player2Uid = freshGameData.player2?.uid;
        
        if (player1Uid) {
          await updateDoc(doc(db, 'users', player1Uid), {
            activeGames: arrayRemove(gameId)
          }).catch(() => {}); // Ignore errors
        }
        
        if (player2Uid) {
          await updateDoc(doc(db, 'users', player2Uid), {
            activeGames: arrayRemove(gameId)
          }).catch(() => {}); // Ignore errors
        }
      } catch (error) {
        console.log('PvPGameScreen: Failed to remove game from activeGames (non-critical):', error);
      }
      
      // Update stats only for the current user (avoid permission issues updating other user's profile)
      await updateUserStats(currentUserId, winnerId === currentUserId);
      
      // Update PvP rolling averages for both players
      const gameDifficulty = freshGameData.difficulty || 'regular';
      const currentUserWin = winnerId === currentUserId;
      const opponentWin = winnerId === opponentPlayerData.uid;
      
      try {
        await playerProfileService.updatePvpDifficultyRollingAverages(currentUserId, gameDifficulty, currentUserWin);
      } catch (error) {
        console.error('PvPGameScreen: Failed to update PvP rolling averages:', error);
      }

      // Update friend vs friend records
      try {
        const player1Uid = freshGameData.player1?.uid;
        const player2Uid = freshGameData.player2?.uid;
        
        console.log('PvPGameScreen: Updating friend records', { player1Uid, player2Uid, winnerId, tie });
        
        if (player1Uid && player2Uid) {
          await friendRecordsService.updateGameRecord(player1Uid, player2Uid, winnerId, tie);
          console.log('PvPGameScreen: Friend records updated successfully');
        } else {
          console.warn('PvPGameScreen: Missing player UIDs, cannot update friend records', { player1Uid, player2Uid });
        }
      } catch (error) {
        console.error('PvPGameScreen: Failed to update friend records:', error);
        console.error('PvPGameScreen: Error details:', error.message, error.code);
      }

      // Save stats immediately for leaderboard (do not wait for archival)
      try {
        const playersArray = freshGameData.playerIds || freshGameData.players || [freshGameData.player1?.uid, freshGameData.player2?.uid].filter(Boolean);
        const statsDoc = {
          gameId: gameId,
          players: playersArray,
          completedAt: new Date().toISOString(),
          winnerId: winnerId,
          tie: !!tie,
          type: 'pvp',
          wordLength: freshGameData.wordLength,
          difficulty: gameDifficulty,
          playerStats: {
            [freshGameData.player1?.uid || playersArray?.[0]]: {
              attempts: freshGameData.player1?.attempts ?? 0,
              solved: !!freshGameData.player1?.solved,
              solveTime: freshGameData.player1?.solveTime || null
            },
            [freshGameData.player2?.uid || playersArray?.[1]]: {
              attempts: freshGameData.player2?.attempts ?? 0,
              solved: !!freshGameData.player2?.solved,
              solveTime: freshGameData.player2?.solveTime || null
            }
          }
        };
        await setDoc(doc(db, 'gameStats', gameId), statsDoc);
      } catch (statsErr) {
        console.error('PvPGameScreen: Failed to write immediate gameStats for leaderboard:', statsErr);
      }
      
      // Send completion notifications (in-app Firestore notifications so Home can badge)
      try {
        // Avoid duplicate notifications if already sent
        const gameRef = doc(db, 'games', gameId);
        const snap = await getDoc(gameRef);
        const fresh = snap.exists() ? snap.data() : {};
        if (!fresh.notificationsSent) {
          const { getNotificationService } = require('./notificationService');
          const notificationService = getNotificationService();
          const player1Uid = freshGameData.player1?.uid;
          const player2Uid = freshGameData.player2?.uid;
          const messageFor = (uid) => {
            if (tie) return "It's a tie! Both players finished.";
            return winnerId === uid ? 'Congratulations! You won!' : 'Game over! Your opponent won.';
          };
          // Only notify the first finisher to avoid ghost badge for the second finisher
          const firstFinisher = fresh.firstFinisherId || null;
          if (tie && player1Uid && player2Uid) {
            // Send notifications ONLY to the first finisher (who is waiting at home)
            // Second finisher is actively in the app viewing results - they don't need any notification
            const secondFinisherId = fresh.secondFinisherId || null;
            if (firstFinisher && secondFinisherId && firstFinisher !== secondFinisherId) {
              // Send in-app Firestore notification (for badge count)
              await notificationService.sendGameCompletionNotification(firstFinisher, gameId, messageFor(firstFinisher));
              
              // Send push notification - no results shared
              const opponentUsername = firstFinisher === player1Uid 
                ? freshGameData.player2?.username || 'your opponent'
                : freshGameData.player1?.username || 'your opponent';
              
              await notificationService.sendPushNotification(
                firstFinisher, 
                'WhatWord', 
                `The Battle with ${opponentUsername} is over. View Results`, 
                {
                  type: 'game_completed',
                  gameId,
                  timestamp: new Date().toISOString()
                }
              ).catch(err => console.error('Failed to send push notification to first finisher:', err));
            }
          } else if (firstFinisher && (firstFinisher === player1Uid || firstFinisher === player2Uid)) {
            // Send in-app Firestore notification to first finisher
            await notificationService.sendGameCompletionNotification(firstFinisher, gameId, messageFor(firstFinisher));
            
            // Send push notification to first finisher - no results shared
            const opponentUid = firstFinisher === player1Uid ? player2Uid : player1Uid;
            const opponentUsername = firstFinisher === player1Uid ? freshGameData.player2?.username : freshGameData.player1?.username;
            
            // Send push notification to first finisher
            await notificationService.sendPushNotification(
              firstFinisher,
              'WhatWord',
              `The Battle with ${opponentUsername || 'your opponent'} is over. View Results`,
              {
                type: 'game_completed',
                gameId,
                timestamp: new Date().toISOString()
              }
            ).catch(err => console.error('Failed to send push notification to first finisher:', err));
          }
          // Mark notifications sent
          await updateDoc(gameRef, { notificationsSent: true });
        }
      } catch (notifyErr) {
        console.error('PvPGameScreen: Failed to send completion notifications:', notifyErr);
      }

      // Do not delete completed game immediately; keep until both players view results
      // UI for final results is handled by the snapshot listener to allow gating after congrats
      
    } catch (error) {
      console.error('PvPGameScreen: Failed to determine game result:', error);
    }
  };

  const handleQuitGame = async () => {
    try {
      console.log('PvPGameScreen: handleQuitGame called');
      console.log('PvPGameScreen: Auth state:', auth.currentUser);
      console.log('PvPGameScreen: Game object:', game);
      console.log('PvPGameScreen: Current user object:', currentUser);
      
      if (game && currentUser && game.id) {
        console.log('PvPGameScreen: Attempting to quit game:', game.id);
        console.log('PvPGameScreen: Game data:', game);
        console.log('PvPGameScreen: Current user:', currentUser.uid);
        
        // Test Firestore connection first
        console.log('PvPGameScreen: Testing Firestore connection...');
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        
        try {
          const gameDoc = await getDoc(doc(db, 'games', game.id));
          console.log('PvPGameScreen: Game document exists:', gameDoc.exists());
          if (gameDoc.exists()) {
            console.log('PvPGameScreen: Game document data:', gameDoc.data());
          }
        } catch (testError) {
          console.error('PvPGameScreen: Firestore test failed:', testError);
        }
        
        await gameService.forfeitGame(game.id);
        
        console.log('PvPGameScreen: Successfully quit game');
        setShowQuitConfirmPopup(false);
        setShowMenuPopup(false);
        navigation.navigate('MainTabs');
        playSound('chime').catch(() => {});
      } else {
        console.error('PvPGameScreen: Missing required data for quit game:', {
          hasGame: !!game,
          hasCurrentUser: !!currentUser,
          hasGameId: !!(game && game.id)
        });
        Alert.alert('Error', 'Game data is missing. Please try again.');
      }
    } catch (error) {
      console.error('PvPGameScreen: Failed to quit game:', error);
      console.error('PvPGameScreen: Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      Alert.alert('Error', `Failed to quit game: ${error.message || 'Please try again.'}`);
    }
  };

  useEffect(() => {
    // Get current user
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setCurrentUser(user);
      }
    });

    return unsubscribe;
  }, []);

  // Audio mode is now handled in soundsUtil.js

  // Auto-scroll to bottom when guesses are updated
  useEffect(() => {
    if (guesses.length > 0) {
      // Use longer delay for state restoration to prevent flashing
      const delay = hasRestoredStateRef.current ? 100 : 300;
      scrollToBottom(delay, true);
    }
  }, [guesses, scrollToBottom]);

  // Auto-scroll to bottom when game is first loaded
  useEffect(() => {
    if (game && game.gameHistory && scrollViewRef.current) {
      const myGuesses = game.gameHistory.filter(entry => entry && entry.player === currentUser?.uid);
      if (myGuesses.length > 0) {
        // Use longer delay for initial load to ensure content is rendered
        scrollToBottom(500, false);
      }
    }
  }, [game, currentUser, scrollToBottom]);

  useEffect(() => {
    if (!gameId || !currentUser) return;

    // Listen to game updates
    const gameRef = doc(db, 'games', gameId);
    const unsubscribe = onSnapshot(gameRef, async (docSnap) => {
      console.log('PvPGameScreen: onSnapshot callback triggered, docSnap.exists():', docSnap.exists());
      console.log('PvPGameScreen: showResults parameter at start of onSnapshot:', showResults);
      if (docSnap.exists()) {
        const gameData = { id: docSnap.id, ...docSnap.data() };
        console.log('PvPGameScreen: Game data loaded:', gameData);
        
        // If this is a "View Results" scenario from ResumeGamesScreen, show the game over popup
        // Only trigger this if showResults is explicitly true AND we're not showing congratulations popup
        console.log('PvPGameScreen: Checking View Results logic - showResults:', showResults, 'status:', gameData.status, 'winnerId:', gameData.winnerId, 'tie:', gameData.tie, 'showCongratulations:', showCongratulationsPopup);
        if (showResults === true && gameData.status === 'completed' && (gameData.winnerId !== undefined || gameData.tie) && !showGameOverPopupRef.current && !resultsShownForSessionRef.current && !showCongratulationsPopupRef.current) {
          const resultPayload = {
            winnerId: gameData.winnerId,
            tie: gameData.tie,
            currentUserId: currentUser.uid
          };
          console.log('PvPGameScreen: Showing results popup from ResumeGamesScreen');
          setGameOverData(resultPayload);
          setShowGameOverPopup(true);
          resultsShownForSessionRef.current = true; // Mark that we've shown results for this session
          
          // Play appropriate sound for results when viewing from ResumeGamesScreen
          if (!resultSoundPlayedRef.current) {
            if (gameData.tie) {
              playSound('tie').catch(() => {});
            } else if (gameData.winnerId === currentUser.uid) {
              playSound('victory').catch(() => {});
            } else {
              playSound('lose').catch(() => {});
            }
            setResultSoundPlayed(true);
            resultSoundPlayedRef.current = true;
          }
        }
        // Ensure UI leaves loading state immediately regardless of status
        setGame(prev => prev && prev.id === gameData.id && prev.status === gameData.status ? prev : gameData);
        
        // Add this game to current user's activeGames array if not already there
        if (gameData.status === 'active' && currentUser?.uid) {
          try {
            await updateDoc(doc(db, 'users', currentUser.uid), {
              activeGames: arrayUnion(gameId)
            });
          } catch (error) {
            // Ignore errors - this is best effort
          }
        }
        
        // Game update received - keeping minimal logging for debugging
        
        
        // Check if game is ready with new structure (player1/player2) or old structure (playerWord/opponentWord)
        const isGameReady = (gameData.player1?.word && gameData.player2?.word && gameData.player1?.uid && gameData.player2?.uid) || 
                           (gameData.playerWord && gameData.opponentWord && gameData.creatorId && currentUser && currentUser.uid);
        
        // Debug logging removed for cleaner logs
        
        // Check for timeouts
        const timeoutType = gameService.checkGameTimeouts(gameData);
        
        if (timeoutType !== 'active') {
          // Handle timeout automatically
          gameService.handleGameTimeout(gameData.id, timeoutType).catch(error => {
            console.error('Failed to handle timeout:', error);
          });
          return;
        }
        
        // Only set game if it has valid structure
        if (gameData && ((gameData.player1 && gameData.player2 && gameData.player1.uid && gameData.player2.uid) || (gameData.playerWord && gameData.opponentWord && gameData.creatorId))) {
          console.log('PvPGameScreen: Game data has valid structure, setting game');
          setGame(gameData);
          
          // Show "The Battle Has Begun!" popup when game becomes active (both words are set)
          // Only show once per session (using ref to track)
          if (gameData.status === 'active' && !hasShownStartGamePopupRef.current && !showResults) {
            const hasWords = (gameData.player1?.word && gameData.player2?.word) || (gameData.playerWord && gameData.opponentWord);
            
            if (hasWords) {
              console.log('PvPGameScreen: Game is active with both words set, showing start game popup');
              setShowStartGamePopup(true);
              playSound('startGame').catch(() => {});
              hasShownStartGamePopupRef.current = true;
            }
          }
          
          // Check if game should be automatically completed (both players finished but status still 'active')
          if (gameData.status === 'active') {
            const currentPlayerData = getMyPlayerData(gameData);
            const opponentPlayerData = getOpponentPlayerData(gameData);
            
            if (currentPlayerData && opponentPlayerData) {
              const currentPlayerFinished = currentPlayerData.solved || (currentPlayerData.attempts && currentPlayerData.attempts >= getMaxGuesses());
              const opponentPlayerFinished = opponentPlayerData.solved || (opponentPlayerData.attempts && opponentPlayerData.attempts >= getMaxGuesses());
              
              
              if (currentPlayerFinished && opponentPlayerFinished) {
                // Game should be completed - determine result
                determineGameResult(gameData, currentUser.uid).catch(error => {
                  console.error('Failed to auto-complete game:', error);
                });
              }
            }
          }
        }

        
                 // Update guesses from game history
         if (gameData.gameHistory && Array.isArray(gameData.gameHistory)) {

           const myGuesses = gameData.gameHistory
             .filter(entry => entry && entry.player === currentUser.uid)
             .map(entry => {

               
               // Use stored dots and circles values if available, otherwise fall back to parsing feedback
               let circles = 0;
               let dots = 0;
               
               if (entry.dots !== undefined && entry.circles !== undefined) {
                 // Use the stored values (new format)
                 circles = entry.circles;
                 dots = entry.dots;

               } else if (entry.feedback) {
                 // Fall back to parsing feedback string (old format)
                 const feedbackString = typeof entry.feedback === 'string' ? entry.feedback : entry.feedback.toString() || '';
                 circles = feedbackString.split('').filter(char => char === '●').length;
                 dots = feedbackString.split('').filter(char => char === '○').length;

               }
               
               return {
                 word: entry.guess || '',
                 circles: circles,
                 dots: dots,
                 isCorrect: entry.isCorrect || false
               };
             });

          if (myGuesses && Array.isArray(myGuesses)) {
            setGuesses(myGuesses);
            
            // Auto-scroll to show the latest guess when guesses are updated from game data
            if (myGuesses.length > 0) {
              scrollToBottom(300, true);
            }
          }
          
          // Load alphabet toggle state for current player
          if (gameData.player1 && gameData.player2 && currentUser) {
            const isPlayer1 = gameData.player1.uid === currentUser.uid;
            const savedAlphabetState = isPlayer1 ? gameData.player1.alphabetState : gameData.player2.alphabetState;
            
            if (savedAlphabetState && Array.isArray(savedAlphabetState) && savedAlphabetState.length === 26) {
              console.log('PvPGameScreen: Restoring alphabet state for', isPlayer1 ? 'player1' : 'player2');
              setAlphabet(savedAlphabetState);
            }
          }

        }
      } else {
        // Document doesn't exist - handle this case
        console.log('PvPGameScreen: Game document not found for gameId:', gameId);
        setIsLoading(false);
        
        Alert.alert('Game Not Found', 'This game no longer exists. It may have been completed or deleted.');
        navigation.navigate('MainTabs');
      }
    }, (error) => {
      console.error('PvPGameScreen: onSnapshot error:', error);
      
      if (error.message.includes('permission') || error.message.includes('access')) {
        Alert.alert('Game Error', 'You no longer have access to this game. It may have been completed or abandoned.');
        navigation.navigate('Friends');
      } else {
        Alert.alert('Error', 'Failed to load game data. Please try again.');
        navigation.navigate('MainTabs');
      }
    });

    return unsubscribe;
  }, [gameId, currentUser]);

  const getMyPlayerData = (gameData = game) => {
    if (!gameData || !currentUser) return null;
    
    // Debug logging removed for cleaner logs
    
    // Handle new game structure (player1/player2)
    if (gameData.player1 && gameData.player2 && gameData.player1.uid && gameData.player2.uid) {
      const isPlayer1 = gameData.player1.uid === currentUser.uid;
      const myPlayer = isPlayer1 ? gameData.player1 : gameData.player2;
      
      // Additional safety check
      if (!myPlayer.uid) {
        console.error('getMyPlayerData: My player missing uid');
        return null;
      }
      
      const result = {
        uid: currentUser.uid,
        attempts: myPlayer.attempts || 0,
        solved: myPlayer.solved || false,
        word: myPlayer.word,
        field: isPlayer1 ? 'player1' : 'player2'
      };
      // Debug logging removed for cleaner logs
      return result;
    }
    
    // Handle old game structure (playerWord/opponentWord)
    if (gameData.creatorId && gameData.playerIds && Array.isArray(gameData.playerIds) && currentUser && currentUser.uid) {
      const isCreator = gameData.creatorId === currentUser.uid;
      const result = {
        uid: currentUser.uid,
        attempts: isCreator ? (gameData.playerGuesses?.length || 0) : (gameData.opponentGuesses?.length || 0),
        solved: isCreator ? gameData.playerSolved : gameData.opponentSolved,
        word: isCreator ? gameData.playerWord : gameData.opponentWord,
        field: isCreator ? 'player1' : 'player2' // Fallback for old structure
      };
      // Debug logging removed for cleaner logs
      return result;
    }
    
    console.error('getMyPlayerData: Invalid game data structure');
    return null;
  };

  const getOpponentPlayerData = (gameData) => {
    if (!gameData || !currentUser) return null;
    
    
    // Handle new game structure (player1/player2)
    if (gameData.player1 && gameData.player2 && gameData.player1.uid && gameData.player2.uid) {
      const isPlayer1 = gameData.player1.uid === currentUser.uid;
      const opponentPlayer = isPlayer1 ? gameData.player2 : gameData.player1;
      
      // Additional safety check
      if (!opponentPlayer.uid) {
        console.error('getOpponentPlayerData: Opponent player missing uid');
        return null;
      }
      
      const result = {
        uid: opponentPlayer.uid,
        username: opponentPlayer.username,
        attempts: opponentPlayer.attempts || 0,
        solved: opponentPlayer.solved || false,
        word: opponentPlayer.word
      };
      // Debug logging removed for cleaner logs
      return result;
    }
    
    // Handle old game structure (playerWord/opponentWord)
    if (gameData.creatorId && gameData.playerIds && Array.isArray(gameData.playerIds) && currentUser && currentUser.uid) {
      const isCreator = gameData.creatorId === currentUser.uid;
      const opponentUid = isCreator ? gameData.playerIds.find(id => id !== currentUser.uid) : gameData.creatorId;
      
      if (!opponentUid) {
        console.error('getOpponentPlayerData: Could not determine opponent uid');
        return null;
      }
      
      const result = {
        uid: opponentUid,
        username: null, // Username not available in old game structure
        attempts: isCreator ? (gameData.opponentGuesses?.length || 0) : (gameData.playerGuesses?.length || 0),
        solved: isCreator ? gameData.opponentSolved : gameData.playerSolved,
        word: isCreator ? gameData.opponentWord : gameData.playerWord
      };
      // Debug logging removed for cleaner logs
      return result;
    }
    
    console.error('getOpponentPlayerData: Invalid game data structure');
    return null;
  };

  const getOpponentWord = () => {
    if (!game || !currentUser) return null;
    
    // Handle new game structure (player1/player2)
    if (game.player1 && game.player2 && game.player1.uid && game.player2.uid) {
      const isPlayer1 = game.player1.uid === currentUser.uid;
      const opponentWord = isPlayer1 ? game.player2.word : game.player1.word;
      return opponentWord || null;
    }
    
    // Handle old game structure (playerWord/opponentWord)
    if (game.creatorId && (game.playerWord || game.opponentWord) && currentUser && currentUser.uid) {
      const isCreator = game.creatorId === currentUser.uid;
      const opponentWord = isCreator ? game.opponentWord : game.playerWord;
      return opponentWord || null;
    }
    
    console.error('getOpponentWord: Could not determine opponent word');
    return null;
  };

  const canGuess = () => {
    if (!game || !currentUser) return false;
    const myPlayerData = getMyPlayerData();
    return myPlayerData && !myPlayerData.solved && guesses.length < getMaxGuesses();
  };

  const handleLetterInput = (letter) => {
    if (game && inputWord.length < game.wordLength && canGuess()) {
      setInputWord(prev => prev + letter);
      playSound('letterInput').catch(() => {});
    }
  };

  const handleBackspace = () => {
    if (inputWord.length > 0 && canGuess()) {
      setInputWord(prev => prev.slice(0, -1));
      playSound('backspace').catch(() => {});
    }
  };

  const toggleLetter = (index) => {
    // Only allow letter toggling if player can still guess
    if (!canGuess()) return;
    
    const current = alphabet[index];
    if (current === 'unknown') {
      setAlphabet(prev => {
        const next = [...prev];
        next[index] = 'absent';
        return next;
      });
      playSound('toggleLetter').catch(() => {});
    } else if (current === 'absent') {
      setAlphabet(prev => {
        const next = [...prev];
        next[index] = 'present';
        return next;
      });
      playSound('toggleLetterSecond').catch(() => {});
    } else {
      setAlphabet(prev => {
        const next = [...prev];
        next[index] = 'unknown';
        return next;
      });
      playSound('toggleLetter').catch(() => {});
    }
  };

        const handleSubmit = async () => {
      if (!game || !currentUser || !canGuess()) {
        Alert.alert('Cannot Guess', 'You have either solved the word or reached the maximum attempts.');
        return;
      }

      // Validate game state before proceeding
      
      // Check if game is ready with new structure (player1/player2) or old structure (playerWord/opponentWord)
      const isGameReady = (game.player1?.word && game.player2?.word && game.player1?.uid && game.player2?.uid) || 
                         (game.playerWord && game.opponentWord && game.creatorId);
      
      if (!isGameReady) {
        Alert.alert('Game Not Ready', 'This game is not properly set up. Please wait for both players to set their words.');
        return;
      }

      if (!game.status || (game.status !== 'active' && game.status !== 'waiting_for_opponent')) {
        Alert.alert('Game Not Active', 'This game is not currently active. Please check the game status.');
        return;
      }

      if (!inputWord || inputWord.length !== (game.wordLength || 0)) {
        Alert.alert('Invalid Guess', `Please enter a ${game.wordLength || 'valid'}-letter word.`);
        return;
      }

    // Validate word against the appropriate word list
    const wordLength = game.wordLength || 0;
    const isValid = await isValidWord(inputWord.toLowerCase(), wordLength);
    if (!isValid) {
      await playSound('invalidWord').catch(() => {});
      setShowInvalidPopup(true);
      return;
    }

    setIsLoading(true);
    try {
      const gameRef = doc(db, 'games', gameId);
      const myPlayerData = getMyPlayerData();
      const opponentWord = getOpponentWord();
      
      // Safety check for opponent word
      if (!opponentWord) {
        Alert.alert('Game Error', 'Could not determine opponent word. Please check the game setup.');
        return;
      }
      
      // Safety check for my player data
      if (!myPlayerData) {
        Alert.alert('Game Error', 'Could not determine your player data. Please check the game setup.');
        return;
      }
      
      // Check if guess is correct
      const isCorrect = inputWord.toLowerCase() === opponentWord.toLowerCase();
      const feedbackData = getFeedback(inputWord.toUpperCase(), opponentWord.toUpperCase());
      
      // Feedback data generated for guess
      
      // Update game with new guess
      const updateData = {
        gameHistory: arrayUnion({
          player: currentUser.uid,
          guess: inputWord.toUpperCase(),
          feedback: feedbackData.feedback,
          dots: feedbackData.dots,
          circles: feedbackData.circles,
          timestamp: new Date(),
          isCorrect: isCorrect
        })
      };

             // Update player's solved status for old structure (playerWord/opponentWord)
       if (game.creatorId && currentUser && currentUser.uid) {
         const isCreator = game.creatorId === currentUser.uid;
         if (isCorrect) {
           if (isCreator) {
             updateData['playerSolved'] = true;
           } else {
             updateData['opponentSolved'] = true;
           }
         }
       }
       
      // Update player's solved status for new structure (player1/player2)
      if (game.player1 && game.player2 && game.player1.uid && game.player2.uid && currentUser && currentUser.uid) {
        const isPlayer1 = game.player1.uid === currentUser.uid;
        if (isCorrect) {
          if (isPlayer1) {
            updateData['player1.solved'] = true;
          } else {
            updateData['player2.solved'] = true;
          }
        }
        
        // Also update attempts count and last activity
        if (isPlayer1) {
          updateData['player1.attempts'] = increment(1);
          updateData['player1.lastGuess'] = new Date().toISOString();
          // Save alphabet toggle state for player1
          updateData['player1.alphabetState'] = alphabet;
        } else {
          updateData['player2.attempts'] = increment(1);
          updateData['player2.lastGuess'] = new Date().toISOString();
          // Save alphabet toggle state for player2
          updateData['player2.alphabetState'] = alphabet;
        }
      }

      // Add lastActivity update
      updateData.lastActivity = new Date().toISOString();
      
      try {
        await updateDoc(gameRef, updateData);
        
        setInputWord('');
        playSound('chime').catch(() => {});
        
        // Auto-scroll to show the latest guess
        scrollToBottom(200, true);
      } catch (error) {
        console.error('Failed to update game with guess:', error);
        
        // Check if game no longer exists or is in invalid state
        if (error.code === 'not-found' || error.message.includes('not found')) {
          Alert.alert('Game Error', 'This game no longer exists or has been deleted. Please return to the Friends screen.');
          navigation.navigate('Friends');
          return;
        }
        
        // Check if game is in invalid state
        if (error.message.includes('permission') || error.message.includes('access')) {
          Alert.alert('Game Error', 'You no longer have access to this game. It may have been completed or abandoned.');
          navigation.navigate('Friends');
          return;
        }
        
        // Generic error
        Alert.alert('Error', 'Failed to submit guess. Please try again.');
        return;
      }
      
             if (isCorrect) {
               // Determine if this player is the second solver (opponent already finished or maxed out)
               try {
                 // Read latest game data to avoid stale state
                 const currentSnap = await getDoc(gameRef);
                 const currentData = currentSnap.exists() ? currentSnap.data() : game;
                 const opponentAtSolve = getOpponentPlayerData(currentData);
                 const opponentFinished = !!(opponentAtSolve?.solved) || (typeof opponentAtSolve?.attempts === 'number' && opponentAtSolve.attempts >= getMaxGuesses());
                 setIsSecondSolver(!!opponentFinished);
               } catch (_) {
                 setIsSecondSolver(false);
               }

               // Player solved the word - show congratulations popup
               setShowCongratulationsPopup(true);
               await playSound('congratulations').catch(() => {});
               
               // Auto-scroll to show the latest guess when player solves the word
               scrollToBottom(100, true);
               
                             // Mark current player as solved
              const currentPlayerData = getMyPlayerData();
              await updateDoc(gameRef, {
                [`${currentPlayerData.field}.solved`]: true,
                [`${currentPlayerData.field}.attempts`]: guesses.length + 1,
                [`${currentPlayerData.field}.solveTime`]: new Date().toISOString()
              });
              
              // Get fresh game data to check opponent status BEFORE deciding on status update
              const freshGameDoc = await getDoc(gameRef);
              const freshGameData = freshGameDoc.data();
              
              // Check if both players have finished (both solved or both reached max attempts)
              const opponentPlayerData = getOpponentPlayerData(freshGameData);
              
              if (opponentPlayerData?.solved || opponentPlayerData?.attempts >= getMaxGuesses()) {
                // Game is over - determine final result
                await determineGameResult(freshGameData, currentUser.uid);
              } else {
                // Opponent hasn't finished yet - update game status to waiting_for_opponent
                await updateDoc(gameRef, {
                  status: 'waiting_for_opponent',
                  waitingForPlayer: opponentPlayerData.uid,
                  lastUpdated: new Date().toISOString()
                });
              }
               // If game not over, player waits for opponent to finish
               // If game not over, player waits for opponent to finish
             } else if (guesses.length + 1 >= getMaxGuesses()) {
               // Reached max attempts without solving
               const currentPlayerData = getMyPlayerData();
               await updateDoc(gameRef, {
                 [`${currentPlayerData.field}.attempts`]: guesses.length + 1
               });
               
               // Get fresh game data to check opponent status
               const freshGameDoc = await getDoc(gameRef);
               const freshGameData = freshGameDoc.data();
               
               // Check if both players have finished
               const opponentPlayerData = getOpponentPlayerData(freshGameData);
               
               if (opponentPlayerData?.solved || opponentPlayerData?.attempts >= getMaxGuesses()) {
                 // Game is over - determine final result
                 await determineGameResult(freshGameData, currentUser.uid);
               } else {
                 // Current player reached max attempts, waiting for opponent
                 setShowMaxGuessesPopup(true);
                 
                 // Auto-scroll to show the latest guess when max attempts reached
                 scrollToBottom(100, true);
               }
             }
      
    } catch (error) {
      console.error('Failed to submit guess:', error);
      Alert.alert('Error', 'Failed to submit guess. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to delete completed game and preserve only statistics
  const deleteCompletedGame = async (gameId, gameData) => {
    try {
      
      // Safety checks for game data
      if (!gameData || !gameData.players || !Array.isArray(gameData.players) || gameData.players.length < 2) {
        console.error('deleteCompletedGame: Invalid game data structure', gameData);
        return false;
      }
      
      // Extract only the statistics needed for leaderboard
      const gameStats = {
        gameId: gameId,
        players: gameData.players,
        completedAt: gameData.completedAt,
        winnerId: gameData.winnerId,
        tie: gameData.tie,
        type: 'pvp',
        wordLength: gameData.wordLength, // Add wordLength for difficulty filtering
        difficulty: gameData.difficulty || 'regular', // Keep difficulty for backward compatibility
        // Preserve player performance data for leaderboard calculations
        playerStats: {
          [gameData.players[0]]: {
            attempts: gameData.player1?.attempts || gameData.playerGuesses?.length || 0,
            solved: gameData.player1?.solved || false,
            solveTime: gameData.player1?.solveTime
          },
          [gameData.players[1]]: {
            attempts: gameData.player2?.attempts || gameData.opponentGuesses?.length || 0,
            solved: gameData.player2?.solved || false,
            solveTime: gameData.player2?.solveTime
          }
        }
      };
      
      
      // Save statistics to a separate collection for leaderboard purposes
      const statsRef = doc(db, 'gameStats', gameId);
      await setDoc(statsRef, gameStats);
      
      // Delete the actual game document
      await deleteDoc(doc(db, 'games', gameId));
      
      return true;
    } catch (error) {
      console.error('Failed to delete completed game:', error);
      // Don't throw error - just log it to avoid breaking the game flow
      return false;
    }
  };


  const renderGameStatus = () => {
    if (!game || !currentUser) return null;

    const myPlayerData = getMyPlayerData();
    
    // Safety check for my player data
    if (!myPlayerData) {
      console.error('renderGameStatus: Missing my player data');
      return null;
    }
    
    // Check if game is over
    const isGameOver = game.status === 'completed';

    // Do not render inline game-over UI; final results are shown via modal with sound
    if (isGameOver) return null;

    // Check if current player has already solved their opponent's word
    if (myPlayerData?.solved) {
      // Auto-scroll to show the latest guess when player solves the word
      scrollToBottom(100, true);
      
      // Check if opponent has also solved (game is complete)
      const opponentData = getOpponentPlayerData(game);
      if (opponentData?.solved) {
        // Both solved; results modal will handle messaging
        return null;
      } else {
        // Only current player solved - show waiting message
        return (
          <View style={styles.gameStatusContainer}>
            <Text style={[styles.attemptsText, { color: '#10B981', fontWeight: 'bold' }]}>
              ✅ You solved it in {myPlayerData.attempts} attempts!
            </Text>
            <Text style={[styles.attemptsText, { color: '#9CA3AF', fontSize: 14 }]}>
              Waiting for {opponentUsername} to finish...
            </Text>
          </View>
        );
      }
    }
    
    // Don't show anything if no status to display
    return null;
  };

  // Early return if gameId is missing
  if (!gameId) {
    return (
      <SafeAreaView style={styles.screenContainer}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Invalid Game</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
            Game ID is missing. Please try again.
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => {
              playSound('backspace');
              navigation.goBack();
            }}
          >
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!game || !currentUser) {
    return (
      <SafeAreaView style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading game...</Text>
      </SafeAreaView>
    );
  }

  // Get opponent info for display
  const opponentData = getOpponentPlayerData(game);
  const opponentUsername = opponentData?.username || opponentData?.displayName || 'Opponent';

  return (
    <SafeAreaView style={styles.screenContainer}>
      {/* Immersive mode - hide status bar during gameplay for more screen space */}
      <StatusBar hidden={true} />
      
      <Text
        style={[
          styles.soloheader,
          { marginTop: Math.max((styles.soloheader?.marginTop || 0), (insets?.top || 0) + 60) }
        ]}
      >
        Guess {opponentUsername}'s Word
      </Text>
      

      
      <View style={styles.inputDisplay}>
        {[...Array(game.wordLength)].map((_, idx) => (
          <View
            key={`input-${idx}`}
            style={{
              width: isIPad ? 60 : 44,
              height: isIPad ? 60 : 44,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 6,
              backgroundColor: inputWord[idx] ? colors.surface : colors.surfaceLight,
              marginHorizontal: isIPad ? 8 : 6,
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <Text style={{
              color: colors.textPrimary,
              fontSize: isIPad ? 32 : 24,
              fontFamily: 'Roboto-Regular',
              textAlign: 'center',
              includeFontPadding: false
            }}>
              {inputWord[idx] || ''}
            </Text>
          </View>
        ))}
      </View>
      
      <View style={styles.alphabetContainer}>
        <View style={[styles.alphabetGrid, { maxWidth: maxKeyboardWidth }]}>
          {qwertyKeys.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={{ 
              flexDirection: 'row', 
              justifyContent: 'center', 
              alignItems: 'center', 
              width: '100%', 
              marginBottom: 5,
              paddingHorizontal: 5 // Add padding to prevent edge overflow
            }}>
              {row.map((letter) => {
                const index = letter.charCodeAt(0) - 65;
                return (
                  <TouchableOpacity
                    key={letter}
                    onPress={() => handleLetterInput(letter)}
                    onLongPress={() => toggleLetter(index)}
                    delayLongPress={300}
                    disabled={isLoading || !canGuess()}
                    style={{ 
                      width: letterSize, 
                      height: buttonHeight, 
                      marginHorizontal: spacing / 2,
                      marginVertical: 2,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: alphabet[index] === 'absent' ? '#6B7280' : 
                                     alphabet[index] === 'present' ? '#10B981' : colors.surface,
                      borderWidth: 2,
                      borderColor: colors.border,
                      borderRadius: 6
                    }}
                  >
                    <Text
                      style={{ 
                        color: colors.textPrimary,
                        fontSize: Math.floor(letterSize * 0.55),
                        fontFamily: 'Roboto-Bold',
                        textAlign: 'center',
                        includeFontPadding: false
                      }}
                    >
                      {letter}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
      
      <View style={styles.inputControls}>
        <TouchableOpacity
          style={[styles.backspaceButtonContainer, inputWord.length === 0 || !canGuess() ? styles.disabledButton : null]}
          onPress={handleBackspace}
          disabled={!!(isLoading || inputWord.length === 0 || !canGuess())}
        >
          <Text style={styles.buttonTextBackspace}>Backspace</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.guessButtonContainer, inputWord.length !== game.wordLength || !canGuess() ? styles.disabledButton : null]}
          onPress={handleSubmit}
          disabled={!!(isLoading || inputWord.length !== game.wordLength || !canGuess())}
        >
          <Text style={styles.buttonText}>Guess</Text>
        </TouchableOpacity>
      </View>
      
      {renderGameStatus()}
      
      <View style={styles.feedbackGuide}>
        <View style={styles.feedbackItem}>
          <ThreeDPurpleRing size={15} ringWidth={2} style={{ marginRight: 6 }} />
          <Text style={styles.feedbackText}>Correct Letter</Text>
        </View>
        <View style={styles.feedbackItem}>
          <ThreeDGreenDot size={15} style={{ marginRight: 6 }} />
          <Text style={styles.feedbackText}>Correct Spot</Text>
        </View>
      </View>
      
      <ScrollView 
        ref={scrollViewRef} 
        style={styles.scroll} 
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 10 }}
      >
        <Text style={styles.sectionTitle}>Your Guesses</Text>
        {guesses.map((g, idx) => (
          <View key={`guess-${idx}`} style={[styles.guessRow, { minHeight: isIPad ? 50 : 38, paddingVertical: isIPad ? 2 : 1, marginBottom: isIPad ? 3 : 2 }]}>
            <View style={[styles.guessWord, { width: isIPad ? 280 : 140, minHeight: isIPad ? 50 : 38 }]}>
              {g.word.split('').map((letter, i) => (
                <View
                  key={`letter-${idx}-${i}`}
                  style={{
                    width: isIPad ? 46 : 28,
                    height: isIPad ? 60 : 44,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginHorizontal: isIPad ? 2 : 0,
                    overflow: 'visible'
                  }}
                >
                  <Text
                    style={{
                      fontSize: isIPad ? 24 : 20,
                      color: colors.textPrimary,
                      fontFamily: 'Roboto-Regular',
                      textAlign: 'center',
                      includeFontPadding: false
                    }}
                  >
                    {letter}
                  </Text>
                </View>
              ))}
            </View>
                         <View style={styles.feedbackContainer}>
              {[...Array(isNaN(g.circles) ? 0 : g.circles || 0)].map((_, i) => (
               <ThreeDPurpleRing key={`circle-${idx}-${i}`} size={isIPad ? 20 : 15} ringWidth={2} style={{ marginRight: isIPad ? 8 : 6 }} />
              ))}
              {[...Array(isNaN(g.dots) ? 0 : g.dots || 0)].map((_, i) => (
                <ThreeDGreenDot key={`dot-${idx}-${i}`} size={isIPad ? 20 : 15} style={{ marginRight: isIPad ? 8 : 6 }} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      
      {/* FAB - respect safe area so it doesn't overlap status bar */}
      <TouchableOpacity 
        style={[styles.fabTop, { top: (styles.fabTop?.top || 0) + (insets?.top || 0) + 4 }]} 
        onPress={() => setShowMenuPopup(true)}
      >
        <Text style={styles.fabText}>☰</Text>
      </TouchableOpacity>
      
      {/* Menu Popup Modal */}
      <Modal visible={showMenuPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.header, { color: colors.textPrimary }]}>Game Menu</Text>
            
            <TouchableOpacity
              style={styles.button}
              onPress={async () => {
                setShowMenuPopup(false);
                
                // Save current alphabet toggle state before exiting
                if (game && game.player1 && game.player2 && currentUser) {
                  try {
                    const isPlayer1 = game.player1.uid === currentUser.uid;
                    const updateData = {};
                    
                    if (isPlayer1) {
                      updateData['player1.alphabetState'] = alphabet;
                    } else {
                      updateData['player2.alphabetState'] = alphabet;
                    }
                    
                    await updateDoc(doc(db, 'games', gameId), updateData);
                    console.log('PvPGameScreen: Saved alphabet state before exit');
                  } catch (error) {
                    console.error('PvPGameScreen: Failed to save alphabet state:', error);
                    // Continue navigating even if save fails
                  }
                }
                
                navigation.navigate('MainTabs');
              }}
            >
              <Text style={styles.buttonText}>Save & Exit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={() => {
                setShowMenuPopup(false);
                setShowQuitConfirmPopup(true);
              }}
            >
              <Text style={styles.buttonText}>Quit Without Saving</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.button}
              onPress={() => setShowMenuPopup(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Invalid Word Popup */}
      <Modal visible={showInvalidPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.winTitle, { color: colors.textPrimary }]}>Invalid Word</Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary }]}>
              Please enter a valid {game.wordLength}-letter word.
            </Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={() => setShowInvalidPopup(false)}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Start Game Popup - "The Battle Has Begun!" */}
      <Modal visible={showStartGamePopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.winTitle, { color: colors.textPrimary }]}>The Battle Has Begun!</Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary }]}>
              Both players have set their words. Time to see who can solve first!
            </Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={() => {
                setShowStartGamePopup(false);
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>Let's Go!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Congratulations Popup - Individual Word Solved */}
      <Modal visible={showCongratulationsPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.winTitle, { color: colors.textPrimary }]}>Congratulations!</Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary }]}>You solved {opponentUsername}'s word in {guesses.length} guesses!</Text>
            {isSecondSolver ? (
              <Text style={[styles.waitingMessage, { color: colors.textSecondary }]}>You completed your part of the battle!</Text>
            ) : (
              <Text style={[styles.waitingMessage, { color: colors.textSecondary }]}>You've completed your part of the battle! Your opponent is still playing.</Text>
            )}
            {/* 
              PvP Congratulations Popup - Shows for BOTH solvers after solving word
              - First solver (isSecondSolver = false): Blocking ad → Navigate to home
              - Second solver (isSecondSolver = true): Blocking ad → Results popup
            */}
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={async () => {
                setShowCongratulationsPopup(false);
                
                if (isSecondSolver) {
                  // Second solver - show ad before results popup and wait for completion
                  await adService.showInterstitialAd();
                  
                  // Ad has completed - minimal audio recovery
                  console.log('PvPGameScreen: Ad completed, recovering audio...');
                  
                  // Brief delay for audio recovery
                  await new Promise(resolve => setTimeout(resolve, 300));
                  
                  // Reconfigure audio session
                  const { reconfigureAudio } = require('./soundsUtil');
                  await reconfigureAudio().catch(() => console.log('Failed to reconfigure audio'));
                  
                  // Process results after ad completes
                  const resolvedResult = pendingResultData || (game?.status === 'completed' && game?.winnerId !== undefined
                    ? { winnerId: game.winnerId, tie: !!game.tie, currentUserId: currentUser?.uid }
                    : null);
                  if (resolvedResult) {
                    // Determine which sound to play
                    let soundKey = 'lose';
                    if (resolvedResult.tie) {
                      soundKey = 'tie';
                    } else if (resolvedResult.winnerId === currentUser?.uid) {
                      soundKey = 'victory';
                    }
                    
                    // Play result sound FIRST, before showing popup
                    // Force reload sound to ensure it works after ad
                    if (!resultSoundPlayedRef.current) {
                      console.log(`PvPGameScreen: Playing result sound: ${soundKey}`);
                      try {
                        // Use playSound with retry logic built-in
                        await playSound(soundKey);
                        console.log(`PvPGameScreen: Result sound played successfully: ${soundKey}`);
                      } catch (soundError) {
                        console.error('PvPGameScreen: Failed to play result sound:', soundError);
                      }
                      setResultSoundPlayed(true);
                      resultSoundPlayedRef.current = true;
                    }
                    
                    // THEN show results popup after sound starts
                    if (!showGameOverPopupRef.current) {
                      setGameOverData(resolvedResult);
                      setShowGameOverPopup(true);
                      
                      // Second solver is already marked as having seen results in determineGameResult
                      // No need to update resultsSeenBy again here
                    }
                    setPendingResultData(null);
                  } else {
                    playSound('chime').catch(() => {});
                  }
                } else {
                  // First solver - show ad before navigating and wait for completion
                  await adService.showInterstitialAd();
                  
                  // Ad has completed - minimal audio recovery
                  console.log('PvPGameScreen: First solver ad completed, recovering audio...');
                  
                  // Brief delay for audio recovery
                  await new Promise(resolve => setTimeout(resolve, 300));
                  
                  // Reconfigure audio session
                  const { reconfigureAudio } = require('./soundsUtil');
                  await reconfigureAudio().catch(() => console.log('Failed to reconfigure audio'));
                  
                  playSound('chime').catch(() => {});
                  navigation.navigate('MainTabs');
                }
              }}
            >
              <Text style={styles.buttonText}>
                {isSecondSolver ? 'OK' : 'Main Menu'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Game Over Popup - Final Result (Win/Lose/Tie) */}
      <Modal visible={showGameOverPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.winTitle, { color: colors.textPrimary }]}>
              {gameOverData?.tie ? "It's a Tie!" : 
               gameOverData?.winnerId === currentUser?.uid ? "You Won!" : "You Lost!"}
            </Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary }]}>
              {(() => {
                const isPlayer1 = game?.player1?.uid === currentUser?.uid;
                const myAttempts = isPlayer1 ? (game?.player1?.attempts || 0) : (game?.player2?.attempts || 0);
                const opponentAttempts = isPlayer1 ? (game?.player2?.attempts || 0) : (game?.player1?.attempts || 0);
                
                const mySolved = isPlayer1 ? (game?.player1?.solved || false) : (game?.player2?.solved || false);
                const opponentSolved = isPlayer1 ? (game?.player2?.solved || false) : (game?.player1?.solved || false);
                
                if (gameOverData?.tie) {
                  // Tie scenario
                  if (mySolved && opponentSolved) {
                    return `You both solved each other's words in ${myAttempts} attempts!`;
                  } else {
                    return `Neither player solved the word. It's a tie!`;
                  }
                } else if (gameOverData?.winnerId === currentUser?.uid) {
                  // You won
                  if (mySolved && opponentSolved) {
                    return `You solved ${opponentUsername}'s word in ${myAttempts} attempts. They solved yours in ${opponentAttempts} attempts.`;
                  } else if (mySolved && !opponentSolved) {
                    return `You solved ${opponentUsername}'s word in ${myAttempts} attempts. They didn't solve yours!`;
                  } else {
                    return `${opponentUsername} didn't solve your word, but you didn't solve theirs either!`;
                  }
                } else {
                  // You lost
                  if (mySolved && opponentSolved) {
                    return `You solved ${opponentUsername}'s word in ${myAttempts} attempts. They solved yours in ${opponentAttempts} attempts.`;
                  } else if (!mySolved && opponentSolved) {
                    return `${opponentUsername} solved your word in ${opponentAttempts} attempts. You didn't solve theirs.`;
                  } else {
                    return `You didn't solve ${opponentUsername}'s word.`;
                  }
                }
              })()}
            </Text>
              <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={async () => {
                try {
                  // Close popup first
                  setShowGameOverPopup(false);
                  
                  // Only mark results as seen if coming from ResumeGamesScreen (first solver)
                  // Second solver is already marked when popup is shown
                  if (showResults && game?.id && currentUser?.uid) {
                    await updateDoc(doc(db, 'games', game.id), {
                      resultsSeenBy: arrayUnion(currentUser.uid)
                    });
                  }
                  
                  // Navigate based on how we got here
                  if (showResults) {
                    // Came from ResumeGamesScreen - go back to where we came from
                    navigation.goBack();
                  } else {
                    // Came from normal game completion - go to MainTabs
                    navigation.navigate('MainTabs');
                  }
                  playSound('chime').catch(() => {});
                  
                } catch (markErr) {
                  console.error('PvPGameScreen: Failed to handle results popup acknowledge:', markErr);
                  // Still close popup and navigate even if marking fails
                  setShowGameOverPopup(false);
                  if (showResults) {
                    navigation.goBack();
                  } else {
                    navigation.navigate('MainTabs');
                  }
                  playSound('chime').catch(() => {});
                }
              }}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      
      {/* Max Guesses Popup */}
      <Modal visible={showMaxGuessesPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.maxGuessesPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.maxGuessesTitle, { color: colors.textPrimary }]}>Max Guesses Reached!</Text>
            <Text style={[styles.maxGuessesMessage, { color: colors.textSecondary }]}> 
                             You've reached the maximum of {getMaxGuesses()} guesses. Waiting for {opponentUsername} to finish.
            </Text>
            <TouchableOpacity
              style={styles.maxGuessesButtonContainer}
              onPress={async () => {
                try {
                  setShowMaxGuessesPopup(false);
                  if (game?.id && currentUser?.uid) {
                    await updateDoc(doc(db, 'games', game.id), {
                      resultsSeenBy: arrayUnion(currentUser.uid)
                    });
                  }
                  
                  // Show ad and wait for completion before navigating
                  await adService.showInterstitialAd().catch(() => {});
                  
                  // Navigate after ad completes
                  navigation.navigate('MainTabs');
                  playSound('chime').catch(() => {});
                } catch (markErr) {
                  console.error('PvPGameScreen: Failed to mark results seen on max guesses:', markErr);
                  navigation.navigate('MainTabs');
                  playSound('chime').catch(() => {});
                }
              }}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      {/* Quit Confirmation Modal */}
      <Modal visible={showQuitConfirmPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.header, { color: colors.textPrimary }]}>Quit Game?</Text>
            <Text style={[styles.modalText, { color: colors.textSecondary }]}> 
              Are you sure you want to quit this game? This will count as a forfeit and {opponentUsername} will win.
            </Text>
            <View style={styles.modalActionsVertical}>
              <TouchableOpacity
                style={[styles.button, styles.deleteButton]}
                onPress={handleQuitGame}
              >
                <Text style={styles.buttonText}>Quit Game</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={() => setShowQuitConfirmPopup(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default PvPGameScreen;


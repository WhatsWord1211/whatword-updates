import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Dimensions, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, auth } from './firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, increment, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import { getFeedback, isValidWord } from './gameLogic';
import styles from './styles';
import gameService from './gameService';
import playerProfileService from './playerProfileService';

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
  const { gameId } = route.params;
  
  const [game, setGame] = useState(null);
  const [inputWord, setInputWord] = useState('');
  const [guesses, setGuesses] = useState([]);
  const [alphabet, setAlphabet] = useState(Array(26).fill('unknown'));
  const [showInvalidPopup, setShowInvalidPopup] = useState(false);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [showLosePopup, setShowLosePopup] = useState(false);
  const [showTiePopup, setShowTiePopup] = useState(false);
  const [showCongratulationsPopup, setShowCongratulationsPopup] = useState(false);
  const [showGameOverPopup, setShowGameOverPopup] = useState(false);
  const [gameOverData, setGameOverData] = useState(null);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  const [showMaxGuessesPopup, setShowMaxGuessesPopup] = useState(false);
  const [showQuitConfirmPopup, setShowQuitConfirmPopup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const scrollViewRef = useRef(null);
  
  // Adjustable padding variables
  const inputToKeyboardPadding = 20;
  const keyboardToButtonsPadding = 5;
  
  // Calculate max width for keyboard based on screen size
  const windowWidth = Dimensions.get('window').width;
  const maxKeyboardWidth = windowWidth - 40;
  
  // QWERTY keyboard layout
  const qwertyKeys = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];
  
  const getMaxGuesses = () => (game && game.maxAttempts) ? game.maxAttempts : 25;

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
      const currentPlayerData = getMyPlayerData();
      const opponentPlayerData = getOpponentPlayerData(gameData);
      
      // Safety checks for player data
      if (!currentPlayerData || !opponentPlayerData) {
        console.error('determineGameResult: Missing player data', { currentPlayerData, opponentPlayerData });
        return;
      }
      
      let winnerId = null;
      let tie = false;
      
      if (currentPlayerData.solved && opponentPlayerData.solved) {
        // Both solved - determine winner by attempts
        if (currentPlayerData.attempts < opponentPlayerData.attempts) {
          winnerId = currentUserId;
        } else if (opponentPlayerData.attempts < currentPlayerData.attempts) {
          winnerId = opponentPlayerData.uid;
        } else {
          tie = true;
        }
      } else if (currentPlayerData.solved && !opponentPlayerData.solved) {
        // Only current player solved
        winnerId = currentUserId;
      } else if (!currentPlayerData.solved && opponentPlayerData.solved) {
        // Only opponent solved
        winnerId = opponentPlayerData.uid;
      } else {
        // Neither solved - tie
        tie = true;
      }
      
      // Update game status
      await updateDoc(doc(db, 'games', gameId), {
        status: 'completed',
        completedAt: new Date().toISOString(),
        winnerId: winnerId,
        tie: tie
      });
      
      // Update stats for both players
      await updateUserStats(currentUserId, winnerId === currentUserId);
      await updateUserStats(opponentPlayerData.uid, winnerId === opponentPlayerData.uid);
      
      // Update PvP rolling averages for both players
      const gameDifficulty = gameData.difficulty || 'regular';
      const currentUserWin = winnerId === currentUserId;
      const opponentWin = winnerId === opponentPlayerData.uid;
      
      try {
        await playerProfileService.updatePvpDifficultyRollingAverages(currentUserId, gameDifficulty, currentUserWin);
        await playerProfileService.updatePvpDifficultyRollingAverages(opponentPlayerData.uid, gameDifficulty, opponentWin);
      } catch (error) {
        console.error('PvPGameScreen: Failed to update PvP rolling averages:', error);
      }
      
      // Delete completed game and preserve statistics
      await deleteCompletedGame(gameId, { 
        ...gameData, 
        status: 'completed', 
        completedAt: new Date().toISOString(), 
        winnerId: winnerId, 
        tie: tie 
      });
      
      // Show game over popup with result
      setGameOverData({ winnerId, tie, currentUserId });
      setShowGameOverPopup(true);
      
      // Play appropriate sound
      if (tie) {
        await playSound('tie').catch(() => {});
      } else if (winnerId === currentUserId) {
        await playSound('victory').catch(() => {});
      } else {
        await playSound('lose').catch(() => {});
      }
      
    } catch (error) {
      console.error('PvPGameScreen: Failed to determine game result:', error);
    }
  };

  const handleQuitGame = async () => {
    try {
      if (game && currentUser && game.id) {
        await gameService.forfeitGame(game.id);
        setShowQuitConfirmPopup(false);
        setShowMenuPopup(false);
        navigation.navigate('Home');
        playSound('chime').catch(() => {});
      }
    } catch (error) {
      console.error('Failed to quit game:', error);
      Alert.alert('Error', 'Failed to quit game. Please try again.');
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

  // Auto-scroll to bottom when guesses are updated
  useEffect(() => {
    if (guesses.length > 0 && scrollViewRef.current) {
      // Small delay to ensure the new guess is rendered
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [guesses]);

  // Auto-scroll to bottom when game is first loaded
  useEffect(() => {
    if (game && game.gameHistory && scrollViewRef.current) {
      const myGuesses = game.gameHistory.filter(entry => entry && entry.player === currentUser?.uid);
      if (myGuesses.length > 0) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: false });
        }, 500);
      }
    }
  }, [game, currentUser]);

  useEffect(() => {
    if (!gameId || !currentUser) return;

    // Listen to game updates
    const gameRef = doc(db, 'games', gameId);
    const unsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const gameData = { id: doc.id, ...doc.data() };
        
        // Game update received - keeping minimal logging for debugging
        
        // Validate game state - don't navigate away if we're showing game over popup
        if ((gameData.status === 'completed' || gameData.status === 'abandoned') && !showGameOverPopup) {
          // Only navigate away if we're not in the process of showing the game over popup
          if (gameData.status === 'completed') {
            // Game was completed by the other player, show game over popup
            const currentPlayerData = getMyPlayerData();
            const opponentPlayerData = getOpponentPlayerData(gameData);
            
            if (currentPlayerData && opponentPlayerData && gameData.winnerId !== undefined) {
              // Determine result for this player
              const isWinner = gameData.winnerId === currentUser.uid;
              const isTie = gameData.tie;
              
              setGameOverData({ 
                winnerId: gameData.winnerId, 
                tie: isTie, 
                currentUserId: currentUser.uid 
              });
              setShowGameOverPopup(true);
              
              // Auto-scroll to show the latest guess when game is over
              if (scrollViewRef.current && guesses.length > 0) {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }
              
              // Play appropriate sound
              if (isTie) {
                playSound('tie').catch(() => {});
              } else if (isWinner) {
                playSound('victory').catch(() => {});
              } else {
                playSound('lose').catch(() => {});
              }
            }
          } else {
            Alert.alert('Game Ended', 'This game has been abandoned. Please return to the Friends screen.');
            navigation.navigate('Friends');
          }
          return;
        }
        
        // Check if game is ready with new structure (player1/player2) or old structure (playerWord/opponentWord)
        const isGameReady = (gameData.player1?.word && gameData.player2?.word && gameData.player1?.uid && gameData.player2?.uid) || 
                           (gameData.playerWord && gameData.opponentWord && gameData.creatorId && currentUser && currentUser.uid);
        
        // Debug logging removed for cleaner logs
        
        // Check for timeouts
        const timeoutType = gameService.checkGameTimeouts(gameData);
        console.log('PvPGameScreen: Timeout check result:', timeoutType);
        
        if (timeoutType !== 'active') {
          console.log('PvPGameScreen: Game timeout detected:', timeoutType);
          // Handle timeout automatically
          gameService.handleGameTimeout(gameData.id, timeoutType).catch(error => {
            console.error('Failed to handle timeout:', error);
          });
          return;
        }
        
        // Only set game if it has valid structure
        if (gameData && ((gameData.player1 && gameData.player2 && gameData.player1.uid && gameData.player2.uid) || (gameData.playerWord && gameData.opponentWord && gameData.creatorId))) {
          setGame(gameData);
          
          // Check if game should be automatically completed (both players finished but status still 'active')
          if (gameData.status === 'active') {
            const currentPlayerData = getMyPlayerData();
            const opponentPlayerData = getOpponentPlayerData(gameData);
            
            if (currentPlayerData && opponentPlayerData) {
              const currentPlayerFinished = currentPlayerData.solved || (currentPlayerData.attempts && currentPlayerData.attempts >= getMaxGuesses());
              const opponentPlayerFinished = opponentPlayerData.solved || (opponentPlayerData.attempts && opponentPlayerData.attempts >= getMaxGuesses());
              
              console.log('PvPGameScreen: Checking game completion status:', {
                currentPlayerFinished,
                opponentPlayerFinished,
                currentPlayerData: { solved: currentPlayerData.solved, attempts: currentPlayerData.attempts },
                opponentPlayerData: { solved: opponentPlayerData.solved, attempts: opponentPlayerData.attempts },
                maxGuesses: getMaxGuesses()
              });
              
              if (currentPlayerFinished && opponentPlayerFinished) {
                console.log('PvPGameScreen: Auto-completing finished game');
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
             if (myGuesses.length > 0 && scrollViewRef.current) {
               setTimeout(() => {
                 scrollViewRef.current?.scrollToEnd({ animated: true });
               }, 300);
             }
           }
          

        }
      }
    });

    return unsubscribe;
  }, [gameId, currentUser]);

  const getMyPlayerData = () => {
    if (!game || !currentUser) return null;
    
    // Debug logging removed for cleaner logs
    
    // Handle new game structure (player1/player2)
    if (game.player1 && game.player2 && game.player1.uid && game.player2.uid) {
      const isPlayer1 = game.player1.uid === currentUser.uid;
      const myPlayer = isPlayer1 ? game.player1 : game.player2;
      
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
    if (game.creatorId && game.playerIds && Array.isArray(game.playerIds) && currentUser && currentUser.uid) {
      const isCreator = game.creatorId === currentUser.uid;
      const result = {
        uid: currentUser.uid,
        attempts: isCreator ? (game.playerGuesses?.length || 0) : (game.opponentGuesses?.length || 0),
        solved: isCreator ? game.playerSolved : game.opponentSolved,
        word: isCreator ? game.playerWord : game.opponentWord,
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
    
    console.log('getOpponentPlayerData: Game data structure:', {
      hasPlayer1: !!gameData.player1,
      hasPlayer2: !!gameData.player2,
      hasPlayerWord: !!gameData.playerWord,
      hasOpponentWord: !!gameData.opponentWord,
      currentUser: currentUser.uid,
      creatorId: gameData.creatorId,
      playerIds: gameData.playerIds
    });
    
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
    
    // Play toggle sound
    playSound('toggleLetter').catch(() => {});
    
    if (alphabet[index] === 'unknown') {
      setAlphabet(prev => {
        const newAlphabet = [...prev];
        newAlphabet[index] = 'absent';
        return newAlphabet;
      });
    } else if (alphabet[index] === 'absent') {
      setAlphabet(prev => {
        const newAlphabet = [...prev];
        newAlphabet[index] = 'present';
        return newAlphabet;
      });
    } else {
      setAlphabet(prev => {
        const newAlphabet = [...prev];
        newAlphabet[index] = 'unknown';
        return newAlphabet;
      });
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
         } else {
           updateData['player2.attempts'] = increment(1);
           updateData['player2.lastGuess'] = new Date().toISOString();
         }
       }

      // Add lastActivity update
      updateData.lastActivity = new Date().toISOString();
      
      try {
        await updateDoc(gameRef, updateData);
        
        setInputWord('');
        playSound('chime').catch(() => {});
        
        // Auto-scroll to show the latest guess
        if (scrollViewRef.current) {
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 200);
        }
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
               // Player solved the word - show congratulations popup
               setShowCongratulationsPopup(true);
               await playSound('congratulations').catch(() => {});
               
               // Auto-scroll to show the latest guess when player solves the word
               if (scrollViewRef.current && guesses.length > 0) {
                 setTimeout(() => {
                   scrollViewRef.current?.scrollToEnd({ animated: true });
                 }, 100);
               }
               
                              // Mark current player as solved
               const currentPlayerData = getMyPlayerData();
               await updateDoc(gameRef, {
                 [`${currentPlayerData.field}.solved`]: true,
                 [`${currentPlayerData.field}.attempts`]: guesses.length + 1,
                 [`${currentPlayerData.field}.solveTime`]: new Date().toISOString()
               });
               
               // Update game status to waiting_for_opponent if opponent hasn't solved yet
               const currentOpponentData = getOpponentPlayerData(game);
               if (currentOpponentData && !currentOpponentData.solved) {
                 await updateDoc(gameRef, {
                   status: 'waiting_for_opponent',
                   waitingForPlayer: currentOpponentData.uid,
                   lastUpdated: new Date().toISOString()
                 });
               }
               
               // Get fresh game data to check opponent status
               const freshGameDoc = await getDoc(gameRef);
               const freshGameData = freshGameDoc.data();
               
               // Check if both players have finished (both solved or both reached max attempts)
               const opponentPlayerData = getOpponentPlayerData(freshGameData);
               
               if (opponentPlayerData?.solved || opponentPlayerData?.attempts >= getMaxGuesses()) {
                 // Game is over - determine final result
                 await determineGameResult(freshGameData, currentUser.uid);
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
                 if (scrollViewRef.current && guesses.length > 0) {
                   setTimeout(() => {
                     scrollViewRef.current?.scrollToEnd({ animated: true });
                   }, 100);
                 }
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
      console.log('deleteCompletedGame: Called with gameId:', gameId, 'gameData:', gameData);
      
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
      
      console.log('deleteCompletedGame: Created gameStats:', gameStats);
      
      // Save statistics to a separate collection for leaderboard purposes
      const statsRef = doc(db, 'gameStats', gameId);
      await setDoc(statsRef, gameStats);
      console.log('deleteCompletedGame: Successfully saved to gameStats collection');
      
      // Delete the actual game document
      await deleteDoc(doc(db, 'games', gameId));
      console.log('deleteCompletedGame: Successfully deleted game document');
      
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

    if (isGameOver) {
      let message = '';
      let isWinner = false;
      
      if (game.tie) {
        message = "It's a tie! Both players reached the same number of attempts.";
      } else if (game.winnerId === currentUser.uid) {
        message = `Congratulations! You won the game!`;
        isWinner = true;
      } else {
        message = `Game over! Your opponent won.`;
      }

      return (
        <View style={styles.gameOverContainer}>
          <Text style={styles.gameOverText}>{message}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.buttonText}>Return to Home</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Check if current player has already solved their opponent's word
    if (myPlayerData?.solved) {
      // Auto-scroll to show the latest guess when player solves the word
      if (scrollViewRef.current && guesses.length > 0) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
      
      // Check if opponent has also solved (game is complete)
      const opponentData = getOpponentPlayerData(game);
      if (opponentData?.solved) {
        // Both players solved - show game completion message
        return (
          <View style={styles.gameStatusContainer}>
            <Text style={[styles.attemptsText, { color: '#10B981', fontWeight: 'bold' }]}>
              🎉 Both players solved! Game complete!
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.navigate('Home')}
            >
              <Text style={styles.buttonText}>Return to Home</Text>
            </TouchableOpacity>
          </View>
        );
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
      <Text style={styles.soloheader}>Guess {opponentUsername}'s Word</Text>
      

      
      <View style={styles.inputDisplay}>
        {[...Array(game.wordLength)].map((_, idx) => (
          <Text
            key={`input-${idx}`}
            style={[styles.inputLetter, inputWord[idx] ? styles.filledLetter : styles.emptyLetter]}
          >
            {inputWord[idx] || ''}
          </Text>
        ))}
      </View>
      
      <View style={styles.alphabetContainer}>
        <View style={styles.alphabetGrid}>
          {qwertyKeys.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: 5 }}>
              {row.map((letter) => {
                const index = letter.charCodeAt(0) - 65;
                return (
                  <TouchableOpacity
                    key={letter}
                    onPress={() => handleLetterInput(letter)}
                    onLongPress={() => toggleLetter(index)}
                    delayLongPress={300}
                    disabled={isLoading || !canGuess()}
                  >
                    <Text
                      style={[
                        styles.letter,
                        alphabet[index] === 'absent' && styles.eliminatedLetter,
                        alphabet[index] === 'present' && styles.presentLetter
                      ]}
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
          <View style={styles.feedbackCircle} />
          <Text style={styles.feedbackText}>Correct Letter</Text>
        </View>
        <View style={styles.feedbackItem}>
          <View style={styles.feedbackDot} />
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
          <View key={`guess-${idx}`} style={styles.guessRow}>
            <View style={styles.guessWord}>
              {g.word.split('').map((letter, i) => (
                <Text
                  key={`letter-${idx}-${i}`}
                  style={[styles.guessLetter, { fontSize: 24 }]}
                >
                  {letter}
                </Text>
              ))}
            </View>
                         <View style={styles.feedbackContainer}>
               {[...Array(isNaN(g.circles) ? 0 : g.circles || 0)].map((_, i) => (
                <View
                  key={`circle-${idx}-${i}`}
                  style={styles.feedbackCircle}
                />
              ))}
              {[...Array(isNaN(g.dots) ? 0 : g.dots || 0)].map((_, i) => (
                <View
                  key={`dot-${idx}-${i}`}
                  style={styles.feedbackDot}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      
      {/* FAB */}
      <TouchableOpacity 
        style={styles.fabTop} 
        onPress={() => setShowMenuPopup(true)}
      >
        <Text style={styles.fabText}>☰</Text>
      </TouchableOpacity>
      
      {/* Menu Popup Modal */}
      <Modal visible={showMenuPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow]}>
            <Text style={styles.header}>Game Menu</Text>
            
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                setShowMenuPopup(false);
                navigation.navigate('Home');
              }}
            >
              <Text style={styles.buttonText}>Return to Home</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={() => {
                setShowMenuPopup(false);
                setShowQuitConfirmPopup(true);
              }}
            >
              <Text style={styles.buttonText}>Quit Game</Text>
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
          <View style={[styles.invalidGuessPopup, styles.modalShadow]}>
            <Text style={styles.invalidGuessTitle}>Invalid Guess!</Text>
            <Text style={styles.invalidGuessMessage}>
              Please enter a valid {game.wordLength}-letter word.
            </Text>
            <TouchableOpacity
              style={styles.invalidGuessButtonContainer}
              onPress={() => setShowInvalidPopup(false)}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
             {/* Congratulations Popup - Individual Word Solved */}
      <Modal visible={showCongratulationsPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow]}>
            <Text style={styles.winTitle}>Congratulations!</Text>
            <Text style={styles.winMessage}>
              You solved the word in {guesses.length} guesses!
            </Text>
            <Text style={styles.waitingMessage}>
              You've completed your part of the game! Your opponent is still playing.
            </Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={() => {
                setShowCongratulationsPopup(false);
                navigation.navigate('Home');
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>Return to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Game Over Popup - Final Result */}
      <Modal visible={showGameOverPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow]}>
            <Text style={styles.winTitle}>
              {gameOverData?.tie ? "It's a Tie!" : 
               gameOverData?.winnerId === currentUser?.uid ? "You Won!" : "You Lost!"}
            </Text>
            <Text style={styles.winMessage}>
              {gameOverData?.tie ? 
                "Both players solved their words in the same number of attempts!" :
                gameOverData?.winnerId === currentUser?.uid ?
                `Congratulations! You solved ${opponentUsername}'s word faster!` :
                `${opponentUsername} solved your word faster. Better luck next time!`}
            </Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={() => {
                setShowGameOverPopup(false);
                navigation.navigate('Home');
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>Main Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Old Win Popup - Keeping for compatibility but not used in new flow */}
      <Modal visible={showWinPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow]}>
            <Text style={styles.winTitle}>Congratulations!</Text>
            <Text style={styles.winMessage}>
              You solved the word in {guesses.length} guesses!
            </Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={() => {
                setShowWinPopup(false);
                navigation.navigate('Home');
                playSound('chime').catch(() => {});
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
          <View style={[styles.maxGuessesPopup, styles.modalShadow]}>
            <Text style={styles.maxGuessesTitle}>Max Guesses Reached!</Text>
            <Text style={styles.maxGuessesMessage}>
                             You've reached the maximum of {getMaxGuesses()} guesses. Waiting for {opponentUsername} to finish.
            </Text>
            <TouchableOpacity
              style={styles.maxGuessesButtonContainer}
              onPress={() => {
                setShowMaxGuessesPopup(false);
                navigation.navigate('Home');
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>Return to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Tie Popup */}
      <Modal visible={showTiePopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.tiePopup, styles.modalShadow]}>
            <Text style={styles.tieTitle}>It's a Tie!</Text>
            <Text style={styles.tieMessage}>
              Both players reached the maximum attempts without solving. The game ends in a tie!
            </Text>
            <TouchableOpacity
              style={styles.tieButtonContainer}
              onPress={() => {
                setShowTiePopup(false);
                navigation.navigate('Home');
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>Main Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Quit Confirmation Modal */}
      <Modal visible={showQuitConfirmPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow]}>
            <Text style={styles.header}>Quit Game?</Text>
            <Text style={styles.modalText}>
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


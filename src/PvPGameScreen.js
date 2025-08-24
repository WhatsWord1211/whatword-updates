import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Dimensions, Alert, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, auth } from './firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, increment, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import { getFeedback, isValidWord } from './gameLogic';
import styles from './styles';
import gameService from './gameService';

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
  
  const getMaxGuesses = () => game?.maxAttempts || 25;

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
      if (game && currentUser) {
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

  // Immersive mode effect
  useEffect(() => {
    // Hide status bar for immersive gaming experience
    StatusBar.setHidden(true);
    
    // Return function to restore status bar when leaving screen
    return () => {
      StatusBar.setHidden(false);
    };
  }, []);

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
            
            if (currentPlayerData && opponentPlayerData) {
              // Determine result for this player
              const isWinner = gameData.winnerId === currentUser.uid;
              const isTie = gameData.tie;
              
              setGameOverData({ 
                winnerId: gameData.winnerId, 
                tie: isTie, 
                currentUserId: currentUser.uid 
              });
              setShowGameOverPopup(true);
              
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
        const isGameReady = (gameData.player1?.word && gameData.player2?.word) || 
                           (gameData.playerWord && gameData.opponentWord);
        
        // Debug: Log game data structure to understand what we're working with
        console.log('PvPGameScreen: Game data structure:', {
          gameId: gameData.id,
          status: gameData.status,
          players: gameData.players,
          player1: gameData.player1,
          player2: gameData.player2,
          playerWord: gameData.playerWord,
          opponentWord: gameData.opponentWord,
          currentUser: currentUser?.uid
        });
        
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
        
        setGame(gameData);

        
                 // Update guesses from game history
         if (gameData.gameHistory) {

           const myGuesses = gameData.gameHistory
             .filter(entry => entry.player === currentUser.uid)
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
                 word: entry.guess,
                 circles: circles,
                 dots: dots,
                 isCorrect: entry.isCorrect
               };
             });

           setGuesses(myGuesses);
          

        }
      }
    });

    return unsubscribe;
  }, [gameId, currentUser]);

  const getMyPlayerData = () => {
    if (!game || !currentUser) return null;
    
    console.log('getMyPlayerData: Current game structure:', {
      hasPlayer1: !!game.player1,
      hasPlayer2: !!game.player2,
      hasPlayerWord: !!game.playerWord,
      hasOpponentWord: !!game.opponentWord,
      currentUser: currentUser.uid,
      creatorId: game.creatorId
    });
    
    // Handle new game structure (player1/player2)
    if (game.player1 && game.player2) {
      const isPlayer1 = game.player1.uid === currentUser.uid;
      const myPlayer = isPlayer1 ? game.player1 : game.player2;
      const result = {
        uid: currentUser.uid,
        attempts: myPlayer.attempts || 0,
        solved: myPlayer.solved || false,
        word: myPlayer.word,
        field: isPlayer1 ? 'player1' : 'player2'
      };
      console.log('getMyPlayerData: New structure result:', result);
      return result;
    }
    
    // Handle old game structure (playerWord/opponentWord)
    const isCreator = game.creatorId === currentUser.uid;
    const result = {
      uid: currentUser.uid,
      attempts: isCreator ? (game.playerGuesses?.length || 0) : (game.opponentGuesses?.length || 0),
      solved: isCreator ? game.playerSolved : game.opponentSolved,
      word: isCreator ? game.playerWord : game.opponentWord,
      field: isCreator ? 'player1' : 'player2' // Fallback for old structure
    };
    console.log('getMyPlayerData: Old structure result:', result);
    return result;
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
    if (gameData.player1 && gameData.player2) {
      const isPlayer1 = gameData.player1.uid === currentUser.uid;
      const opponentPlayer = isPlayer1 ? gameData.player2 : gameData.player1;
      const result = {
        uid: opponentPlayer.uid,
        attempts: opponentPlayer.attempts || 0,
        solved: opponentPlayer.solved || false,
        word: opponentPlayer.word
      };
      console.log('getOpponentPlayerData: New structure result:', result);
      return result;
    }
    
    // Handle old game structure (playerWord/opponentWord)
    const isCreator = gameData.creatorId === currentUser.uid;
    const result = {
      uid: isCreator ? gameData.playerIds.find(id => id !== currentUser.uid) : gameData.creatorId,
      attempts: isCreator ? (gameData.opponentGuesses?.length || 0) : (gameData.playerGuesses?.length || 0),
      solved: isCreator ? gameData.opponentSolved : gameData.playerSolved,
      word: isCreator ? gameData.opponentWord : gameData.playerWord
    };
    console.log('getOpponentPlayerData: Old structure result:', result);
    return result;
  };

  const getOpponentWord = () => {
    if (!game || !currentUser) return null;
    
    // Handle new game structure (player1/player2)
    if (game.player1 && game.player2) {
      const isPlayer1 = game.player1.uid === currentUser.uid;
      return isPlayer1 ? game.player2.word : game.player1.word;
    }
    
    // Handle old game structure (playerWord/opponentWord)
    const isCreator = game.creatorId === currentUser.uid;
    return isCreator ? game.opponentWord : game.playerWord;
  };

  const canGuess = () => {
    if (!game || !currentUser) return false;
    const myPlayerData = getMyPlayerData();
    return !myPlayerData.solved && guesses.length < getMaxGuesses();
  };

  const handleLetterInput = (letter) => {
    if (inputWord.length < game.wordLength && canGuess()) {
      setInputWord(prev => prev + letter);
      playSound('letterInput').catch(() => {});
    }
  };

  const handleBackspace = () => {
    if (inputWord.length > 0) {
      setInputWord(prev => prev.slice(0, -1));
      playSound('backspace').catch(() => {});
    }
  };

  const toggleLetter = (index) => {
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
      const isGameReady = (game.player1?.word && game.player2?.word) || 
                         (game.playerWord && game.opponentWord);
      
      if (!isGameReady) {
        Alert.alert('Game Not Ready', 'This game is not properly set up. Please wait for both players to set their words.');
        return;
      }

      if (game.status !== 'active') {
        Alert.alert('Game Not Active', 'This game is not currently active. Please check the game status.');
        return;
      }

      if (!inputWord || inputWord.length !== game.wordLength) {
        Alert.alert('Invalid Guess', `Please enter a ${game.wordLength}-letter word.`);
        return;
      }

    // Validate word against the appropriate word list
    const isValid = await isValidWord(inputWord.toLowerCase(), game.wordLength);
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

             // Update player's solved status
       const isCreator = game.creatorId === currentUser.uid;
       if (isCorrect) {
         if (isCreator) {
           updateData['playerSolved'] = true;
         } else {
           updateData['opponentSolved'] = true;
         }
       }
       
       // Update player's solved status for new structure (player1/player2)
       if (game.player1 && game.player2) {
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
               
                              // Mark current player as solved
               const currentPlayerData = getMyPlayerData();
               await updateDoc(gameRef, {
                 [`${currentPlayerData.field}.solved`]: true,
                 [`${currentPlayerData.field}.attempts`]: guesses.length + 1,
                 [`${currentPlayerData.field}.solveTime`]: new Date().toISOString()
               });
               
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
      // Extract only the statistics needed for leaderboard
      const gameStats = {
        gameId: gameId,
        players: gameData.players,
        completedAt: gameData.completedAt,
        winnerId: gameData.winnerId,
        tie: gameData.tie,
        type: 'pvp',
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
      await updateDoc(statsRef, gameStats);
      
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

    // Only show status container if there's a message to display
    if (myPlayerData?.solved) {
      return (
        <View style={styles.gameStatusContainer}>
          <Text style={[styles.attemptsText, { color: '#10B981', fontWeight: 'bold' }]}>
            ✅ You solved it in {myPlayerData.attempts} attempts!
          </Text>
        </View>
      );
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
  const opponentUsername = opponentData?.uid ? 
    (game.players?.find(p => p.uid === opponentData.uid)?.username || 'Opponent') : 
    'Opponent';

  return (
    <SafeAreaView style={styles.immersiveGameContainer}>
      <Text style={styles.soloheader}>Guess {opponentUsername}'s Word</Text>
      
      {/* Debug Info - Remove this after fixing the issue */}
      {__DEV__ && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>Game ID: {game.id}</Text>
          <Text style={styles.debugText}>Status: {game.status}</Text>
          <Text style={styles.debugText}>Players: {game.players?.join(', ') || 'None'}</Text>
          <Text style={styles.debugText}>My Word: {getMyPlayerData()?.word || 'Not set'}</Text>
          <Text style={styles.debugText}>Opponent Word: {getOpponentPlayerData(game)?.word || 'Not set'}</Text>
        </View>
      )}
      
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
            <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: 0 }}>
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
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 0, minHeight: 300 }}
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
              Waiting for your opponent to finish...
            </Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={() => {
                setShowCongratulationsPopup(false);
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>OK</Text>
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
                "Congratulations! You solved your opponent's word faster!" :
                "Your opponent solved your word faster. Better luck next time!"}
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
                             You've reached the maximum of {getMaxGuesses()} guesses. Waiting for opponent to finish.
            </Text>
            <TouchableOpacity
              style={styles.maxGuessesButtonContainer}
              onPress={() => {
                setShowMaxGuessesPopup(false);
                navigation.navigate('Home');
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>Main Menu</Text>
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
              Are you sure you want to quit this game? This will count as a forfeit and your opponent will win.
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

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Dimensions, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, auth } from './firebase';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
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

  useEffect(() => {
    if (!gameId || !currentUser) return;

    // Listen to game updates
    const gameRef = doc(db, 'games', gameId);
    const unsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const gameData = { id: doc.id, ...doc.data() };
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
    const isCreator = game.creatorId === currentUser.uid;
    return {
      uid: currentUser.uid,
      attempts: isCreator ? (game.playerGuesses?.length || 0) : (game.opponentGuesses?.length || 0),
      solved: isCreator ? game.playerSolved : game.opponentSolved,
      word: isCreator ? game.playerWord : game.opponentWord
    };
  };

  const getOpponentPlayerData = (gameData) => {
    if (!gameData || !currentUser) return null;
    const isCreator = gameData.creatorId === currentUser.uid;
    return {
      uid: isCreator ? gameData.playerIds.find(id => id !== currentUser.uid) : gameData.creatorId,
      attempts: isCreator ? (gameData.opponentGuesses?.length || 0) : (gameData.playerGuesses?.length || 0),
      solved: isCreator ? gameData.opponentSolved : gameData.playerSolved,
      word: isCreator ? gameData.opponentWord : gameData.playerWord
    };
  };

  const getOpponentWord = () => {
    if (!game || !currentUser) return null;
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
      
      console.log('🔍 Generated feedback data:', feedbackData);
      
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

      await updateDoc(gameRef, updateData);
      
      setInputWord('');
      playSound('chime').catch(() => {});
      
             if (isCorrect) {
         // Player solved the word - show congratulations
         setShowWinPopup(true);
         
                   // Check if game is over (both solved or both reached max attempts)
          const opponentPlayerData = getOpponentPlayerData(game);
          if (opponentPlayerData.solved || opponentPlayerData.attempts >= getMaxGuesses()) {
           // Game is over - determine final result
           if (opponentPlayerData.solved) {
             // Both solved - determine winner by attempts
             const myAttempts = guesses.length + 1;
             const opponentAttempts = opponentPlayerData.attempts;
             
             if (myAttempts < opponentAttempts) {
               // Current player won
               await updateDoc(gameRef, {
                 status: 'completed',
                 completedAt: new Date().toISOString(),
                 winnerId: currentUser.uid,
                 tie: false
               });
             } else if (myAttempts > opponentAttempts) {
               // Current player lost
               await updateDoc(gameRef, {
                 status: 'completed',
                 completedAt: new Date().toISOString(),
                 winnerId: opponentPlayerData.uid,
                 tie: false
               });
             } else {
               // Tie
               await updateDoc(gameRef, {
                 status: 'completed',
                 completedAt: new Date().toISOString(),
                 winnerId: null,
                 tie: true
               });
             }
           } else {
             // Only current player solved, opponent reached max attempts
             await updateDoc(gameRef, {
               status: 'completed',
               completedAt: new Date().toISOString(),
               winnerId: currentUser.uid,
               tie: false
             });
           }
         }
         // If game not over, player waits for opponent to finish
               } else if (guesses.length + 1 >= getMaxGuesses()) {
          // Reached max attempts without solving
          const opponentPlayerData = getOpponentPlayerData(game);
          if (opponentPlayerData.solved) {
            // Opponent solved, current player reached max attempts
            await updateDoc(gameRef, {
              status: 'completed',
              completedAt: new Date().toISOString(),
              winnerId: opponentPlayerData.uid,
              tie: false
            });
          } else if (opponentPlayerData.attempts >= getMaxGuesses()) {
           // Both reached max attempts without solving
           await updateDoc(gameRef, {
             status: 'completed',
             completedAt: new Date().toISOString(),
             tie: true,
             winnerId: null
           });
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

  return (
    <SafeAreaView style={styles.screenContainer}>
      <Text style={styles.soloheader}>Guess Their Word</Text>
      
      <View style={[styles.inputDisplay, { marginBottom: inputToKeyboardPadding }]}>
        {[...Array(game.wordLength)].map((_, idx) => (
          <Text
            key={`input-${idx}`}
            style={[styles.inputLetter, inputWord[idx] ? styles.filledLetter : styles.emptyLetter]}
          >
            {inputWord[idx] || ''}
          </Text>
        ))}
      </View>
      
      <View style={[styles.alphabetContainer, { marginBottom: keyboardToButtonsPadding }]}>
        <View style={[styles.alphabetGrid, { maxWidth: maxKeyboardWidth }]}>
          {qwertyKeys.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignSelf: 'center', marginBottom: 5 }}>
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
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
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
      
             {/* Congratulations Popup */}
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
            <View style={styles.modalActions}>
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

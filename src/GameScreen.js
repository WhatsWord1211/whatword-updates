import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Dimensions, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from './firebase'; // Added auth import
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { isValidWord, getFeedback, selectRandomWord } from './gameLogic';
import styles from './styles';
import { loadSounds, playSound } from './soundsUtil';
import { Audio } from 'expo-av';
import playerProfileService from './playerProfileService';

// Placeholder function for showing an ad
const showAd = async () => {
  try {
    console.log('GameScreen: Displaying ad for hint');
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  } catch (error) {
    console.error('GameScreen: Failed to display ad for hint', error);
    return false;
  }
};

const GameScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { showDifficulty, gameMode, wordLength, soloWord, gameId: initialGameId, playerId, isCreator, guesses: savedGuesses, inputWord: savedInputWord, alphabet: savedAlphabet, targetWord: savedTargetWord, gameState: savedGameState, hintCount: savedHintCount } = route.params || {};



  const [difficulty, setDifficulty] = useState(null);
  const [inputWord, setInputWord] = useState(savedInputWord || '');
  const [guesses, setGuesses] = useState(savedGuesses || []);
  const [targetWord, setTargetWord] = useState(savedTargetWord || '');
  const [gameState, setGameState] = useState(savedGameState || (showDifficulty ? 'selectDifficulty' : gameMode === 'pvp' ? 'selectDifficulty' : 'playing'));

  
  // Debug logging for game state changes
  useEffect(() => {
    console.log('GameScreen: Game state changed', { gameState, gameMode, showDifficulty, isCreator });
  }, [gameState, gameMode, showDifficulty, isCreator]);

  // Debug logging for component mount and params
  useEffect(() => {
    console.log('GameScreen: Component mounted with params', { 
      gameMode, 
      gameId: initialGameId, 
      showDifficulty, 
      isCreator, 
      gameState: savedGameState,
      wordLength 
    });
  }, []);

  const [alphabet, setAlphabet] = useState(savedAlphabet || Array(26).fill('unknown'));
  const [hintCount, setHintCount] = useState(savedHintCount || 0);
  const [usedHintLetters, setUsedHintLetters] = useState([]);
  const [showInvalidPopup, setShowInvalidPopup] = useState(false);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [showLosePopup, setShowLosePopup] = useState(false);
  const [showTiePopup, setShowTiePopup] = useState(false);
  const [showCongratsPopup, setShowCongratsPopup] = useState(false);
  const [showStartGamePopup, setShowStartGamePopup] = useState(false);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  const [showQuitConfirmPopup, setShowQuitConfirmPopup] = useState(false);
  const [showWordRevealPopup, setShowWordRevealPopup] = useState(false);
  const [showHintPopup, setShowHintPopup] = useState(false);
  const [showHintLimitPopup, setShowHintLimitPopup] = useState(false);
  const [showOpponentSolvedPopup, setShowOpponentSolvedPopup] = useState(false);
  const [hasShownOpponentSolved, setHasShownOpponentSolved] = useState(false);
  const [showMaxGuessesPopup, setShowMaxGuessesPopup] = useState(false);
  const [opponentGuessCountOnSolve, setOpponentGuessCountOnSolve] = useState(null);
  const [hintLetter, setHintLetter] = useState('');
  const [opponentGuesses, setOpponentGuesses] = useState([]);
  const [opponentWord, setOpponentWord] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [soundsLoaded, setSoundsLoaded] = useState(false);
  const [gameId, setGameId] = useState(initialGameId || `solo_${Date.now()}`);
  const [hardModeUnlocked, setHardModeUnlocked] = useState(false);
  const scrollViewRef = useRef(null);
  const soundsInitialized = useRef(false);

  // Check hard mode unlock status when component mounts
  useEffect(() => {
    const checkUnlockStatus = async () => {
      if (gameState === 'selectDifficulty') {
        const isUnlocked = await checkHardModeUnlocked();
        setHardModeUnlocked(isUnlocked);
      }
    };
    
    checkUnlockStatus();
  }, [gameState]);

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

  const MAX_GUESSES = 25;

  // Check if hard mode is unlocked
  const checkHardModeUnlocked = async () => {
    try {
      if (!auth.currentUser) return false;
      
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (!userDoc.exists()) return false;
      
      const userData = userDoc.data();
      
      // Check if user is premium
      if (userData.isPremium) return true;
      
      // Check if user has reached Word Expert rank
      const easyAvg = userData.easyAverageScore || 0;
      const regularAvg = userData.regularAverageScore || 0;
      const hardAvg = userData.hardAverageScore || 0;
      
      // Check if player has played any games
      if (easyAvg === 0 && regularAvg === 0 && hardAvg === 0) {
        return false;
      }
      
      // Check if user has reached Word Expert rank (Regular mode average ≤ 8)
      if (regularAvg > 0 && regularAvg <= 8) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to check hard mode unlock status:', error);
      return false;
    }
  };

  const handleHint = useCallback(async () => {
    console.log('GameScreen: handleHint called', { hintCount });
    if (hintCount >= 3) {
      setShowHintLimitPopup(true);
      await playSound('invalidWord').catch(() => {});
      setTimeout(() => setShowHintLimitPopup(false), 2000);
      return;
    }

    try {
      const adWatched = await showAd();
      if (!adWatched) return;
      await playSound('hint').catch(() => {});

      // Get letter frequencies in target word
      const letterFrequencies = {};
      targetWord.split('').forEach(letter => {
        letterFrequencies[letter] = (letterFrequencies[letter] || 0) + 1;
      });

      // Get available letters (those not used up to their frequency)
      const availableLetters = targetWord.split('').filter(letter => {
        const usedCount = usedHintLetters.filter(l => l === letter).length;
        return usedCount < letterFrequencies[letter];
      });

      if (availableLetters.length === 0) {
        console.log('GameScreen: No available hint letters remaining');
        setShowHintLimitPopup(true);
        await playSound('invalidWord').catch(() => {});
        setTimeout(() => setShowHintLimitPopup(false), 2000);
        return;
      }

      // Select a random letter from available letters
      const hintLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
      const letterIndex = hintLetter.charCodeAt(0) - 65;
      if (letterIndex < 0 || letterIndex >= 26) {
        console.error('GameScreen: Invalid hintLetter index', { hintLetter });
        return;
      }

      // Update state
      setAlphabet((prev) => {
        const updated = [...prev];
        updated[letterIndex] = 'present';
        return updated;
      });
      setUsedHintLetters(prev => [...prev, hintLetter]);
      if (gameMode === 'solo') {
        setGuesses((prev) => [...prev, { word: 'HINT', isHint: true }]);
      }
      setHintLetter(hintLetter);
      setHintCount(prev => prev + 1);
      setShowHintPopup(true);
      setTimeout(() => setShowHintPopup(false), 2000);
    } catch (error) {
      console.error('GameScreen: Failed to process hint', error);
    }
  }, [hintCount, targetWord, gameMode, usedHintLetters]);

  useEffect(() => {
    const initializeAudio = async () => {
      if (soundsInitialized.current) return;
      try {
        console.log('GameScreen: Configuring audio session');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('GameScreen: Audio session configured');
        await loadSounds();
        await playSound('backspace', { volume: 0 }); // Pre-play backspace sound silently
        soundsInitialized.current = true;
        setSoundsLoaded(true);
      } catch (error) {
        console.error('GameScreen: Failed to initialize audio or load sounds', error);
        soundsInitialized.current = true;
        setSoundsLoaded(true);
      }
    };
    initializeAudio();

    if ((gameMode === 'solo' && savedTargetWord) || soloWord) {
      const upperWord = (savedTargetWord || soloWord).toUpperCase();
      console.log('GameScreen: Setting targetWord', { gameId, targetWord: upperWord });
      setTargetWord(upperWord);
    }
  }, [gameMode, savedTargetWord, soloWord, gameId]);

  // Initialize difficulty for solo games
  useEffect(() => {
    if (gameMode === 'solo' && !difficulty) {
      // Set default difficulty for solo games if none is set
      const defaultDifficulty = wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular';
      console.log('GameScreen: Setting default difficulty for solo game', { wordLength, defaultDifficulty });
      setDifficulty(defaultDifficulty);
    }
  }, [gameMode, difficulty, wordLength]);

  // Firebase subscription effect
  useEffect(() => {
    // Early return if not PvP or no gameId
    if (gameMode !== 'pvp' || !gameId) {
      console.log('GameScreen: Skipping Firebase subscription - not PvP or no gameId', { gameMode, gameId });
      return;
    }

    // Early return if creator is still selecting difficulty
    if (isCreator && gameState === 'selectDifficulty') {
      console.log('GameScreen: Skipping Firebase subscription - creator waiting for difficulty selection', { gameId, gameState });
      return;
    }

    // For joining players, add a longer delay to ensure they're properly added to the game document
    const delay = isCreator ? 500 : 3000; // 3 seconds for joining players to ensure they're added

    console.log('GameScreen: Setting up Firebase listener with delay', { gameId, isCreator, gameState, delay });

    // Add a delay to ensure the document is created/accessible before setting up the listener
    const setupListener = (retryCount = 0) => {
      console.log('GameScreen: Setting up Firebase listener for gameId', { 
        gameId, 
        isCreator, 
        playerId, 
        gameState, 
        delay, 
        retryCount,
        currentUid: auth.currentUser?.uid,
        timestamp: new Date().toISOString()
      });
      const gameRef = doc(db, 'games', gameId);
      
      const unsubscribe = onSnapshot(gameRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          console.log('GameScreen: Snapshot received', { 
            gameId, 
            isCreator, 
            currentUid: auth.currentUser?.uid,
            data: { 
              playerWord: data.playerWord, 
              opponentWord: data.opponentWord, 
              status: data.status, 
              playerGuesses: data.playerGuesses?.length, 
              opponentGuesses: data.opponentGuesses?.length,
              players: data.players,
              playerId: data.playerId,
              opponentId: data.opponentId
            } 
          });
          
          // For joining players, verify they have access to this game
          if (!isCreator && data.players && !data.players.includes(auth.currentUser?.uid)) {
            console.log('GameScreen: Joining player not in players array yet', { 
              gameId, 
              currentUid: auth.currentUser?.uid, 
              players: data.players,
              playerId: data.playerId,
              opponentId: data.opponentId
            });
            // Wait a bit more for the player to be added
            return;
          }
          
          // Update opponent guesses
          setOpponentGuesses(isCreator ? data.opponentGuesses || [] : data.playerGuesses || []);
          // Check if game is ready and both players can start setting words
          if (data.status === 'ready' && gameState === 'setWord') {
            console.log('GameScreen: Game is ready, both players can set words', { status: data.status });
            // Game is ready, both players can now set their words
          }
          
          // Check if both words are set to start the game
          if (data.playerWord && data.opponentWord && gameState !== 'playing' && gameState !== 'gameOver' && gameState !== 'maxGuesses') {
            console.log('GameScreen: Both words set', { playerWord: data.playerWord, opponentWord: data.opponentWord });
            const target = isCreator ? data.opponentWord.toUpperCase() : data.playerWord.toUpperCase();
            setOpponentWord(target);
            setTargetWord(target);
            setGameState('playing');
            if (data.wordLength) navigation.setParams({ wordLength: data.wordLength });
            setShowStartGamePopup(true);
            playSound('startGame').catch(() => {});
            setTimeout(() => setShowStartGamePopup(false), 2000);
            setDoc(gameRef, { status: 'active' }, { merge: true }).catch(error => {
              console.error('GameScreen: Failed to update game status to active', error);
            });
          }
          // Set opponent guess count when they solve
          if (isCreator && data.opponentGuesses?.length > 0 && data.opponentGuesses.some(g => g.isCorrect) && opponentGuessCountOnSolve === null) {
            setOpponentGuessCountOnSolve(data.opponentGuesses.length);
          } else if (!isCreator && data.playerGuesses?.length > 0 && data.playerGuesses.some(g => g.isCorrect) && opponentGuessCountOnSolve === null) {
            setOpponentGuessCountOnSolve(data.playerGuesses.length);
          }
        } else {
          console.log('GameScreen: Game document does not exist', { gameId });
          // Don't show invalid word popup for missing game documents in PvP mode
          // This could mean the game is still being created by the first player
          if (gameMode === 'pvp' && isCreator) {
            // Creator is waiting for difficulty selection, this is normal
            console.log('GameScreen: Game document not yet created, waiting for difficulty selection');
          } else if (gameMode === 'pvp' && !isCreator) {
            // Second player trying to join a game that doesn't exist yet
            console.log('GameScreen: Game document not found for joining player, game may not be ready yet');
            // Don't show an alert immediately - this might be a timing issue
            // The document could be created shortly after
          } else {
            // Solo mode or other cases
            setShowInvalidPopup(true);
            setTimeout(() => setShowInvalidPopup(false), 2000);
          }
        }
      }, (error) => {
        console.error('GameScreen: Firebase snapshot error', error);
        if (gameMode === 'pvp') {
          // Only show connection error if it's not a permission issue
          if (error.code === 'permission-denied') {
            console.log('GameScreen: Permission denied - this is expected for joining players until they are added to the game', {
              gameId,
              isCreator,
              currentUid: auth.currentUser?.uid,
              retryCount,
              error: error.message
            });
            // For joining players, show a more helpful message and retry after a delay
            if (!isCreator && retryCount < 5) { // Increased retry count
              console.log('GameScreen: Permission denied for joining player, retrying...', { 
                retryCount, 
                gameId, 
                currentUid: auth.currentUser?.uid,
                willRetryIn: '5 seconds'
              });
              // Retry after a longer delay for permission issues
              setTimeout(() => {
                console.log('GameScreen: Retrying Firebase connection after permission error', { 
                  retryCount: retryCount + 1,
                  gameId,
                  currentUid: auth.currentUser?.uid
                });
                setupListener(retryCount + 1);
              }, 5000); // Wait 5 seconds before retry (increased delay)
            } else if (retryCount >= 5) {
              console.log('GameScreen: Max retries reached for joining player, showing error', {
                gameId,
                currentUid: auth.currentUser?.uid,
                totalRetries: retryCount,
                finalError: error.message
              });
              Alert.alert('Game Access Error', 'Unable to access the game after multiple attempts. Please check with your friend to ensure the challenge was sent correctly.');
            }
          } else if (error.code === 'unavailable') {
            Alert.alert('Connection Error', 'Unable to connect to the game server. Please check your internet connection and try again.');
          } else {
            Alert.alert('Connection Error', 'Failed to connect to the game. Please check your connection and try again.');
          }
        } else {
          setShowInvalidPopup(true);
          setTimeout(() => setShowInvalidPopup(false), 2000);
        }
      });

      return unsubscribe;
    };

    // Add a delay to ensure the document is created/accessible before setting up the listener
    const timer = setTimeout(() => {
      console.log('GameScreen: Timer expired, setting up Firebase listener', { 
        gameId, 
        gameState, 
        isCreator, 
        delay,
        currentUid: auth.currentUser?.uid,
        timestamp: new Date().toISOString()
      });
      
      // Store the unsubscribe function for cleanup
      let unsubscribeRef = null;
      
      const cleanup = () => {
        console.log('GameScreen: Unsubscribing from gameId', { 
          gameId, 
          isCreator, 
          currentUid: auth.currentUser?.uid,
          timestamp: new Date().toISOString()
        });
        clearTimeout(timer);
        if (unsubscribeRef && typeof unsubscribeRef === 'function') {
          unsubscribeRef();
        }
      };
      
      // Set up the listener and store the unsubscribe function
      unsubscribeRef = setupListener(0);
      
      return cleanup;
    }, delay);

    console.log('GameScreen: Setting up timer for Firebase listener', { 
      gameId, 
      delay, 
      gameState, 
      isCreator, 
      currentUid: auth.currentUser?.uid,
      willSetupIn: `${delay}ms`
    });

    return () => {
      console.log('GameScreen: Cleaning up Firebase listener setup', { 
        gameId, 
        isCreator, 
        currentUid: auth.currentUser?.uid,
        timestamp: new Date().toISOString()
      });
      clearTimeout(timer);
    };
  }, [gameMode, gameId, isCreator, playerId, gameState, auth.currentUser?.uid]);

  // Game state logic effect
  useEffect(() => {
    if (gameMode !== 'pvp' || !gameId || gameState !== 'playing') return;

    const opponentHasCorrect = opponentGuesses.some(g => g.isCorrect);
    const playerHasCorrect = guesses.some(g => g.isCorrect);

    if (opponentHasCorrect && !playerHasCorrect && opponentGuessCountOnSolve !== null && !hasShownOpponentSolved) {
      console.log('GameScreen: Opponent solved', { opponentGuessCountOnSolve });
      setShowOpponentSolvedPopup(true);
      setHasShownOpponentSolved(true);
      playSound('opponentSolved').catch(() => {});
    }

    if (playerHasCorrect && (opponentHasCorrect || opponentGuesses.length >= MAX_GUESSES)) {
      setGameState('gameOver');
      const playerGuessCount = guesses.length;
      const opponentGuessCount = opponentGuessCountOnSolve || opponentGuesses.length;
      console.log('GameScreen: Game over, comparing guesses', { playerGuessCount, opponentGuessCount });
      if (playerHasCorrect && opponentHasCorrect) {
        if (playerGuessCount < opponentGuessCount) {
          setShowWinPopup(true);
          playSound('victory').catch(() => {});
        } else if (playerGuessCount > opponentGuessCount) {
          setShowLosePopup(true);
          playSound('lose').catch(() => {});
        } else {
          setShowTiePopup(true);
          playSound('tie').catch(() => {});
        }
      } else if (playerHasCorrect && !opponentHasCorrect) {
        setShowWinPopup(true);
        playSound('victory').catch(() => {});
      } else if (!playerHasCorrect && opponentHasCorrect) {
        setShowLosePopup(true);
        playSound('lose').catch(() => {});
      } else {
        setShowTiePopup(true);
        playSound('tie').catch(() => {});
      }
    } else if (guesses.length >= MAX_GUESSES && !playerHasCorrect) {
      setGameState('maxGuesses');
      setShowMaxGuessesPopup(true);
      playSound('maxGuesses').catch(() => {});
    }
  }, [guesses, opponentGuesses, gameState, hasShownOpponentSolved, gameMode, gameId, opponentGuessCountOnSolve]);

  const saveGameState = async () => {
    if (gameState !== 'gameOver' && gameMode !== 'resume' && targetWord) {
      try {
        const gameData = {
          gameMode,
          wordLength: wordLength || 5,
          gameId,
          playerId: playerId || null,
          isCreator: isCreator || false,
          guesses: guesses.map(guess => ({
            word: guess.word,
            dots: guaranteeCircles(guess.dots),
            circles: guaranteeCircles(guess.circles),
            feedback: guess.feedback,
            isCorrect: guess.isCorrect,
            isHint: guess.isHint || false
          })),
          inputWord,
          alphabet,
          targetWord,
          gameState,
          hintCount,
          usedHintLetters,
          opponentGuessCountOnSolve,
          timestamp: new Date().toISOString(),
        };
        console.log('GameScreen: Saving game state', { gameId, targetWord, gameState });
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
      } catch (error) {
        console.error('GameScreen: Failed to save game state', error);
      }
    }
  };

  const guaranteeCircles = (num) => {
    return isNaN(num) ? 0 : num;
  };

  useEffect(() => {
    if (!targetWord || gameState === 'selectDifficulty' || gameState === 'waiting' || gameMode === 'resume') return;
    saveGameState();
  }, [guesses, inputWord, targetWord, gameState, hintCount, gameMode, gameId, isCreator, opponentGuessCountOnSolve, usedHintLetters]);

  // Auto-scroll to bottom when guesses change
  useEffect(() => {
    if (guesses.length > 0 && scrollViewRef.current) {
      // Small delay to ensure content is rendered
      const timer = setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [guesses]);

  const handleLetterInput = (letter) => {
    if (inputWord.length < (wordLength || 5) && gameState !== 'maxGuesses' && gameState !== 'gameOver' && !guesses.some(g => g.isCorrect)) {
      setInputWord(inputWord + letter.toUpperCase());
      playSound('letterInput').catch(() => {});
    }
  };

  const handleBackspace = async () => {
    if (inputWord.length > 0 && !isLoading && soundsLoaded && gameState !== 'maxGuesses' && gameState !== 'gameOver' && !guesses.some(g => g.isCorrect)) {
      setInputWord(inputWord.slice(0, -1));
      try {
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            await playSound('backspace');
            return;
          } catch (error) {
            console.error('GameScreen: Backspace sound attempt failed', { attempt: attempts + 1, error });
            attempts++;
            if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      } catch (error) {
        console.error('GameScreen: Failed to play backspace sound after retries', error);
      }
    }
  };

  const toggleLetter = (index) => {
    if (gameState !== 'maxGuesses' && gameState !== 'gameOver' && !guesses.some(g => g.isCorrect)) {
      console.log('GameScreen: Toggling letter', { index, letter: String.fromCharCode(65 + index) });
      setAlphabet((prev) => {
        const updated = [...prev];
        if (updated[index] === 'unknown') {
          updated[index] = 'absent';
        } else if (updated[index] === 'absent') {
          updated[index] = 'present';
        } else if (updated[index] === 'present') {
          updated[index] = 'unknown';
        }
        return updated;
      });
      playSound('toggleLetter').catch(() => {});
    }
  };

  const handleSubmit = async () => {
    if (isLoading || inputWord.length !== (wordLength || 5) || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect)) {
      console.log('GameScreen: Invalid submission', { inputWord, wordLength, gameState });
      setShowInvalidPopup(true);
      await playSound('invalidWord').catch(() => {});
      setTimeout(() => setShowInvalidPopup(false), 2000);
      return;
    }
    setIsLoading(true);
    try {
      const isValid = await isValidWord(inputWord, wordLength || 5);
      if (!isValid) {
        setShowInvalidPopup(true);
        await playSound('invalidWord').catch(() => {});
        setTimeout(() => setShowInvalidPopup(false), 2000);
        return;
      }

            await playSound('guess').catch(() => {});
      const upperInput = inputWord.toUpperCase();
      console.log('GameScreen: Submitting', { inputWord: upperInput, gameState });

      if (gameState === 'setWord') {
        console.log('GameScreen: Submitting word for PvP', { gameId, isCreator, inputWord: upperInput });
        setGameState('waiting');
        setInputWord('');
        if (gameMode === 'pvp' && gameId) {
          try {
            const updateData = isCreator
              ? { playerWord: upperInput, playerGuesses: [], wordLength: wordLength || 5, playerGuessCountOnSolve: null }
              : { opponentWord: upperInput, opponentGuesses: [], wordLength: wordLength || 5, opponentGuessCountOnSolve: null };
            await setDoc(doc(db, 'games', gameId), updateData, { merge: true });
            console.log('GameScreen: Firestore updated with word', { inputWord: upperInput });
          } catch (error) {
            console.error('GameScreen: Failed to update Firestore with word', error);
            setShowInvalidPopup(true);
            setTimeout(() => setShowInvalidPopup(false), 2000);
          }
        }
      } else if (gameState === 'playing') {
        console.log('GameScreen: Submitting guess', { inputWord: upperInput, targetWord });
        const { dots, circles, feedback } = getFeedback(upperInput, targetWord);
        const newGuess = { word: upperInput, dots, circles, feedback, isCorrect: dots === (wordLength || 5) };
        setGuesses(guesses => [...guesses, newGuess]);
        setInputWord('');

        if (gameMode === 'pvp' && gameId) {
          const updateData = isCreator
            ? { 
                playerGuesses: [...guesses, newGuess], 
                playerGuessCountOnSolve: newGuess.isCorrect ? guesses.length + 1 : null 
              }
            : { 
                opponentGuesses: [...guesses, newGuess], 
                opponentGuessCountOnSolve: newGuess.isCorrect ? guesses.length + 1 : null 
              };
          await setDoc(doc(db, 'games', gameId), updateData, { merge: true });
        }

        if (dots === (wordLength || 5)) {
          setShowCongratsPopup(true);
          await playSound('congratulations').catch(() => {});
          setTimeout(() => {
            setShowCongratsPopup(false);
          }, 2000);
          if (gameMode === 'solo') {
            setGameState('gameOver');
            setShowWinPopup(true);
            await playSound('victory').catch(() => {});
            const newScore = guesses.length + 1;
            
            // Ensure difficulty is set for solo games
            if (!difficulty) {
              const defaultDifficulty = wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular';
              console.log('GameScreen: Setting default difficulty for solo game completion', { wordLength, defaultDifficulty });
              setDifficulty(defaultDifficulty);
            }
            
            try {
              // Always save to local storage for all users
              try {
                const leaderboard = await AsyncStorage.getItem('leaderboard') || '[]';
                const leaderboardData = JSON.parse(leaderboard);
                leaderboardData.push({ 
                  mode: gameMode, 
                  guesses: newScore, 
                  timestamp: new Date().toISOString(), 
                  userId: auth.currentUser?.uid || 'Anonymous' 
                });
                if (leaderboardData.length > 15) leaderboardData.shift();
                await AsyncStorage.setItem('leaderboard', JSON.stringify(leaderboardData));
              } catch (asyncStorageError) {
                console.error('GameScreen: AsyncStorage error, continuing without local save:', asyncStorageError);
                // Continue with Firebase save even if local save fails
              }
              
              // Only save to Firebase for authenticated users (not guests)
              if (auth.currentUser?.uid) {
                // Double-check authentication state
                if (!auth.currentUser || !auth.currentUser.uid) {
                  console.log('GameScreen: User authentication lost, skipping Firebase update');
                  return;
                }
                
                                  // Ensure difficulty is set for solo games
                  const gameDifficulty = difficulty || (wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular');
                  
                  const leaderboardData = {
                    mode: gameMode,
                    difficulty: gameDifficulty, // Save difficulty level
                    wordLength: wordLength || 5, // Save word length
                    guesses: newScore,
                    timestamp: new Date().toISOString(), 
                    userId: auth.currentUser.uid,
                  };
                console.log('GameScreen: Saving to leaderboard:', leaderboardData);
                console.log('GameScreen: Current user UID:', auth.currentUser.uid);
                console.log('GameScreen: Auth state:', auth.currentUser);
                
                try {
                  const docId = `score_${auth.currentUser.uid}_${Date.now()}`;
                  console.log('GameScreen: Creating document with ID:', docId);
                  
                  await setDoc(doc(db, 'leaderboard', docId), leaderboardData, { merge: true });
                  console.log('GameScreen: Successfully saved to leaderboard collection');
                  
                  // Update user profile with game stats
                  await playerProfileService.updateGameStats(auth.currentUser.uid, {
                    won: true,
                    score: newScore,
                    bestScore: 0, // Will be updated by the service if it's better
                    difficulty: gameDifficulty // Pass difficulty for rolling average calculation
                  });
                  console.log('GameScreen: Successfully updated user profile');
                } catch (firebaseError) {
                  console.error('GameScreen: Firebase error details:', {
                    code: firebaseError.code,
                    message: firebaseError.message,
                    details: firebaseError.details
                  });
                  
                  // Fallback: Save to local storage if Firebase fails
                  try {
                    console.log('GameScreen: Attempting fallback to local storage');
                    const localLeaderboard = await AsyncStorage.getItem('leaderboard') || '[]';
                    const localData = JSON.parse(localLeaderboard);
                    localData.push({
                      ...leaderboardData,
                      fallback: true, // Mark as fallback entry
                      firebaseError: firebaseError.message
                    });
                    if (localData.length > 15) localData.shift();
                    await AsyncStorage.setItem('leaderboard', JSON.stringify(localData));
                    console.log('GameScreen: Successfully saved to local storage as fallback');
                  } catch (fallbackError) {
                    console.error('GameScreen: Fallback to local storage also failed:', fallbackError);
                  }
                  
                  // Don't throw the error - just log it and continue
                  // This prevents the game from crashing due to leaderboard issues
                }
              } else {
                console.log('GameScreen: No authenticated user, skipping Firebase leaderboard update');
              }
            } catch (error) {
              console.error('GameScreen: Failed to update leaderboard', error);
              // Show user-friendly error message
              Alert.alert(
                'Score Update Failed', 
                'Your game was completed, but there was an issue saving your score. Your progress has been saved locally.',
                [{ text: 'OK' }]
              );
            }
          }
        } else if (gameMode === 'solo' && guesses.length + 1 >= MAX_GUESSES) {
          setGameState('gameOver');
          setShowLosePopup(true);
          await playSound('lose').catch(() => {});
          
          // Ensure difficulty is set for solo games
          if (!difficulty) {
            const defaultDifficulty = wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular';
            console.log('GameScreen: Setting default difficulty for solo game loss', { wordLength, defaultDifficulty });
            setDifficulty(defaultDifficulty);
          }
          
          // Update user profile with game stats for lost game
          if (auth.currentUser?.uid) {
            try {
              // Ensure difficulty is set for solo games
              const gameDifficulty = difficulty || (wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular');
              
              await playerProfileService.updateGameStats(auth.currentUser.uid, {
                won: false,
                score: MAX_GUESSES,
                bestScore: 0,
                difficulty: gameDifficulty // Pass difficulty for rolling average calculation
              });
            } catch (error) {
              console.error('GameScreen: Failed to update user profile for lost game', error);
              // Show user-friendly error message
              Alert.alert(
                'Score Update Failed', 
                'Your game was completed, but there was an issue saving your score.',
                [{ text: 'OK' }]
              );
            }
          }
        } else if (gameMode === 'pvp' && guesses.length + 1 >= MAX_GUESSES) {
          setGameState('maxGuesses');
          setShowMaxGuessesPopup(true);
          await playSound('maxGuesses').catch(() => {});
        }
      }
    } catch (error) {
      console.error('GameScreen: Failed to submit guess', error);
      setShowInvalidPopup(true);
      setTimeout(() => setShowInvalidPopup(false), 2000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuit = async () => {
    console.log('GameScreen: Quit triggered');
    setShowMenuPopup(false);
    setShowQuitConfirmPopup(true);
    await playSound('chime').catch(() => {});
  };

  const handleConfirmQuit = async () => {
    try {
      console.log('GameScreen: Confirm quit', { gameMode, targetWord });
      if (gameMode === 'solo' && (!targetWord || typeof targetWord !== 'string')) {
        console.error('GameScreen: Invalid targetWord on quit', { targetWord });
        setTargetWord('UNKNOWN');
      }
      setShowQuitConfirmPopup(false);
      setGameState('gameOver');
      await saveGameState();

      if (gameMode === 'pvp' && gameId) {
        await setDoc(doc(db, 'games', gameId), { status: 'quit', quitBy: playerId }, { merge: true });
      }
      console.log('GameScreen: Revealing word on quit', { revealWord: targetWord });
      setShowWordRevealPopup(true);
      await playSound('chime').catch(() => {});
      setTimeout(async () => {
        setShowWordRevealPopup(false);
        navigation.navigate('Home');
      }, 4000);
    } catch (error) {
      console.error('GameScreen: Failed to quit game', error);
      setShowWordRevealPopup(false);
      navigation.navigate('Home');
    }
  };

  const handleSave = async () => {
    console.log('GameScreen: Save triggered');
    try {
      await saveGameState();
      setShowMenuPopup(false);
      navigation.navigate('Home');
      await playSound('chime').catch(() => {});
    } catch (error) {
      console.error('GameScreen: Failed to save game', error);
      setShowMenuPopup(false);
      navigation.navigate('Home');
    }
  };

  const handleDifficultySelect = async (diff) => {
    // Check if hard mode is locked
    if (diff === 'hard') {
      const isUnlocked = await checkHardModeUnlocked();
      if (!isUnlocked) {
        Alert.alert(
          'Hard Mode Locked 🔒',
          'Hard Mode is locked. Unlock it by either:\n\n🏆 Reaching Word Expert rank\n💎 Getting premium access',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Profile', onPress: () => navigation.navigate('Profile') }
          ]
        );
        return;
      }
    }

    const length = diff === 'easy' ? 4 : diff === 'regular' ? 5 : 6;
    console.log('GameScreen: Difficulty selected', { difficulty: diff, wordLength: length });
    await playSound('chime').catch(() => {});
    setGameState(gameMode === 'pvp' ? 'setWord' : 'playing');
    setDifficulty(diff);
    setHintCount(0);
    setUsedHintLetters([]);
    if (gameMode === 'solo') {
      setIsLoading(true);
      try {
        const word = await selectRandomWord(length);
        if (!word) {
          throw new Error('Failed to select random word');
        }
        const upperWord = word.toUpperCase();
        console.log('GameScreen: Setting targetWord for solo', { gameId, targetWord: upperWord, difficulty: diff });
        setTargetWord(upperWord);
        navigation.setParams({ wordLength: length, showDifficulty: false });
      } catch (error) {
        console.error('GameScreen: Failed to select random word', error);
        // Fallback: use a default word to prevent game from crashing
        const fallbackWord = diff === 'easy' ? 'TEST' : diff === 'hard' ? 'TESTER' : 'TESTS';
        setTargetWord(fallbackWord);
        Alert.alert('Warning', 'Failed to load word list. Using fallback word.');
      } finally {
        setIsLoading(false);
      }
    } else if (gameMode === 'pvp' && gameId) {
      try {
        console.log('GameScreen: Updating PvP game document', { gameId, wordLength: length, uid: auth.currentUser?.uid });
        // Update the existing game document with word length
        await setDoc(doc(db, 'games', gameId), {
          wordLength: length,
          lastUpdated: new Date().toISOString(),
        }, { merge: true });
        console.log('GameScreen: Successfully updated PvP game document', { gameId, wordLength: length });
        navigation.setParams({ wordLength: length, showDifficulty: false, gameId });
        // Set game state to 'setWord' to trigger Firebase subscription
        console.log('GameScreen: Setting game state to setWord to trigger Firebase subscription');
        setGameState('setWord');
      } catch (error) {
        console.error('GameScreen: Failed to update PvP game document', error);
      }
    }
  };

  if (!soundsLoaded) {
    return (
      <SafeAreaView style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading sounds...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screenContainer}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}
      {gameState === 'selectDifficulty' ? (
        <View style={styles.difficultyContainer}>
          <Text style={styles.header}>Select Difficulty</Text>
          {gameMode === 'pvp' && (
            <Text style={{ fontSize: 18, color: '#F59E0B', textAlign: 'center', marginBottom: 15 }}>
              PvP Game Setup
            </Text>
          )}
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleDifficultySelect('easy')}
          >
            <Text style={styles.buttonText}>Easy (4 Letters)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleDifficultySelect('regular')}
          >
            <Text style={styles.buttonText}>Regular (5 Letters)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button, 
              !hardModeUnlocked && styles.lockedButton
            ]}
            onPress={() => {
              if (hardModeUnlocked) {
                handleDifficultySelect('hard');
              } else {
                // Show unlock popup for locked hard mode
                Alert.alert(
                  'Hard Mode Locked 🔒',
                  'Hard Mode (6-letter words) is currently locked.\n\nTo unlock it, you need to:\n\n🏆 Reach Word Expert Rank\n• Play Regular mode games (5 letters)\n• Achieve an average of 8 attempts or fewer\n\n💎 OR Get Premium Access\n• Instant unlock with premium subscription\n• Access to all game modes and features\n\nWould you like to go to your Profile to see your progress?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Go to Profile', onPress: () => navigation.navigate('Profile') }
                  ]
                );
              }
            }}
          >
            <Text style={[
              styles.buttonText,
              !hardModeUnlocked && styles.lockedButtonText
            ]}>
              {hardModeUnlocked ? 'Hard (6 Letters)' : '🔒 Hard (6 Letters) - Locked 💡'}
            </Text>
          </TouchableOpacity>

          {/* Hard Mode Lock Status Message */}
          {!hardModeUnlocked && (
            <View style={styles.lockStatusContainer}>
              <Text style={styles.lockStatusText}>
                🔒 You need to unlock Hard Mode first
              </Text>
              <Text style={styles.lockStatusSubtext}>
                Reach Word Expert rank or get premium access
              </Text>
            </View>
          )}
        </View>
      ) : gameState === 'waiting' ? (
        <View style={styles.waitingContainer}>
          <Text style={styles.header}>Waiting for Opponent</Text>
          <Text style={{ fontSize: 16, color: '#D1D5DB', textAlign: 'center', marginVertical: 10 }}>
            Your opponent will join automatically when they accept your challenge.
          </Text>
          <TouchableOpacity 
            style={[styles.button, { marginTop: 20 }]} 
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.buttonText}>Back to Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fabTop} onPress={() => setShowMenuPopup(true)}>
            <Text style={styles.fabText}>☰</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.soloheader}>
            {gameMode === 'solo' ? 'Guess The Word' : gameState === 'setWord' ? 'Set Your Word' : 'Guess Their Word'}
          </Text>
          <View style={styles.inputDisplay}>
            {[...Array(wordLength || 5)].map((_, idx) => (
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
                        disabled={isLoading || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect)}
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
              {gameMode === 'solo' && gameState === 'playing' && (
                <TouchableOpacity 
                  style={[styles.hintLinkContainer, { marginTop: 5, marginBottom: 5 }]} 
                  onPress={handleHint ? handleHint : () => console.warn('GameScreen: handleHint is undefined')}
                >
                  <Text style={styles.hintLink}>Hint</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.inputControls}>
            <TouchableOpacity
              style={[styles.backspaceButtonContainer, inputWord.length === 0 || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect) ? styles.disabledButton : null]}
              onPress={handleBackspace}
              disabled={!!(isLoading || inputWord.length === 0 || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect))}
            >
              <Text style={styles.buttonTextBackspace}>Backspace</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.guessButtonContainer, inputWord.length !== (wordLength || 5) || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect) ? styles.disabledButton : null]}
              onPress={handleSubmit}
              disabled={!!(isLoading || inputWord.length !== (wordLength || 5) || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect))}
            >
              <Text style={styles.buttonText}>{gameState === 'setWord' ? 'Submit' : 'Guess'}</Text>
            </TouchableOpacity>
          </View>
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
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <Text style={styles.sectionTitle}>Your Guesses</Text>
            <View style={styles.guessGrid}>
              {guesses.map((g, idx) => (
                <View key={`guess-${idx}`} style={styles.guessRow}>
                  <View style={styles.guessWord}>
                    {g.isHint ? (
                      <Text style={[styles.guessLetter, { fontSize: 24 }]}>HINT</Text>
                    ) : (
                      g.word.split('').map((letter, i) => (
                        <Text
                          key={`letter-${idx}-${i}`}
                          style={[styles.guessLetter, { fontSize: 24 }]}
                        >
                          {letter}
                        </Text>
                      ))
                    )}
                  </View>
                  {!g.isHint && (
                    <View style={styles.feedbackContainer}>
                      {[...Array(guaranteeCircles(g.circles))].map((_, i) => (
                        <View
                          key={`circle-${idx}-${i}`}
                          style={styles.feedbackCircle}
                        />
                      ))}
                      {[...Array(guaranteeCircles(g.dots))].map((_, i) => (
                        <View
                          key={`dot-${idx}-${i}`}
                          style={styles.feedbackDot}
                        />
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.fabTop} onPress={() => setShowMenuPopup(true)}>
            <Text style={styles.fabText}>☰</Text>
          </TouchableOpacity>
          <Modal visible={!!showInvalidPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.invalidGuessPopup, styles.modalShadow]}>
                <Text style={styles.invalidGuessTitle}>Invalid Guess!</Text>
                <Text style={styles.invalidGuessMessage}>
                  Please enter a valid {wordLength || 5}-letter word.
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
          <Modal visible={!!showCongratsPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.congratsPopup, styles.modalShadow]}>
                <Text style={styles.congratsTitle}>Congratulations!</Text>
                <Text style={styles.congratsMessage}>You solved the word!</Text>
                <TouchableOpacity
                  style={styles.congratsButtonContainer}
                  onPress={() => {
                    setShowCongratsPopup(false);
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showWinPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.winPopup, styles.modalShadow]}>
                <Text style={styles.winTitle}>Victory!</Text>
                <Text style={styles.winMessage}>
                  {gameMode === 'solo'
                    ? `You won in ${guesses.length} guesses!`
                    : `You won with ${guesses.length} guesses, opponent used ${opponentGuessCountOnSolve || opponentGuesses.length} guesses!`}
                </Text>
                <TouchableOpacity
                  style={styles.winButtonContainer}
                  onPress={async () => {
                    setShowWinPopup(false);
                    await AsyncStorage.removeItem('savedGames');
                    navigation.navigate('Home');
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>Main Menu</Text>
                </TouchableOpacity>
                {gameMode === 'solo' && (
                  <TouchableOpacity
                    style={styles.winButtonContainer}
                    onPress={async () => {
                      setShowWinPopup(false);
                      setGuesses([]);
                      setInputWord('');
                      setAlphabet(Array(26).fill('unknown'));
                      setHintCount(0);
                      setUsedHintLetters([]);
                      setGameState('playing');
                      setIsLoading(true);
                      try {
                        const word = await selectRandomWord(wordLength || 5);
                        const upperWord = word.toUpperCase();
                        console.log('GameScreen: Setting new targetWord for play again', { gameId, targetWord: upperWord });
                        setTargetWord(upperWord);
                      } catch (error) {
                        console.error('GameScreen: Failed to select random word for play again', error);
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  >
                    <Text style={styles.buttonText}>Play Again</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </Modal>
          <Modal visible={!!showLosePopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.losePopup, styles.modalShadow]}>
                <Text style={styles.loseTitle}>You Lost!</Text>
                <Text style={styles.loseMessage}>
                  {gameMode === 'solo'
                    ? `The word was: ${targetWord}`
                    : `You used ${guesses.length} guesses, opponent used ${opponentGuessCountOnSolve || opponentGuesses.length} guesses.`}
                </Text>
                <TouchableOpacity
                  style={styles.loseButtonContainer}
                  onPress={async () => {
                    setShowLosePopup(false);
                    await AsyncStorage.removeItem('savedGames');
                    navigation.navigate('Home');
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>Main Menu</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showTiePopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.opponentGuessesPopup, styles.modalShadow]}>
                <Text style={styles.opponentGuessesTitle}>It's a Tie!</Text>
                <Text style={styles.opponentGuessesMessage}>
                  Both players used {guesses.length} guesses!
                </Text>
                <TouchableOpacity
                  style={styles.opponentGuessesButtonContainer}
                  onPress={async () => {
                    setShowTiePopup(false);
                    await AsyncStorage.removeItem('savedGames');
                    navigation.navigate('Home');
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>Main Menu</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showStartGamePopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.opponentGuessesPopup, styles.modalShadow]}>
                <Text style={styles.opponentGuessesTitle}>Let The Games Begin!</Text>
                <Text style={styles.opponentGuessesMessage}>
                  Both players have set their words. Start guessing!
                </Text>
                <TouchableOpacity
                  style={styles.opponentGuessesButtonContainer}
                  onPress={() => {
                    setShowStartGamePopup(false);
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showMenuPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.menuPopup, styles.modalShadow]}>
                <Text style={styles.menuTitle}>Menu</Text>
                <TouchableOpacity
                  style={styles.menuButtonContainer}
                  onPress={handleQuit}
                >
                  <Text style={styles.buttonText}>Quit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButtonContainer}
                  onPress={handleSave}
                >
                  <Text style={styles.buttonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButtonContainer}
                  onPress={() => setShowMenuPopup(false)}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showQuitConfirmPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.quitConfirmPopup, styles.modalShadow]}>
                <Text style={styles.quitConfirmTitle}>Quit Game?</Text>
                <Text style={styles.quitConfirmMessage}>
                  Are you sure you want to quit?
                </Text>
                <TouchableOpacity
                  style={styles.quitConfirmButtonContainer}
                  onPress={handleConfirmQuit}
                >
                  <Text style={styles.buttonText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quitConfirmButtonContainer}
                  onPress={() => {
                    setShowQuitConfirmPopup(false);
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showWordRevealPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.wordRevealPopup, styles.modalShadow]}>
                <Text style={styles.wordRevealTitle}>Game Over</Text>
                <Text style={styles.wordRevealMessage}>
                  The word was: {targetWord || 'Unknown'}
                </Text>
                <TouchableOpacity
                  style={styles.wordRevealButtonContainer}
                  onPress={() => {
                    setShowWordRevealPopup(false);
                    navigation.navigate('Home');
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showHintPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.hintPopup, styles.modalShadow]}>
                <Text style={styles.hintTitle}>Hint</Text>
                <Text style={styles.hintMessage}>
                  The word contains the letter: {hintLetter}
                </Text>
                <TouchableOpacity
                  style={styles.hintButtonContainer}
                  onPress={() => {
                    setShowHintPopup(false);
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showHintLimitPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.hintPopup, styles.modalShadow]}>
                <Text style={styles.hintTitle}>No Hints Left!</Text>
                <Text style={styles.hintMessage}>
                  You have used all 3 hints for this game.
                </Text>
                <TouchableOpacity
                  style={styles.hintButtonContainer}
                  onPress={() => {
                    setShowHintLimitPopup(false);
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showOpponentSolvedPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.opponentSolvedPopup, styles.modalShadow]}>
                <Text style={styles.opponentSolvedTitle}>Opponent Solved!</Text>
                <Text style={styles.opponentSolvedMessage}>
                  {opponentGuessCountOnSolve && guesses.length < opponentGuessCountOnSolve
                    ? `Your opponent solved your word in ${opponentGuessCountOnSolve} guesses! You have ${opponentGuessCountOnSolve - guesses.length} guesses left to tie or win.`
                    : `Your opponent solved your word in ${opponentGuessCountOnSolve || opponentGuesses.length} guesses. You've used too many guesses to win.`}
                </Text>
                <TouchableOpacity
                  style={styles.opponentGuessesButtonContainer}
                  onPress={() => {
                    setShowOpponentSolvedPopup(false);
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showMaxGuessesPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.maxGuessesPopup, styles.modalShadow]}>
                <Text style={styles.maxGuessesTitle}>Max Guesses Reached!</Text>
                <Text style={styles.maxGuessesMessage}>
                  You've reached the maximum of {MAX_GUESSES} guesses. Waiting for opponent to finish.
                </Text>
                <TouchableOpacity
                  style={styles.maxGuessesButtonContainer}
                  onPress={async () => {
                    setShowMaxGuessesPopup(false);
                    await saveGameState();
                    navigation.navigate('Home');
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>Main Menu</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
};

export default GameScreen;
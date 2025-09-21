import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Dimensions, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from './firebase'; // Added auth import
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { isValidWord, getFeedback, selectRandomWord } from './gameLogic';
import styles from './styles';
import { playSound } from './soundsUtil';
// Audio mode is now handled in soundsUtil.js
import ThreeDGreenDot from './ThreeDGreenDot';
import ThreeDPurpleRing from './ThreeDPurpleRing';
import playerProfileService from './playerProfileService';
import { useTheme } from './ThemeContext';
import adService from './adService';

const GameScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  // Validate route params and provide defaults
  const params = route.params || {};
  const { 
    showDifficulty, 
    gameMode, 
    wordLength, 
    soloWord, 
    gameId: initialGameId, 
    playerId, 
    isCreator, 
    guesses: savedGuesses,
    resumeGame, 
    inputWord: savedInputWord, 
    alphabet: savedAlphabet, 
    targetWord: savedTargetWord, 
    gameState: savedGameState, 
    hintCount: savedHintCount 
  } = params;

  // Safety check - if no valid params, log warning but don't force navigation
  useEffect(() => {
    if (!gameMode && !showDifficulty && !soloWord) {
      console.warn('GameScreen: No valid game parameters detected');
      // Don't force navigation back, let the component handle missing params gracefully
    }
  }, [gameMode, showDifficulty, soloWord]);



  const [difficulty, setDifficulty] = useState(null);
  const [inputWord, setInputWord] = useState(savedInputWord || '');
  const [guesses, setGuesses] = useState(savedGuesses || []);
  const [targetWord, setTargetWord] = useState(savedTargetWord || '');
  const [gameState, setGameState] = useState(savedGameState || (showDifficulty ? 'selectDifficulty' : gameMode === 'pvp' ? 'selectDifficulty' : 'playing'));

  

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
  const [opponentUsername, setOpponentUsername] = useState('');
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

  // Calculate optimal sizing for alphabet grid to use full width
  const windowWidth = Dimensions.get('window').width;
  const availableWidth = windowWidth - 20; // Minimal padding for screen edges
  
  // Calculate optimal letter size and spacing to maximize usage
  const getOptimalSizing = () => {
    const longestRow = 10; // QWERTY top row has 10 letters
    const minSpacing = 2; // Minimal spacing between letters
    const totalSpacing = (longestRow - 1) * minSpacing; // Total spacing needed
    const availableForLetters = availableWidth - totalSpacing;
    const letterSize = Math.floor(availableForLetters / longestRow);
    
    // Use larger letters - be more aggressive with sizing
    const finalLetterSize = Math.max(Math.min(letterSize, 50), 28); // Increased max to 50, min to 28
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

  // Show interstitial ad after game completion
  const showGameCompletionAd = useCallback(async () => {
    try {
      // Show ads for all game modes after completion
      await adService.showInterstitialAd();
    } catch (error) {
      console.error('GameScreen: Failed to show game completion ad:', error);
    }
  }, []);

  const handleHint = useCallback(async () => {
    if (hintCount >= 3) {
      setShowHintLimitPopup(true);
      await playSound('invalidWord').catch(() => {});
      setTimeout(() => setShowHintLimitPopup(false), 2000);
      return;
    }

    try {
      // Show interstitial ad for hint
      await adService.showInterstitialAdForHint();

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

  // Audio mode is now handled in soundsUtil.js
  useEffect(() => {
    // Sounds are now preloaded in App.js
    soundsInitialized.current = true;
    setSoundsLoaded(true);

    if ((gameMode === 'solo' && savedTargetWord) || soloWord) {
      const upperWord = (savedTargetWord || soloWord).toUpperCase();
      setTargetWord(upperWord);
    }
  }, [gameMode, savedTargetWord, soloWord]);

  // Initialize difficulty for solo games
  useEffect(() => {
    if (gameMode === 'solo' && !difficulty) {
      // Set default difficulty for solo games if none is set
      const defaultDifficulty = wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular';
      setDifficulty(defaultDifficulty);
    }
  }, [gameMode, difficulty, wordLength]);

  // Load saved game state for resume mode
  useEffect(() => {
    const loadSavedGameState = async () => {
      if ((gameMode === 'resume' || resumeGame) && gameId) {
        try {
          const savedGames = await AsyncStorage.getItem('savedGames');
          if (savedGames) {
            const games = JSON.parse(savedGames);
            const savedGame = games.find(game => game.gameId === gameId);
            
            if (savedGame && savedGame.gameMode === 'solo') {
              console.log('GameScreen: Loading saved solo game state:', savedGame.gameId);
              
              // Restore game state
              setGuesses(savedGame.guesses || []);
              setInputWord(savedGame.inputWord || '');
              setAlphabet(savedGame.alphabet || Array(26).fill('unknown'));
              setTargetWord(savedGame.targetWord);
              setGameState(savedGame.gameState || 'playing');
              setHintCount(savedGame.hintCount || 0);
              setUsedHintLetters(savedGame.usedHintLetters || []);
              
              // Set difficulty if available
              if (savedGame.difficulty) {
                setDifficulty(savedGame.difficulty);
              } else {
                // Infer difficulty from word length
                const inferredDifficulty = savedGame.wordLength === 4 ? 'easy' : 
                                         savedGame.wordLength === 6 ? 'hard' : 'regular';
                setDifficulty(inferredDifficulty);
              }
              
              console.log('GameScreen: Solo game state restored successfully');
            } else {
              console.warn('GameScreen: No saved solo game found for gameId:', gameId);
              // Navigate back if no saved game found
              navigation.goBack();
            }
          } else {
            console.warn('GameScreen: No saved games found');
            navigation.goBack();
          }
        } catch (error) {
          console.error('GameScreen: Failed to load saved game state:', error);
          Alert.alert('Error', 'Failed to load saved game. Please try again.');
          navigation.goBack();
        }
      }
    };

    loadSavedGameState();
  }, [gameMode, gameId, navigation]);

  // Firebase subscription effect
  useEffect(() => {
    // Early return if not PvP or no gameId
    if (gameMode !== 'pvp' || !gameId) {
      return;
    }

    // Early return if creator is still selecting difficulty
    if (isCreator && gameState === 'selectDifficulty') {
      return;
    }

    // For joining players, add a longer delay to ensure they're properly added to the game document
    const delay = isCreator ? 500 : 3000; // 3 seconds for joining players to ensure they're added


    // Add a delay to ensure the document is created/accessible before setting up the listener
    const setupListener = (retryCount = 0) => {
      const gameRef = doc(db, 'games', gameId);
      
      const unsubscribe = onSnapshot(gameRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          
          // For joining players, verify they have access to this game
          if (!isCreator && data.players && !data.players.includes(auth.currentUser?.uid)) {
            // Wait a bit more for the player to be added
            return;
          }
          
          // Update opponent guesses
          setOpponentGuesses(isCreator ? data.opponentGuesses || [] : data.playerGuesses || []);
          
          // Fetch opponent username for PvP games
          if (gameMode === 'pvp' && data.playerIds && !opponentUsername) {
            fetchOpponentUsername(data);
          }
          
          // Check if game is ready and both players can start setting words
          if (data.status === 'ready' && gameState === 'setWord') {
            // Game is ready, both players can now set their words
          }
          
          // Check if both words are set to start the game
          if (data.playerWord && data.opponentWord && gameState !== 'playing' && gameState !== 'gameOver' && gameState !== 'maxGuesses') {
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
          // Don't show invalid word popup for missing game documents in PvP mode
          // This could mean the game is still being created by the first player
          if (gameMode === 'pvp' && isCreator) {
            // Creator is waiting for difficulty selection, this is normal
          } else if (gameMode === 'pvp' && !isCreator) {
            // Second player trying to join a game that doesn't exist yet
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
            // For joining players, show a more helpful message and retry after a delay
            if (!isCreator && retryCount < 5) { // Increased retry count
              // Retry after a longer delay for permission issues
              setTimeout(() => {
                setupListener(retryCount + 1);
              }, 5000); // Wait 5 seconds before retry (increased delay)
            } else if (retryCount >= 5) {
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
      
      // Store the unsubscribe function for cleanup
      let unsubscribeRef = null;
      
      const cleanup = () => {
        clearTimeout(timer);
        if (unsubscribeRef && typeof unsubscribeRef === 'function') {
          unsubscribeRef();
        }
      };
      
      // Set up the listener and store the unsubscribe function
      unsubscribeRef = setupListener(0);
      
      return cleanup;
    }, delay);


    return () => {
      clearTimeout(timer);
    };
  }, [gameMode, gameId, isCreator, playerId, gameState, auth.currentUser?.uid]);

  // Game state logic effect
  useEffect(() => {
    if (gameMode !== 'pvp' || !gameId || gameState !== 'playing') return;

    const opponentHasCorrect = opponentGuesses.some(g => g.isCorrect);
    const playerHasCorrect = guesses.some(g => g.isCorrect);

    if (opponentHasCorrect && !playerHasCorrect && opponentGuessCountOnSolve !== null && !hasShownOpponentSolved) {
      setShowOpponentSolvedPopup(true);
      setHasShownOpponentSolved(true);
      playSound('opponentSolved').catch(() => {});
    }

    if (playerHasCorrect && (opponentHasCorrect || opponentGuesses.length >= MAX_GUESSES)) {
      setGameState('gameOver');
      const playerGuessCount = guesses.length;
      const opponentGuessCount = opponentGuessCountOnSolve || opponentGuesses.length;
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

  // Fetch opponent username for PvP games
  const fetchOpponentUsername = useCallback(async (gameData) => {
    if (gameMode !== 'pvp' || !gameData.playerIds) return;
    
    try {
      const opponentId = gameData.playerIds.find(id => id !== auth.currentUser?.uid);
      if (!opponentId) return;
      
      const opponentDoc = await getDoc(doc(db, 'users', opponentId));
      if (opponentDoc.exists()) {
        const opponentData = opponentDoc.data();
        setOpponentUsername(opponentData.username || opponentData.displayName || 'Opponent');
      }
    } catch (error) {
      console.error('GameScreen: Failed to fetch opponent username:', error);
      setOpponentUsername('Opponent');
    }
  }, [gameMode, auth.currentUser?.uid]);

  const saveGameState = async () => {
    if (gameState !== 'gameOver' && gameMode !== 'resume' && targetWord) {
      try {
        const gameData = {
          gameMode,
          wordLength: wordLength || 5,
          gameId,
          playerId: playerId || auth.currentUser?.uid || null,
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
          difficulty: difficulty || (wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular'),
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
      } catch (error) {
        console.error('GameScreen: Failed to save game state', error);
      }
    }
  };

  const guaranteeCircles = (num) => {
    return isNaN(num) ? 0 : num;
  };

  const cleanupCompletedSoloGame = async () => {
    if (gameMode === 'solo' && gameId) {
      try {
        const savedGames = await AsyncStorage.getItem('savedGames');
        if (savedGames) {
          const games = JSON.parse(savedGames);
          const filteredGames = games.filter(game => game.gameId !== gameId);
          await AsyncStorage.setItem('savedGames', JSON.stringify(filteredGames));
          console.log('GameScreen: Cleaned up completed solo game:', gameId);
        }
      } catch (error) {
        console.error('GameScreen: Failed to cleanup completed solo game:', error);
      }
    }
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

  const handleBackspace = () => {
    if (inputWord.length > 0 && !isLoading && gameState !== 'maxGuesses' && gameState !== 'gameOver' && !guesses.some(g => g.isCorrect)) {
      setInputWord(inputWord.slice(0, -1));
      playSound('backspace').catch(() => {});
    }
  };

  const toggleLetter = (index) => {
    if (gameState !== 'maxGuesses' && gameState !== 'gameOver' && !guesses.some(g => g.isCorrect)) {
      setAlphabet((prev) => {
        const updated = [...prev];
        const prevState = updated[index];
        if (prevState === 'unknown') {
          updated[index] = 'absent';
          playSound('toggleLetter').catch(() => {});
        } else if (prevState === 'absent') {
          updated[index] = 'present';
          playSound('toggleLetterSecond').catch(() => {});
        } else if (prevState === 'present') {
          updated[index] = 'unknown';
          playSound('toggleLetter').catch(() => {});
        }
        return updated;
      });
    }
  };

  const handleSubmit = async () => {
    if (isLoading || inputWord.length !== (wordLength || 5) || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect)) {
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

      if (gameState === 'setWord') {
        setGameState('waiting');
        setInputWord('');
        if (gameMode === 'pvp' && gameId) {
          try {
            const updateData = isCreator
              ? { playerWord: upperInput, playerGuesses: [], wordLength: wordLength || 5, playerGuessCountOnSolve: null }
              : { opponentWord: upperInput, opponentGuesses: [], wordLength: wordLength || 5, opponentGuessCountOnSolve: null };
            await setDoc(doc(db, 'games', gameId), updateData, { merge: true });
          } catch (error) {
            console.error('GameScreen: Failed to update Firestore with word', error);
            setShowInvalidPopup(true);
            setTimeout(() => setShowInvalidPopup(false), 2000);
          }
        }
      } else if (gameState === 'playing') {
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
            // Calculate score with hint penalty (each hint = 3 guesses)
            const nonHintGuesses = guesses.filter(guess => !guess.isHint);
            const usedHints = guesses.filter(guess => guess.isHint).length;
            const hintPenalty = usedHints * 3; // Each hint counts as 3 guesses
            const newScore = nonHintGuesses.length + hintPenalty + 1;
            
            // Ensure difficulty is set for solo games
            if (!difficulty) {
              const defaultDifficulty = wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular';
              setDifficulty(defaultDifficulty);
            }
            
            try {
              // Always save to local storage for all users
              try {
                const leaderboard = await AsyncStorage.getItem('leaderboard') || '[]';
                const leaderboardData = JSON.parse(leaderboard);
                leaderboardData.push({ 
                  mode: gameMode, 
                  guesses: newScore, // Includes hint penalty (each hint = 3 guesses)
                  usedHints: usedHints,
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
                  return;
                }
                
                                  // Ensure difficulty is set for solo games
                  const gameDifficulty = difficulty || (wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular');
                  
                  const leaderboardData = {
                    mode: gameMode,
                    difficulty: gameDifficulty, // Save difficulty level
                    wordLength: wordLength || 5, // Save word length
                    guesses: newScore, // Includes hint penalty (each hint = 3 guesses)
                    usedHints: usedHints, // Track number of hints used
                    timestamp: new Date().toISOString(), 
                    userId: auth.currentUser.uid,
                  };
                
                try {
                  const docId = `score_${auth.currentUser.uid}_${Date.now()}`;
                  
                  await setDoc(doc(db, 'leaderboard', docId), leaderboardData, { merge: true });
                  
                  // Update user profile with game stats
                  await playerProfileService.updateGameStats(auth.currentUser.uid, {
                    won: true,
                    score: newScore,
                    bestScore: 0, // Will be updated by the service if it's better
                    difficulty: gameDifficulty, // Pass difficulty for rolling average calculation
                    usedHints: usedHints // Pass hint usage information
                  });
                } catch (firebaseError) {
                  console.error('GameScreen: Firebase error details:', {
                    code: firebaseError.code,
                    message: firebaseError.message,
                    details: firebaseError.details
                  });
                  
                  // Fallback: Save to local storage if Firebase fails
                  try {
                    const localLeaderboard = await AsyncStorage.getItem('leaderboard') || '[]';
                    const localData = JSON.parse(localLeaderboard);
                    localData.push({
                      ...leaderboardData,
                      fallback: true, // Mark as fallback entry
                      firebaseError: firebaseError.message
                    });
                    if (localData.length > 15) localData.shift();
                    await AsyncStorage.setItem('leaderboard', JSON.stringify(localData));
                  } catch (fallbackError) {
                    console.error('GameScreen: Fallback to local storage also failed:', fallbackError);
                  }
                  
                  // Don't throw the error - just log it and continue
                  // This prevents the game from crashing due to leaderboard issues
                }
              } else {
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
    setShowMenuPopup(false);
    setShowQuitConfirmPopup(true);
    await playSound('chime').catch(() => {});
  };

  const handleConfirmQuit = async () => {
    try {
      if (gameMode === 'solo' && (!targetWord || typeof targetWord !== 'string')) {
        console.error('GameScreen: Invalid targetWord on quit', { targetWord });
        setTargetWord('UNKNOWN');
      }
      setShowQuitConfirmPopup(false);
      setGameState('gameOver');
      await saveGameState();

      if (gameMode === 'pvp' && gameId) {
        await setDoc(doc(db, 'games', gameId), { status: 'quit', quitBy: playerId }, { merge: true });
      } else if (gameMode === 'solo') {
        // Clean up quit solo game from saved games
        await cleanupCompletedSoloGame();
      }
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
        // Update the existing game document with word length
        await setDoc(doc(db, 'games', gameId), {
          wordLength: length,
          lastUpdated: new Date().toISOString(),
        }, { merge: true });
        navigation.setParams({ wordLength: length, showDifficulty: false, gameId });
        // Set game state to 'setWord' to trigger Firebase subscription
        setGameState('setWord');
      } catch (error) {
        console.error('GameScreen: Failed to update PvP game document', error);
      }
    }
  };

  if (!soundsLoaded) {
    return (
      <SafeAreaView style={[styles.screenContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Loading sounds...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screenContainer, { backgroundColor: colors.background }]}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
                      <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Loading...</Text>
        </View>
      )}
      {gameState === 'selectDifficulty' ? (
        <View style={styles.difficultyContainer}>
          {/* Back Button */}
          <TouchableOpacity
            style={[styles.backButton, { 
              position: 'absolute',
              top: 10,
              left: 20,
              zIndex: 1
            }]}
            onPress={() => {
              playSound('chime');
              navigation.goBack();
            }}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          
          <Text style={[styles.header, { color: colors.textPrimary }]}>Select Difficulty</Text>
          {gameMode === 'pvp' && (
            <Text style={{ fontSize: 18, color: colors.primary, textAlign: 'center', marginBottom: 15 }}>
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
              <Text style={[styles.lockStatusText, { color: colors.textSecondary }]}>
                🔒 You need to unlock Hard Mode first
              </Text>
              <Text style={[styles.lockStatusSubtext, { color: colors.textMuted }]}>
                Reach Word Expert rank or get premium access
              </Text>
            </View>
          )}
        </View>
      ) : gameState === 'waiting' ? (
        <View style={styles.waitingContainer}>
          <Text style={[styles.header, { color: colors.textPrimary }]}>Waiting for Opponent</Text>
          <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginVertical: 10 }}>
            Your opponent will join automatically when they accept your challenge.
          </Text>
          <TouchableOpacity 
            style={[styles.button, { marginTop: 20 }]} 
            onPress={() => {
              playSound('backspace').catch(() => {});
              navigation.navigate('Home');
            }}
          >
            <Text style={styles.buttonText}>Back to Home</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.fabTop, { top: insets.top + 10 }]} 
            onPress={() => setShowMenuPopup(true)}
          >
            <Text style={[styles.fabText, { color: colors.textPrimary }]}>☰</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.soloheader, { color: colors.textPrimary }]}>
            {gameMode === 'solo' ? 'Guess The Word' : gameState === 'setWord' ? 'Set Your Word' : 'Guess Their Word'}
          </Text>
          <View style={styles.inputDisplay}>
            {[...Array(wordLength || 5)].map((_, idx) => (
              <Text
                key={`input-${idx}`}
                style={[
                  styles.inputLetter, 
                  { 
                    color: colors.textPrimary,
                    backgroundColor: inputWord[idx] ? colors.surface : colors.surfaceLight,
                    borderColor: colors.border
                  }
                ]}
              >
                {inputWord[idx] || ''}
              </Text>
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
                        disabled={isLoading || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect)}
                        style={{ 
                          width: letterSize, 
                          height: buttonHeight, 
                          marginHorizontal: spacing / 2,
                          marginVertical: 2,
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}
                      >
                        <Text
                          style={[
                            styles.letter,
                            { 
                              color: colors.textPrimary,
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              width: letterSize - 4, // Account for border
                              height: letterSize - 4,
                              fontSize: (letterSize * 0.6) + 1, // Responsive font size + 1
                              lineHeight: letterSize - 4
                            },
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
                  <Text style={[styles.hintLink, { color: colors.primary }]}>Hint</Text>
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
              <ThreeDPurpleRing size={15} ringWidth={2} style={{ marginRight: 6 }} />
              <Text style={[styles.feedbackText, { color: colors.textSecondary }]}>Correct Letter</Text>
            </View>
            <View style={styles.feedbackItem}>
              <ThreeDGreenDot size={15} style={{ marginRight: 6 }} />
              <Text style={[styles.feedbackText, { color: colors.textSecondary }]}>Correct Spot</Text>
            </View>
          </View>
          <ScrollView 
            ref={scrollViewRef} 
            style={styles.scroll} 
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your Guesses</Text>
            <View style={styles.guessGrid}>
              {guesses.map((g, idx) => (
                <View key={`guess-${idx}`} style={styles.guessRow}>
                  <View style={styles.guessWord}>
                    {g.isHint ? (
                      <Text style={[styles.guessLetter, { fontSize: 24, color: colors.textPrimary }]}>HINT</Text>
                    ) : (
                      g.word.split('').map((letter, i) => (
                        <Text
                          key={`letter-${idx}-${i}`}
                          style={[styles.guessLetter, { fontSize: 24, color: colors.textPrimary }]}
                        >
                          {letter}
                        </Text>
                      ))
                    )}
                  </View>
                  {!g.isHint && (
                    <View style={styles.feedbackContainer}>
                      {[...Array(guaranteeCircles(g.circles))].map((_, i) => (
                        <ThreeDPurpleRing key={`circle-${idx}-${i}`} size={15} ringWidth={2} style={{ marginRight: 6 }} />
                      ))}
                      {[...Array(guaranteeCircles(g.dots))].map((_, i) => (
                        <ThreeDGreenDot key={`dot-${idx}-${i}`} size={15} style={{ marginRight: 6 }} />
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
          <TouchableOpacity 
            style={[styles.fabTop, { top: insets.top + 10 }]} 
            onPress={() => setShowMenuPopup(true)}
          >
            <Text style={[styles.fabText, { color: colors.textPrimary }]}>☰</Text>
          </TouchableOpacity>
          <Modal visible={!!showInvalidPopup} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.invalidGuessPopup, styles.modalShadow]}>
                <Text style={[styles.invalidGuessTitle, { color: colors.textPrimary }]}>Invalid Guess!</Text>
                <Text style={[styles.invalidGuessMessage, { color: colors.textSecondary }]}>
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
                <Text style={[styles.congratsTitle, { color: colors.textPrimary }]}>Congratulations!</Text>
                <Text style={[styles.congratsMessage, { color: colors.textSecondary }]}>You solved the word!</Text>
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
                <Text style={[styles.winTitle, { color: colors.textPrimary }]}>
                  {gameMode === 'solo' ? 'Congratulations!' : 'Victory!'}
                </Text>
                <Text style={[styles.winMessage, { color: colors.textSecondary }]}>
                  {gameMode === 'solo'
                    ? `You solved the word in ${guesses.length} guesses!`
                    : `You won! You solved ${opponentUsername || 'your opponent'}'s word in ${guesses.length} guesses, while they solved your word in ${opponentGuessCountOnSolve || opponentGuesses.length} guesses!`}
                </Text>
                <TouchableOpacity
                  style={styles.winButtonContainer}
                  onPress={async () => {
                    setShowWinPopup(false);
                    // Show ad after game completion
                    await showGameCompletionAd();
                    // Clean up completed solo game from saved games
                    await cleanupCompletedSoloGame();
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
                      // Show ad before starting new game
                      await showGameCompletionAd();
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
                <Text style={[styles.loseTitle, { color: colors.textPrimary }]}>You Lost!</Text>
                <Text style={[styles.loseMessage, { color: colors.textSecondary }]}>
                  {gameMode === 'solo'
                    ? `The word was: ${targetWord}`
                    : `You lost! ${opponentUsername || 'Your opponent'} solved your word in ${opponentGuessCountOnSolve || opponentGuesses.length} guesses, while you solved their word in ${guesses.length} guesses.`}
                </Text>
                <TouchableOpacity
                  style={styles.loseButtonContainer}
                  onPress={async () => {
                    setShowLosePopup(false);
                    // Show ad after game completion
                    await showGameCompletionAd();
                    // Clean up completed solo game from saved games
                    await cleanupCompletedSoloGame();
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
                <Text style={[styles.opponentGuessesTitle, { color: colors.textPrimary }]}>It's a Tie!</Text>
                <Text style={[styles.opponentGuessesMessage, { color: colors.textSecondary }]}>
                  {gameMode === 'solo'
                    ? `You used ${guesses.length} guesses!`
                    : `It's a tie! Both you and ${opponentUsername || 'your opponent'} solved each other's words in ${guesses.length} guesses!`}
                </Text>
                <TouchableOpacity
                  style={styles.opponentGuessesButtonContainer}
                  onPress={async () => {
                    setShowTiePopup(false);
                    // Show ad after game completion
                    await showGameCompletionAd();
                    // Clean up completed solo game from saved games
                    await cleanupCompletedSoloGame();
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
                <Text style={[styles.opponentGuessesTitle, { color: colors.textPrimary }]}>Let The Games Begin!</Text>
                <Text style={[styles.opponentGuessesMessage, { color: colors.textSecondary }]}>
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
                <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>Menu</Text>
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
                <Text style={[styles.quitConfirmTitle, { color: colors.textPrimary }]}>Quit Game?</Text>
                <Text style={[styles.quitConfirmMessage, { color: colors.textSecondary }]}>
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
                <Text style={[styles.wordRevealTitle, { color: colors.textPrimary }]}>Game Over</Text>
                <Text style={[styles.wordRevealMessage, { color: colors.textSecondary }]}>
                  The word was: {targetWord || 'Unknown'}
                </Text>
                <TouchableOpacity
                  style={styles.wordRevealButtonContainer}
                  onPress={async () => {
                    setShowWordRevealPopup(false);
                    // Show ad after quit confirmation
                    await showGameCompletionAd();
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
                <Text style={[styles.hintTitle, { color: colors.textPrimary }]}>Hint</Text>
                <Text style={[styles.hintMessage, { color: colors.textSecondary }]}>
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
                <Text style={[styles.hintTitle, { color: colors.textPrimary }]}>No Hints Left!</Text>
                <Text style={[styles.hintMessage, { color: colors.textSecondary }]}>
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
                <Text style={[styles.opponentSolvedTitle, { color: colors.textPrimary }]}>Opponent Solved!</Text>
                <Text style={[styles.opponentSolvedMessage, { color: colors.textSecondary }]}>
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
                <Text style={[styles.maxGuessesTitle, { color: colors.textPrimary }]}>Max Guesses Reached!</Text>
                <Text style={[styles.maxGuessesMessage, { color: colors.textSecondary }]}>
                  You've reached the maximum of {MAX_GUESSES} guesses. Waiting for opponent to finish.
                </Text>
                <TouchableOpacity
                  style={styles.maxGuessesButtonContainer}
                  onPress={async () => {
                    setShowMaxGuessesPopup(false);
                    await saveGameState();
                    // Show ad after max guesses reached
                    await showGameCompletionAd();
                    // Clean up completed solo game from saved games
                    await cleanupCompletedSoloGame();
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
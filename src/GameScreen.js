import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Dimensions, Alert, Platform, InteractionManager, StatusBar } from 'react-native';
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
  const [guessesLoaded, setGuessesLoaded] = useState(false);
  
  // Debug wrapper for setGuesses
  // Simple wrapper for setGuesses - stable reference to prevent re-renders
  const setGuessesWithLog = useCallback((newGuesses) => {
    setGuesses(newGuesses);
  }, []);
  const [targetWord, setTargetWord] = useState(savedTargetWord || '');
  const [gameState, setGameState] = useState(savedGameState || (showDifficulty ? 'selectDifficulty' : 'playing'));

  

  const [alphabet, setAlphabet] = useState(savedAlphabet || Array(26).fill('unknown'));
  const [hintCount, setHintCount] = useState(savedHintCount || 0);
  const [usedHintLetters, setUsedHintLetters] = useState([]);
  const [showInvalidPopup, setShowInvalidPopup] = useState(false);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  const [showQuitConfirmPopup, setShowQuitConfirmPopup] = useState(false);
  const [showWordRevealPopup, setShowWordRevealPopup] = useState(false);
  const [showHintPopup, setShowHintPopup] = useState(false);
  const [showHintLimitPopup, setShowHintLimitPopup] = useState(false);
  const [showMaxGuessesPopup, setShowMaxGuessesPopup] = useState(false);
  const [hintLetter, setHintLetter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [soundsLoaded, setSoundsLoaded] = useState(false);
  const [gameId, setGameId] = useState(initialGameId || `solo_${Date.now()}`);
  
  // Update gameId when initialGameId changes (important for resume games)
  useEffect(() => {
    if (initialGameId && initialGameId !== gameId) {
      console.log('GameScreen: Updating gameId from route params:', { oldGameId: gameId, newGameId: initialGameId });
      setGameId(initialGameId);
    }
  }, [initialGameId, gameId]);
  const [hardModeUnlocked, setHardModeUnlocked] = useState(false);
  const scrollViewRef = useRef(null);
  const soundsInitialized = useRef(false);

  // Check hard mode unlock status when component mounts
  useEffect(() => {
    const checkUnlockStatus = async () => {
      try {
        if (gameState === 'selectDifficulty') {
          const isUnlocked = await checkHardModeUnlocked();
          setHardModeUnlocked(isUnlocked);
        }
      } catch (error) {
        console.error('GameScreen: Error checking hard mode unlock status:', error);
        setHardModeUnlocked(false); // Default to locked on error
      }
    };
    
    checkUnlockStatus();
  }, [gameState]);

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
      
      // Check if user has reached Word Expert rank (Regular mode average ≤ 10 AND 15+ games played)
      const regularGamesCount = userData.regularGamesCount || 0;
      if (regularAvg > 0 && regularAvg <= 10 && regularGamesCount >= 15) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to check hard mode unlock status:', error);
      return false;
    }
  };

  // Preload game completion ad when game starts
  const preloadGameAd = useCallback(async () => {
    try {
      console.log('GameScreen: Preloading game completion ad...');
      await adService.preloadGameCompletionAd();
    } catch (error) {
      console.error('GameScreen: Failed to preload game completion ad:', error);
    }
  }, []);

  // Show interstitial ad after game completion
  const showGameCompletionAd = useCallback(async () => {
    try {
      console.log('GameScreen: showGameCompletionAd called for gameMode:', gameMode);
      
      if (Platform.OS === 'ios') {
        // iOS: Skip game completion ads due to ATT restrictions and reliability issues
        console.log('GameScreen: iOS - skipping game completion ad');
        // No ad call on iOS to prevent flashing/freezing issues
      } else {
        // Android: Block and wait for ad to complete
        console.log('GameScreen: Android blocking ad mode');
        await adService.showInterstitialAd();
        
        // Ad has completed - minimal audio recovery
        console.log('GameScreen: Ad completed, recovering audio...');
        
        // Brief delay for audio recovery
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Reconfigure audio session
        const { reconfigureAudio } = require('./soundsUtil');
        await reconfigureAudio().catch(() => console.log('Failed to reconfigure audio'));
      }
      
      console.log('GameScreen: showGameCompletionAd completed');
    } catch (error) {
      console.error('GameScreen: Failed to show game completion ad:', error);
      // Don't throw - continue game flow even if ad fails
    }
  }, [gameMode]);

  const handleHint = useCallback(async () => {
    if (hintCount >= 3) {
      setShowHintLimitPopup(true);
      await playSound('invalidWord').catch(() => {});
      return;
    }

    try {
      // Show interstitial ad for hint and wait for completion
      await adService.showInterstitialAdForHint();

      // Ad has completed - minimal audio recovery
      console.log('GameScreen: Hint ad completed, recovering audio...');
      
      // Brief delay for audio recovery
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Reconfigure audio session
      const { reconfigureAudio } = require('./soundsUtil');
      await reconfigureAudio().catch(() => console.log('Failed to reconfigure audio'));

      console.log('GameScreen: Playing hint sound after ad...');
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
        setGuessesWithLog((prev) => [...prev, { word: 'HINT', isHint: true }]);
      }
      setHintLetter(hintLetter);
      setHintCount(prev => prev + 1);
      setShowHintPopup(true);
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
      if ((gameMode === 'resume' || resumeGame) && gameId && initialGameId) {
        console.log('GameScreen: Resume conditions met:', { gameMode, resumeGame, gameId, initialGameId });
        
        // Show loading state immediately for better UX
        setIsLoading(true);
        
        try {
          const savedGames = await AsyncStorage.getItem('savedGames');
          if (savedGames) {
            const games = JSON.parse(savedGames);
            // Use initialGameId if available, otherwise use current gameId
            const searchGameId = initialGameId || gameId;
            console.log('GameScreen: Searching for saved game with ID:', searchGameId);
            const savedGame = games.find(game => game.gameId === searchGameId);
            
            if (savedGame) {
              console.log('GameScreen: Loading saved game state:', savedGame.gameId, 'mode:', savedGame.gameMode);
              
              // Restore common game state for both solo and PvP
              // Validate and clean guesses data
              const validatedGuesses = (savedGame.guesses || []).map((guess, index) => {
                // Reduced logging for better performance on iPad
                
                if (!guess || typeof guess !== 'object') {
                  console.warn('GameScreen: Invalid guess object found:', guess);
                  return null;
                }
                
                // If feedback data is missing or corrupted, regenerate it
                let dots = guaranteeCircles(guess.dots);
                let circles = guaranteeCircles(guess.circles);
                let feedback = guess.feedback || [];
                
                // Regenerate feedback if data is corrupted or missing
                if ((dots === 0 && circles === 0 && guess.word && !guess.isHint) || 
                    !Array.isArray(feedback) || feedback.length === 0 ||
                    guess.dots === undefined || guess.circles === undefined) {
                  console.log('GameScreen: Regenerating feedback for guess:', guess.word, 'Original data:', { dots: guess.dots, circles: guess.circles });
                  const regeneratedFeedback = getFeedback(guess.word, savedGame.targetWord);
                  dots = regeneratedFeedback.dots;
                  circles = regeneratedFeedback.circles;
                  feedback = regeneratedFeedback.feedback;
                  console.log('GameScreen: Regenerated feedback:', { dots, circles, feedback });
                }
                
                const validatedGuess = {
                  word: guess.word || '',
                  dots: dots,
                  circles: circles,
                  feedback: feedback,
                  isCorrect: Boolean(guess.isCorrect),
                  isHint: Boolean(guess.isHint)
                };
                
                // Reduced logging for better performance on iPad
                return validatedGuess;
              }).filter(guess => {
                const isValid = guess !== null;
                if (!isValid) {
                  console.warn('GameScreen: Filtering out invalid guess:', guess);
                }
                return isValid;
              });
              
              console.log('GameScreen: Setting guesses from saved data:', {
                originalGuesses: savedGame.guesses,
                validatedGuesses: validatedGuesses,
                validatedLength: validatedGuesses.length
              });
              
              setGuessesWithLog(validatedGuesses);
              setGuessesLoaded(true);
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
              console.warn('GameScreen: No saved game found for gameId:', gameId);
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
        } finally {
          // Always clear loading state
          setIsLoading(false);
        }
      }
    };

    loadSavedGameState();
  }, [gameMode, gameId, initialGameId, resumeGame, navigation]);


  // Preload game completion ad when game starts (non-blocking)
  useEffect(() => {
    if (gameState === 'playing') {
      // Use setTimeout to prevent blocking the UI
      setTimeout(() => {
        preloadGameAd().catch(err => console.log('Ad preload failed (non-critical):', err));
      }, 1000); // Delay ad preload by 1 second to let game render first
    }
  }, [gameState, preloadGameAd]);

  // Clean up completed solo games immediately when game ends
  useEffect(() => {
    if (gameState === 'gameOver' && gameMode === 'solo') {
      console.log('GameScreen: Game ended, cleaning up solo game immediately');
      cleanupCompletedSoloGame().catch(error => {
        console.error('GameScreen: Failed to cleanup solo game:', error);
      });
    }
  }, [gameState, gameMode]);


  const saveGameState = async () => {
    if (gameState !== 'gameOver' && gameMode !== 'resume' && targetWord) {
      try {
        const gameData = {
          gameMode,
          wordLength: wordLength || 5,
          gameId,
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
          difficulty: difficulty || (wordLength === 4 ? 'easy' : wordLength === 6 ? 'hard' : 'regular'),
          timestamp: new Date().toISOString(),
          playerId: auth.currentUser?.uid
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
    // Don't save if guesses haven't been loaded yet (for resume games)
    if (guessesLoaded === false && (gameMode === 'resume' || resumeGame)) return;
    saveGameState();
  }, [guesses, inputWord, targetWord, gameState, hintCount, gameMode, gameId, usedHintLetters, alphabet, guessesLoaded, resumeGame]);

  // Auto-scroll to bottom when guesses change
  useEffect(() => {
    if (guesses.length > 0 && scrollViewRef.current) {
      // For resume games, add a longer delay to ensure content is fully rendered
      const delay = (gameMode === 'resume' || resumeGame) ? 300 : 100;
      const timer = setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollToEnd({ animated: true });
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [guesses, gameMode, resumeGame]);

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
        setIsLoading(false);
        return;
      }

            await playSound('guess').catch(() => {});
      const upperInput = inputWord.toUpperCase();

      if (gameState === 'playing') {
        const { dots, circles, feedback } = getFeedback(upperInput, targetWord);
        const newGuess = { word: upperInput, dots, circles, feedback, isCorrect: dots === (wordLength || 5) };
        const updatedGuesses = [...guesses, newGuess];
        setGuessesWithLog(updatedGuesses);
        setInputWord('');
        
        // Clear loading state immediately after updating UI to prevent black flash on iOS
        setIsLoading(false);

        // Count only non-hint guesses for max guesses check
        const nonHintGuessesCount = updatedGuesses.filter(guess => !guess.isHint).length;

        if (dots === (wordLength || 5)) {
          // Solo: go straight to detailed win popup and sound
          setGameState('gameOver');
          setShowWinPopup(true);
          playSound('congratulations').catch(() => {});
          
          // Save game data for solo games
          if (gameMode === 'solo') {
            try {
              // Calculate score with hint penalty (each hint = 3 guesses)
              const nonHintGuesses = updatedGuesses.filter(guess => !guess.isHint);
              const usedHints = updatedGuesses.filter(guess => guess.isHint).length;
              const hintPenalty = usedHints * 3; // Each hint counts as 3 guesses
              const newScore = nonHintGuesses.length + hintPenalty;
              
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
                    score: newScore, // Includes hint penalty (each hint = 3 guesses) - changed from 'guesses' to 'score' for Firestore rules
                    guesses: newScore, // Keep both for compatibility
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
                    usedHints: usedHints, // Pass hint usage information
                    mode: 'solo' // Mark as solo game for activity tracking
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
        } else if (nonHintGuessesCount >= MAX_GUESSES) {
          setGameState('maxGuesses');
          setShowMaxGuessesPopup(true);
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
                difficulty: gameDifficulty, // Pass difficulty for rolling average calculation
                mode: 'solo' // Mark as solo game for activity tracking
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

      // Clean up quit solo game from saved games
      await cleanupCompletedSoloGame();
      
      setShowWordRevealPopup(true);
      await playSound('chime').catch(() => {});
      // Word reveal popup will be dismissed when user clicks OK button
    } catch (error) {
      console.error('GameScreen: Failed to quit game', error);
      setShowWordRevealPopup(false);
      navigation.navigate('MainTabs');
    }
  };

  const handleSave = async () => {
    try {
      await saveGameState();
      setShowMenuPopup(false);
      navigation.navigate('MainTabs');
      await playSound('chime').catch(() => {});
    } catch (error) {
      console.error('GameScreen: Failed to save game', error);
      setShowMenuPopup(false);
      navigation.navigate('MainTabs');
    }
  };

  const handleDifficultySelect = async (diff) => {
    try {
      console.log('GameScreen: handleDifficultySelect called with:', diff);
      console.log('GameScreen: Current isLoading state:', isLoading);
      
      // Prevent double-clicks
      if (isLoading) {
        console.log('GameScreen: Already loading, ignoring duplicate difficulty selection');
        return;
      }
      
      // Check if hard mode is locked
      if (diff === 'hard') {
        const isUnlocked = await checkHardModeUnlocked();
        if (!isUnlocked) {
          Alert.alert(
            'Hard Mode Locked 🔒',
            'Hard Mode is locked. Unlock it by either:\n\n🏆 Reaching Word Expert rank\n• Play 15+ Regular mode games\n• Achieve average of 10 attempts or fewer\n\n💎 OR Get premium access',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Go to Profile', onPress: () => navigation.navigate('Profile') }
            ]
          );
          return;
        }
      }

      const length = diff === 'easy' ? 4 : diff === 'regular' ? 5 : 6;
      
      console.log('GameScreen: Selecting word with length:', length);
      setIsLoading(true);
      
      // Use setTimeout to ensure loading UI renders before heavy operations
      setTimeout(async () => {
        try {
          playSound('chime').catch(() => {}); // Fire and forget
          
          const word = await selectRandomWord(length);
          const upperWord = word ? word.toUpperCase() : (diff === 'easy' ? 'TEST' : diff === 'hard' ? 'TESTER' : 'TESTS');
          
          // Batch state updates
          setTargetWord(upperWord);
          setDifficulty(diff);
          setHintCount(0);
          setUsedHintLetters([]);
          setGameState('playing');
          navigation.setParams({ wordLength: length, showDifficulty: false });
          
          console.log('GameScreen: Game ready');
          setIsLoading(false);
        } catch (error) {
          console.error('GameScreen: Error selecting word:', error);
          // Use fallback
          const fallbackWord = diff === 'easy' ? 'TEST' : diff === 'hard' ? 'TESTER' : 'TESTS';
          setTargetWord(fallbackWord);
          setDifficulty(diff);
          setHintCount(0);
          setUsedHintLetters([]);
          setGameState('playing');
          navigation.setParams({ wordLength: length, showDifficulty: false });
          setIsLoading(false);
        }
      }, 50);
    } catch (error) {
      console.error('GameScreen: Error in handleDifficultySelect:', error);
      Alert.alert('Error', `Failed to select difficulty: ${error.message}`);
      setIsLoading(false); // Ensure loading state is cleared
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
      {/* Immersive mode - hide status bar during gameplay ONLY, not during difficulty selection */}
      <StatusBar hidden={gameState !== 'selectDifficulty'} />
      
      {/* Global loading overlay that persists across state transitions */}
      {isLoading && (
        <View style={[styles.loadingOverlay, { zIndex: 9999 }]}>
          <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Loading...</Text>
        </View>
      )}
      
      {gameState === 'selectDifficulty' ? (
        <View style={styles.difficultyContainer}>
          {/* Back Button */}
          <TouchableOpacity
            style={[styles.backButton, { 
              position: 'absolute',
              top: insets.top + 10,
              left: 20,
              zIndex: 1000
            }]}
            onPress={() => {
              playSound('backspace');
              navigation.goBack();
            }}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          
          <Text style={[styles.header, { color: colors.textPrimary, marginTop: insets.top + 60 }]}>Select Difficulty</Text>
          {gameMode === 'pvp' && (
            <Text style={{ fontSize: 18, color: colors.primary, textAlign: 'center', marginBottom: 15 }}>
              PvP Game Setup
            </Text>
          )}
          
          <TouchableOpacity
            style={[styles.button, isLoading && styles.disabledButton, { zIndex: 100 }]}
            onPress={() => {
              console.log('GameScreen: Easy difficulty button pressed');
              handleDifficultySelect('easy');
            }}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Easy (4 Letters)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, isLoading && styles.disabledButton, { zIndex: 100 }]}
            onPress={() => {
              console.log('GameScreen: Regular difficulty button pressed');
              handleDifficultySelect('regular');
            }}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Regular (5 Letters)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button, 
              !hardModeUnlocked && styles.lockedButton,
              isLoading && styles.disabledButton,
              { zIndex: 100 }
            ]}
            onPress={() => {
              console.log('GameScreen: Hard difficulty button pressed, hardModeUnlocked:', hardModeUnlocked);
              if (hardModeUnlocked) {
                handleDifficultySelect('hard');
              } else {
                // Show unlock popup for locked hard mode
                Alert.alert(
                  'Hard Mode Locked 🔒',
                  'Hard Mode (6-letter words) is currently locked.\n\nTo unlock it, you need to:\n\n🏆 Reach Word Expert Rank\n• Play 15+ Regular mode games (5 letters)\n• Achieve an average of 10 attempts or fewer\n\n💎 OR Get Premium Access\n• Instant unlock with premium subscription\n• Access to all game modes and features\n\nWould you like to go to your Profile to see your progress?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Go to Profile', onPress: () => navigation.navigate('Profile') }
                  ]
                );
              }
            }}
            disabled={isLoading || (!hardModeUnlocked && false)}
            activeOpacity={0.7}
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
                Play 15+ Regular games with avg ≤10 or get premium
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
              navigation.navigate('MainTabs');
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
                        disabled={isLoading || gameState === 'maxGuesses' || gameState === 'gameOver' || guesses.some(g => g.isCorrect)}
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
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 5 }}
          >
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your Guesses</Text>
            {(() => {
              // Debug logging for guesses array
              console.log('GameScreen: Rendering guesses array:', {
                guessesLength: guesses.length,
                guesses: guesses.map(g => ({ word: g.word, isHint: g.isHint, dots: g.dots, circles: g.circles })),
                gameMode: gameMode,
                resumeGame: resumeGame
              });
              return null;
            })()}
            <View style={styles.guessGrid}>
              {guesses.map((g, idx) => (
                <View key={`guess-${idx}`} style={[styles.guessRow, { minHeight: isIPad ? 40 : 32, paddingVertical: 0, marginBottom: isIPad ? 2 : 1 }]}>
                  <View style={[styles.guessWord, { width: isIPad ? 280 : 140, minHeight: isIPad ? 40 : 32 }]}>
                    {g.isHint ? (
                      <View style={{ justifyContent: 'center', alignItems: 'center', height: isIPad ? 40 : 32 }}>
                        <Text style={{ fontSize: isIPad ? 22 : 18, color: colors.textPrimary, fontFamily: 'Roboto-Regular', includeFontPadding: false }}>HINT</Text>
                      </View>
                    ) : (
                      g.word.split('').map((letter, i) => (
                        <View
                          key={`letter-${idx}-${i}`}
                          style={{
                            width: isIPad ? 46 : 28,
                            height: isIPad ? 40 : 32,
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
                      ))
                    )}
                  </View>
                  {!g.isHint && (
                    <View style={styles.feedbackContainer}>
                      {[...Array(guaranteeCircles(g.circles))].map((_, i) => (
                        <ThreeDPurpleRing key={`circle-${idx}-${i}`} size={isIPad ? 20 : 15} ringWidth={2} style={{ marginRight: isIPad ? 8 : 6 }} />
                      ))}
                      {[...Array(guaranteeCircles(g.dots))].map((_, i) => (
                        <ThreeDGreenDot key={`dot-${idx}-${i}`} size={isIPad ? 20 : 15} style={{ marginRight: isIPad ? 8 : 6 }} />
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
          
          {/* Guess Counter - Top Left */}
          <View style={[styles.fabTop, { top: insets.top + 10, left: 20, right: 'auto', zIndex: 1000 }]}>
            <Text style={[styles.fabText, { color: colors.textPrimary }]}>
              {guesses.filter(g => !g.isHint).length}
            </Text>
          </View>

          <TouchableOpacity 
            style={[styles.fabTop, { top: insets.top + 10, zIndex: 1000 }]} 
            onPress={() => setShowMenuPopup(true)}
          >
            <Text style={[styles.fabText, { color: colors.textPrimary }]}>☰</Text>
          </TouchableOpacity>
          
          <Modal visible={!!showInvalidPopup} transparent animationType="fade" statusBarTranslucent={false}>
            <View style={styles.modalOverlay}>
              <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
                <Text style={[styles.winTitle, { color: colors.textPrimary }]}>Invalid Word</Text>
                <Text style={[styles.winMessage, { color: colors.textSecondary }]}>
                  Please enter a valid {wordLength || 5}-letter word.
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
          <Modal visible={!!showWinPopup} transparent animationType="fade" statusBarTranslucent={false}>
            <View style={styles.modalOverlay}>
              <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
                <Text style={[styles.winTitle, { color: colors.textPrimary }]}>Congratulations!</Text>
                <Text style={[styles.winMessage, { color: colors.textSecondary }]}>
                  You solved the word in {guesses.length} guesses!
                </Text>
                {/* 
                  Solo Congratulations Popup (Results) - Shows after solving word in solo mode
                  - Ad shows and blocks until closed → Then proceed with chosen action (Main Menu/Play Again)
                */}
                <TouchableOpacity
                  style={styles.winButtonContainer}
                  onPress={async () => {
                    setShowWinPopup(false);
                    
                    // Show ad only for solo mode - PvP ad already played after congratulations
                    if (gameMode === 'solo') {
                      if (Platform.OS === 'ios') {
                        // iOS: Fire and forget - navigate immediately
                        showGameCompletionAd().catch(() => {});
                        navigation.navigate('MainTabs');
                      } else {
                        // Android: Wait for ad to complete
                        await showGameCompletionAd().catch(() => {});
                        navigation.navigate('MainTabs');
                      }
                    } else {
                      // Navigate immediately if no ad
                      navigation.navigate('MainTabs');
                    }
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
                      
                      // Show ad and wait for completion before starting new game
                      if (gameMode === 'solo') {
                        if (Platform.OS === 'ios') {
                          // iOS: Fire and forget - start new game immediately
                          showGameCompletionAd().catch(() => {});
                          // Reset game state and select new word
                          setGuessesWithLog([]);
                          setInputWord('');
                          setAlphabet(Array(26).fill('unknown'));
                          setHintCount(0);
                          setUsedHintLetters([]);
                          setGameState('playing');
                        } else {
                          // Android: Wait for ad to complete
                          await showGameCompletionAd().catch(() => {});
                          // Reset game state and select new word
                          setGuessesWithLog([]);
                          setInputWord('');
                          setAlphabet(Array(26).fill('unknown'));
                          setHintCount(0);
                          setUsedHintLetters([]);
                          setGameState('playing');
                        }
                      } else {
                        // Reset game state and select new word (no ad for non-solo)
                        setGuessesWithLog([]);
                        setInputWord('');
                        setAlphabet(Array(26).fill('unknown'));
                        setHintCount(0);
                        setUsedHintLetters([]);
                        setGameState('playing');
                      }
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
          <Modal visible={!!showMenuPopup} transparent animationType="fade" statusBarTranslucent={false}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContainer, styles.modalShadow, { backgroundColor: colors.surface }]}>
                <Text style={[styles.header, { color: colors.textPrimary }]}>Game Menu</Text>
                
                <TouchableOpacity
                  style={styles.button}
                  onPress={handleSave}
                >
                  <Text style={styles.buttonText}>Save & Exit</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.button, styles.deleteButton]}
                  onPress={handleQuit}
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
          <Modal visible={!!showQuitConfirmPopup} transparent animationType="fade" statusBarTranslucent={false}>
            <View style={styles.modalOverlay}>
              <View style={[styles.quitConfirmPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
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
          <Modal visible={!!showWordRevealPopup} transparent animationType="fade" statusBarTranslucent={false}>
            <View style={styles.modalOverlay}>
              <View style={[styles.wordRevealPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
                <Text style={[styles.wordRevealTitle, { color: colors.textPrimary }]}>Game Over</Text>
                <Text style={[styles.wordRevealMessage, { color: colors.textSecondary }]}>
                  The word was: {targetWord || 'Unknown'}
                </Text>
                <TouchableOpacity
                  style={styles.wordRevealButtonContainer}
                  onPress={async () => {
                    setShowWordRevealPopup(false);
                    
                    // Show ad and wait for completion before navigating
                    if (Platform.OS === 'ios') {
                      // iOS: Fire and forget - navigate immediately
                      showGameCompletionAd().catch(() => {});
                      navigation.navigate('MainTabs');
                    } else {
                      // Android: Wait for ad to complete
                      await showGameCompletionAd().catch(() => {});
                      navigation.navigate('MainTabs');
                    }
                    playSound('chime').catch(() => {});
                  }}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Modal visible={!!showHintPopup} transparent animationType="fade" statusBarTranslucent={false}>
            <View style={styles.modalOverlay}>
              <View style={[styles.hintPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
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
          <Modal visible={!!showHintLimitPopup} transparent animationType="fade" statusBarTranslucent={false}>
            <View style={styles.modalOverlay}>
              <View style={[styles.hintPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
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
          <Modal visible={!!showMaxGuessesPopup} transparent animationType="fade" statusBarTranslucent={false}>
            <View style={styles.modalOverlay}>
              <View style={[styles.maxGuessesPopup, styles.modalShadow, { backgroundColor: colors.surface }]}>
                <Text style={[styles.maxGuessesTitle, { color: colors.textPrimary }]}>Max Guesses Reached!</Text>
                <Text style={[styles.maxGuessesMessage, { color: colors.textSecondary }]}>
                  You've reached the maximum of {MAX_GUESSES} guesses.
                </Text>
                <TouchableOpacity
                  style={styles.maxGuessesButtonContainer}
                  onPress={async () => {
                    setShowMaxGuessesPopup(false);
                    await saveGameState();
                    
                    // Show ad and wait for completion before starting new game
                    if (Platform.OS === 'ios') {
                      // iOS: Fire and forget - start new game immediately
                      showGameCompletionAd().catch(() => {});
                      // Reset game state and select new word
                      setGuessesWithLog([]);
                      setInputWord('');
                      setAlphabet(Array(26).fill('unknown'));
                      setHintCount(0);
                      setUsedHintLetters([]);
                      setGameState('playing');
                    } else {
                      // Android: Wait for ad to complete
                      await showGameCompletionAd().catch(() => {});
                      // Reset game state and select new word
                      setGuessesWithLog([]);
                      setInputWord('');
                      setAlphabet(Array(26).fill('unknown'));
                      setHintCount(0);
                      setUsedHintLetters([]);
                      setGameState('playing');
                    }
                    setIsLoading(true);
                    
                    try {
                      const word = await selectRandomWord(wordLength || 5);
                      const upperWord = word.toUpperCase();
                      setTargetWord(upperWord);
                    } catch (error) {
                      console.error('GameScreen: Failed to select random word after max guesses', error);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  <Text style={styles.buttonText}>Play Again</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.maxGuessesButtonContainer}
                  onPress={async () => {
                    setShowMaxGuessesPopup(false);
                    await saveGameState();
                    
                    // Show ad and wait for completion before navigating
                    if (Platform.OS === 'ios') {
                      // iOS: Fire and forget - navigate immediately
                      showGameCompletionAd().catch(() => {});
                      navigation.navigate('MainTabs');
                    } else {
                      // Android: Wait for ad to complete
                      await showGameCompletionAd().catch(() => {});
                      navigation.navigate('MainTabs');
                    }
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
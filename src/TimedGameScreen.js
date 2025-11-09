import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';
import { isValidWord, getFeedback, selectRandomWord } from './gameLogic';
import styles from './styles';
import { playSound } from './soundsUtil';
import ThreeDGreenDot from './ThreeDGreenDot';
import ThreeDPurpleRing from './ThreeDPurpleRing';
import { useTheme } from './ThemeContext';
import adService from './adService';

const TIMER_DURATION_MS = 3 * 60 * 1000; // 3 minutes
const MAX_GUESSES = 25;

const TimedGameScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const {
    difficulty: initialDifficulty,
    wordLength: initialWordLength,
    resumeGame,
    gameId: initialGameId,
    guesses: savedGuesses,
    alphabet: savedAlphabet,
    inputWord: savedInput,
    targetWord: savedTarget,
    gameState: savedGameState,
    remainingTimeMs: savedRemaining,
    timerDeadline: savedDeadline,
  } = route.params || {};

  const [difficulty, setDifficulty] = useState(initialDifficulty || (initialWordLength === 4 ? 'easy' : initialWordLength === 6 ? 'hard' : 'regular'));
  const [wordLength, setWordLength] = useState(initialWordLength || 5);
  const [gameId, setGameId] = useState(initialGameId || `timed_${Date.now()}`);
  const [targetWord, setTargetWord] = useState((savedTarget || '').toUpperCase());
  const [inputWord, setInputWord] = useState(savedInput || '');
  const [guesses, setGuesses] = useState(savedGuesses || []);
  const [alphabet, setAlphabet] = useState(savedAlphabet || Array(26).fill('unknown'));
  const [gameState, setGameState] = useState(savedGameState || 'loading');
  const [remainingTimeMs, setRemainingTimeMs] = useState(typeof savedRemaining === 'number' ? savedRemaining : TIMER_DURATION_MS);
  const [isLoading, setIsLoading] = useState(false);
  const [guessesLoaded, setGuessesLoaded] = useState(false);

  // UI modal states
  const [showInvalidPopup, setShowInvalidPopup] = useState(false);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  const [showQuitConfirmPopup, setShowQuitConfirmPopup] = useState(false);
  const [showWordRevealPopup, setShowWordRevealPopup] = useState(false);
  const [showMaxGuessesPopup, setShowMaxGuessesPopup] = useState(false);
  const [showTimeUpPopup, setShowTimeUpPopup] = useState(false);

  const scrollViewRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const timerDeadlineRef = useRef(savedDeadline ? new Date(savedDeadline).getTime() : null);
  const timeUpHandledRef = useRef(false);

  const windowWidth = Dimensions.get('window').width;
  const isIPad = Platform.OS === 'ios' && windowWidth >= 768;
  const availableWidth = isIPad ? Math.min(windowWidth * 0.7, 600) : windowWidth - 20;

  const qwertyKeys = useMemo(() => ([
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ]), []);

  const getOptimalSizing = useCallback(() => {
    const longestRow = 10;
    const minSpacing = isIPad ? 3 : 2;
    const totalSpacing = (longestRow - 1) * minSpacing;
    const availableForLetters = availableWidth - totalSpacing;
    const letterSize = Math.floor(availableForLetters / longestRow);

    const maxSize = isIPad ? 55 : 50;
    const minSize = isIPad ? 32 : 28;
    const finalLetterSize = Math.max(Math.min(letterSize, maxSize), minSize);
    const actualSpacing = Math.max((availableWidth - (longestRow * finalLetterSize)) / (longestRow - 1), 1);
    const buttonHeight = Math.floor(finalLetterSize * 1.2);

    return { letterSize: finalLetterSize, spacing: actualSpacing, buttonHeight };
  }, [availableWidth, isIPad]);

  const { letterSize, spacing, buttonHeight } = getOptimalSizing();
  const maxKeyboardWidth = availableWidth;

  const formattedTimeLeft = useMemo(() => {
    const totalSeconds = Math.max(Math.floor(remainingTimeMs / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [remainingTimeMs]);

  const timerTextColor = remainingTimeMs <= 60000 ? '#F87171' : colors.primary;

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const showCompletionAd = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        adService.showInterstitialAd().catch(() => {});
      } else {
        await adService.showInterstitialAd();
        const { reconfigureAudio } = require('./soundsUtil');
        await reconfigureAudio().catch(() => {});
      }
    } catch (error) {
      console.error('TimedGameScreen: Failed to show completion ad:', error);
    }
  }, []);

  const preloadGameAd = useCallback(async () => {
    try {
      await adService.preloadGameCompletionAd();
    } catch (error) {
      console.error('TimedGameScreen: Failed to preload completion ad:', error);
    }
  }, []);

  const handleTimeExpired = useCallback(async () => {
    if (timeUpHandledRef.current) return;
    timeUpHandledRef.current = true;
    clearTimer();
    setGameState('timeUp');
    setShowTimeUpPopup(true);
    await playSound('lose').catch(() => {});
  }, [clearTimer]);

  const startTimer = useCallback(() => {
    clearTimer();

    if (!timerDeadlineRef.current) {
      timerDeadlineRef.current = Date.now() + TIMER_DURATION_MS;
    }

    timerIntervalRef.current = setInterval(() => {
      const remaining = timerDeadlineRef.current - Date.now();
      if (remaining <= 0) {
        setRemainingTimeMs(0);
        handleTimeExpired();
      } else {
        setRemainingTimeMs(remaining);
      }
    }, 1000);
  }, [clearTimer, handleTimeExpired]);

  const guaranteeNumber = (value) => (isNaN(value) ? 0 : value || 0);

  const ensureTimerRunning = useCallback(() => {
    if (gameState === 'playing' && !timerIntervalRef.current && !timeUpHandledRef.current) {
      startTimer();
    }
  }, [gameState, startTimer]);

  const cleanupCompletedTimedGame = useCallback(async () => {
    try {
      const savedGames = await AsyncStorage.getItem('savedGames');
      if (!savedGames) return;
      const games = JSON.parse(savedGames);
      const filtered = games.filter(game => game.gameId !== gameId);
      if (filtered.length !== games.length) {
        await AsyncStorage.setItem('savedGames', JSON.stringify(filtered));
      }
    } catch (error) {
      console.error('TimedGameScreen: Failed to cleanup saved timed game:', error);
    }
  }, [gameId]);

  const saveGameState = useCallback(async () => {
    if (gameState !== 'playing' || !targetWord) return;
    if ((resumeGame || savedGameState) && !guessesLoaded) return;

    try {
      const gameData = {
        gameMode: 'timed',
        wordLength,
        gameId,
        guesses,
        inputWord,
        alphabet,
        targetWord,
        gameState,
        difficulty,
        timestamp: new Date().toISOString(),
        timerDeadline: timerDeadlineRef.current ? new Date(timerDeadlineRef.current).toISOString() : null,
        remainingTimeMs,
        playerId: auth.currentUser?.uid,
      };

      const savedGames = await AsyncStorage.getItem('savedGames');
      const games = savedGames ? JSON.parse(savedGames) : [];
      const existingIndex = games.findIndex(game => game.gameId === gameData.gameId);
      if (existingIndex >= 0) {
        games[existingIndex] = gameData;
      } else {
        games.push(gameData);
      }
      await AsyncStorage.setItem('savedGames', JSON.stringify(games));
    } catch (error) {
      console.error('TimedGameScreen: Failed to save game state:', error);
    }
  }, [alphabet, difficulty, gameId, gameState, guesses, guessesLoaded, inputWord, remainingTimeMs, resumeGame, savedGameState, targetWord, wordLength]);

  const initializeNewGame = useCallback(async () => {
    try {
      setIsLoading(true);
      const length = initialWordLength || (difficulty === 'easy' ? 4 : difficulty === 'hard' ? 6 : 5);
      const word = await selectRandomWord(length);
      const upperWord = (word || '').toUpperCase();

      timerDeadlineRef.current = Date.now() + TIMER_DURATION_MS;
      timeUpHandledRef.current = false;
      setRemainingTimeMs(TIMER_DURATION_MS);
      setTargetWord(upperWord);
      setWordLength(length);
      setInputWord('');
      setAlphabet(Array(26).fill('unknown'));
      setGuesses([]);
      setGameState('playing');
      setGuessesLoaded(true);
      setIsLoading(false);
      startTimer();
    } catch (error) {
      console.error('TimedGameScreen: Failed to initialize game:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Failed to start timed game. Please try again.');
      navigation.goBack();
    }
  }, [difficulty, initialWordLength, navigation, startTimer]);

  const loadSavedGame = useCallback(async () => {
    try {
      setIsLoading(true);
      const savedGames = await AsyncStorage.getItem('savedGames');
      if (!savedGames) {
        Alert.alert('Missing Game', 'Saved game not found.');
        navigation.goBack();
        return;
      }
      const games = JSON.parse(savedGames);
      const existing = games.find(game => game.gameId === (initialGameId || gameId));
      if (!existing) {
        Alert.alert('Missing Game', 'Saved timed game not found.');
        navigation.goBack();
        return;
      }

      const deadline = existing.timerDeadline ? new Date(existing.timerDeadline).getTime() : Date.now() + TIMER_DURATION_MS;
      timerDeadlineRef.current = deadline;
      const remaining = Math.max(deadline - Date.now(), 0);

      setDifficulty(existing.difficulty || difficulty);
      setWordLength(existing.wordLength || wordLength);
      setTargetWord((existing.targetWord || '').toUpperCase());
      setInputWord(existing.inputWord || '');
      setAlphabet(existing.alphabet || Array(26).fill('unknown'));
      setGuesses(existing.guesses || []);
      setGameState(existing.gameState && existing.gameState !== 'timeUp' ? existing.gameState : 'playing');
      setRemainingTimeMs(remaining > 0 ? remaining : 0);
      setGuessesLoaded(true);
      setIsLoading(false);

      if (remaining <= 0) {
        handleTimeExpired();
      } else {
        startTimer();
      }
    } catch (error) {
      console.error('TimedGameScreen: Failed to load saved game:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Failed to load saved timed game.');
      navigation.goBack();
    }
  }, [difficulty, gameId, handleTimeExpired, initialGameId, navigation, startTimer, wordLength]);

  useEffect(() => {
    let mounted = true;

    const prepareGame = async () => {
      if (resumeGame || savedGameState || savedTarget) {
        await loadSavedGame();
      } else if (!targetWord) {
        await initializeNewGame();
      } else {
        if (!timerDeadlineRef.current) {
          timerDeadlineRef.current = Date.now() + TIMER_DURATION_MS;
        }
        setGameState('playing');
        setGuessesLoaded(true);
        startTimer();
      }
    };

    if (mounted) {
      prepareGame().catch(error => console.error('TimedGameScreen: prepareGame error:', error));
    }

    return () => {
      mounted = false;
      clearTimer();
    };
  }, [clearTimer, initializeNewGame, loadSavedGame, resumeGame, savedGameState, savedTarget, startTimer, targetWord]);

  useEffect(() => {
    ensureTimerRunning();
  }, [ensureTimerRunning, gameState]);

  useEffect(() => {
    if (guesses.length > 0 && scrollViewRef.current) {
      const delay = (resumeGame || savedGameState) ? 300 : 100;
      const timer = setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollToEnd({ animated: true });
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [guesses, resumeGame, savedGameState]);

  useEffect(() => {
    if (gameState === 'gameOver' || gameState === 'timeUp' || gameState === 'maxGuesses') {
      cleanupCompletedTimedGame();
      clearTimer();
    }
  }, [cleanupCompletedTimedGame, clearTimer, gameState]);

  useEffect(() => {
    if (!targetWord) return;
    if (gameState !== 'playing') return;
    if ((resumeGame || savedGameState) && !guessesLoaded) return;
    saveGameState();
  }, [alphabet, gameState, guesses, guessesLoaded, inputWord, remainingTimeMs, resumeGame, saveGameState, savedGameState, targetWord]);

  const handleLetterInput = (letter) => {
    if (gameState !== 'playing') return;
    if (inputWord.length >= wordLength) return;
    setInputWord(prev => prev + letter.toUpperCase());
    playSound('letterInput').catch(() => {});
  };

  const handleBackspace = () => {
    if (gameState !== 'playing') return;
    if (inputWord.length === 0) return;
    setInputWord(prev => prev.slice(0, -1));
    playSound('backspace').catch(() => {});
  };

  const toggleLetter = (index) => {
    if (gameState !== 'playing') return;
    setAlphabet(prev => {
      const updated = [...prev];
      const current = updated[index];
      if (current === 'unknown') {
        updated[index] = 'absent';
        playSound('toggleLetter').catch(() => {});
      } else if (current === 'absent') {
        updated[index] = 'present';
        playSound('toggleLetterSecond').catch(() => {});
      } else {
        updated[index] = 'unknown';
        playSound('toggleLetter').catch(() => {});
      }
      return updated;
    });
  };

  const handleSubmit = useCallback(async () => {
    try {
      if (gameState !== 'playing') return;
      if (isLoading) return;
      if (inputWord.length !== wordLength) {
        setShowInvalidPopup(true);
        await playSound('invalidWord').catch(() => {});
        setTimeout(() => setShowInvalidPopup(false), 2000);
        return;
      }

      setIsLoading(true);
      const isValid = await isValidWord(inputWord, wordLength);
      if (!isValid) {
        setShowInvalidPopup(true);
        await playSound('invalidWord').catch(() => {});
        setTimeout(() => setShowInvalidPopup(false), 2000);
        setIsLoading(false);
        return;
      }

      await playSound('guess').catch(() => {});
      const upperInput = inputWord.toUpperCase();
      const { dots, circles, feedback } = getFeedback(upperInput, targetWord);
      const isCorrect = dots === wordLength;
      const updatedGuesses = [...guesses, { word: upperInput, dots, circles, feedback, isCorrect }];
      setGuesses(updatedGuesses);
      setInputWord('');

      if (isCorrect) {
        clearTimer();
        setGameState('gameOver');
        setShowWinPopup(true);
        await playSound('congratulations').catch(() => {});
      } else {
        const nonHintGuessCount = updatedGuesses.length;
        if (nonHintGuessCount >= MAX_GUESSES) {
          clearTimer();
          setGameState('maxGuesses');
          setShowMaxGuessesPopup(true);
          await playSound('lose').catch(() => {});
        }
      }
    } catch (error) {
      console.error('TimedGameScreen: Failed to submit guess:', error);
      setShowInvalidPopup(true);
      setTimeout(() => setShowInvalidPopup(false), 2000);
    } finally {
      setIsLoading(false);
    }
  }, [clearTimer, gameState, guesses, inputWord, isLoading, targetWord, wordLength]);

  const handleQuit = async () => {
    setShowMenuPopup(false);
    setShowQuitConfirmPopup(true);
    await playSound('chime').catch(() => {});
  };

  const handleConfirmQuit = async () => {
    try {
      setShowQuitConfirmPopup(false);
      clearTimer();
      setGameState('timeUp');
      await saveGameState();
      await cleanupCompletedTimedGame();
      setShowWordRevealPopup(true);
      await playSound('chime').catch(() => {});
    } catch (error) {
      console.error('TimedGameScreen: Failed to quit game:', error);
      setShowWordRevealPopup(false);
      navigation.navigate('MainTabs');
    }
  };

  const handlePlayAgain = useCallback(async () => {
    setShowWinPopup(false);
    setShowMaxGuessesPopup(false);
    setShowTimeUpPopup(false);
    await showCompletionAd();
    setGameId(`timed_${Date.now()}`);
    timerDeadlineRef.current = null;
    timeUpHandledRef.current = false;
    setRemainingTimeMs(TIMER_DURATION_MS);
    await initializeNewGame();
  }, [initializeNewGame, showCompletionAd]);

  const handleReturnHome = useCallback(async () => {
    await showCompletionAd();
    playSound('chime').catch(() => {});
    navigation.navigate('MainTabs');
  }, [navigation, showCompletionAd]);

  const renderGuessRow = (guess, idx) => (
    <View key={`guess-${idx}`} style={[styles.guessRow, { minHeight: isIPad ? 40 : 32, paddingVertical: 0, marginBottom: isIPad ? 2 : 1 }]}> 
      <View style={[styles.guessWord, { width: isIPad ? 280 : 140, minHeight: isIPad ? 40 : 32 }]}> 
        {guess.word.split('').map((letter, i) => (
          <View
            key={`letter-${idx}-${i}`}
            style={{
              width: isIPad ? 46 : 28,
              height: isIPad ? 40 : 32,
              justifyContent: 'center',
              alignItems: 'center',
              marginHorizontal: isIPad ? 2 : 0,
              overflow: 'visible',
            }}
          >
            <Text
              style={{
                fontSize: isIPad ? 24 : 20,
                color: colors.textPrimary,
                fontFamily: 'Roboto-Regular',
                textAlign: 'center',
                includeFontPadding: false,
              }}
            >
              {letter}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.feedbackContainer}>
        {[...Array(guaranteeNumber(guess.circles))].map((_, i) => (
          <ThreeDPurpleRing key={`circle-${idx}-${i}`} size={isIPad ? 20 : 15} ringWidth={2} style={{ marginRight: isIPad ? 8 : 6 }} />
        ))}
        {[...Array(guaranteeNumber(guess.dots))].map((_, i) => (
          <ThreeDGreenDot key={`dot-${idx}-${i}`} size={isIPad ? 20 : 15} style={{ marginRight: isIPad ? 8 : 6 }} />
        ))}
      </View>
    </View>
  );

  const formatDuration = useCallback((ms) => {
    const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const timeRemainingText = useMemo(() => formatDuration(remainingTimeMs), [formatDuration, remainingTimeMs]);
  const timeElapsedText = useMemo(() => formatDuration(TIMER_DURATION_MS - remainingTimeMs), [formatDuration, remainingTimeMs]);

  const handleSaveAndExit = async () => {
    try {
      await saveGameState();
    } catch (error) {
      console.error('TimedGameScreen: Failed to save before exit:', error);
    } finally {
      setShowMenuPopup(false);
      playSound('chime').catch(() => {});
      navigation.navigate('MainTabs');
    }
  };

  const handleWordRevealOk = async () => {
    setShowWordRevealPopup(false);
    await showCompletionAd();
    playSound('chime').catch(() => {});
    navigation.navigate('MainTabs');
  };

  const timerBanner = (
    <View style={[styles.hintLinkContainer, { marginTop: 5, marginBottom: 5 }]}> 
      <Text style={[styles.hintLink, { color: timerTextColor }]}>Time Left: {formattedTimeLeft}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.screenContainer, { backgroundColor: colors.background }]}> 
      <StatusBar hidden={true} />

      {isLoading && (
        <View style={[styles.loadingOverlay, { zIndex: 9999 }]}> 
          <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Loading...</Text>
        </View>
      )}

      <Text style={[styles.soloheader, { color: colors.textPrimary, marginTop: insets.top + 10 }]}>Timed Solo</Text>

      <View style={styles.inputDisplay}>
        {[...Array(wordLength)].map((_, idx) => (
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
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: isIPad ? 32 : 24,
                fontFamily: 'Roboto-Regular',
                textAlign: 'center',
                includeFontPadding: false,
              }}
            >
              {inputWord[idx] || ''}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.alphabetContainer}>
        <View style={[styles.alphabetGrid, { maxWidth: maxKeyboardWidth }]}> 
          {qwertyKeys.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: 5, paddingHorizontal: 5 }}>
              {row.map(letter => {
                const index = letter.charCodeAt(0) - 65;
                return (
                  <TouchableOpacity
                    key={letter}
                    onPress={() => handleLetterInput(letter)}
                    onLongPress={() => toggleLetter(index)}
                    delayLongPress={300}
                    disabled={isLoading || gameState !== 'playing'}
                    style={{
                      width: letterSize,
                      height: buttonHeight,
                      marginHorizontal: spacing / 2,
                      marginVertical: 2,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: alphabet[index] === 'absent' ? '#6B7280' : alphabet[index] === 'present' ? '#10B981' : colors.surface,
                      borderWidth: 2,
                      borderColor: colors.border,
                      borderRadius: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: Math.floor(letterSize * 0.55),
                        fontFamily: 'Roboto-Bold',
                        textAlign: 'center',
                        includeFontPadding: false,
                      }}
                    >
                      {letter}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          {timerBanner}
        </View>
      </View>

      <View style={styles.inputControls}>
        <TouchableOpacity
          style={[styles.backspaceButtonContainer, inputWord.length === 0 || gameState !== 'playing' ? styles.disabledButton : null]}
          onPress={handleBackspace}
          disabled={isLoading || inputWord.length === 0 || gameState !== 'playing'}
        >
          <Text style={styles.buttonTextBackspace}>Backspace</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.guessButtonContainer, inputWord.length !== wordLength || gameState !== 'playing' ? styles.disabledButton : null]}
          onPress={handleSubmit}
          disabled={isLoading || inputWord.length !== wordLength || gameState !== 'playing'}
        >
          <Text style={styles.buttonText}>Guess</Text>
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
        <View style={styles.guessGrid}>
          {guesses.map(renderGuessRow)}
        </View>
      </ScrollView>

      <View style={[styles.fabTop, { top: insets.top + 10, left: 20, right: 'auto', zIndex: 1000 }]}> 
        <Text style={[styles.fabText, { color: colors.textPrimary }]}>{guesses.length}</Text>
      </View>

      <TouchableOpacity
        style={[styles.fabTop, { top: insets.top + 10, zIndex: 1000 }]}
        onPress={() => setShowMenuPopup(true)}
      >
        <Text style={[styles.fabText, { color: colors.textPrimary }]}>☰</Text>
      </TouchableOpacity>

      <Modal visible={showInvalidPopup} transparent animationType="fade" statusBarTranslucent={false}>
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.winTitle, { color: colors.textPrimary }]}>Invalid Word</Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary }]}>Please enter a valid {wordLength}-letter word.</Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={() => setShowInvalidPopup(false)}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showWinPopup} transparent animationType="fade" statusBarTranslucent={false}>
        <View style={styles.modalOverlay}>
          <View style={[styles.winPopup, styles.modalShadow, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.winTitle, { color: colors.textPrimary }]}>You Won!</Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary }]}>You solved the word in {guesses.length} guesses.</Text>
            <Text style={[styles.winMessage, { color: colors.textSecondary, marginTop: 6 }]}>Time remaining: {timeRemainingText}</Text>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={async () => {
                setShowWinPopup(false);
                await handleReturnHome();
              }}
            >
              <Text style={styles.buttonText}>Main Menu</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.winButtonContainer}
              onPress={handlePlayAgain}
            >
              <Text style={styles.buttonText}>Play Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showMenuPopup} transparent animationType="fade" statusBarTranslucent={false}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.header, { color: colors.textPrimary }]}>Game Menu</Text>
            <TouchableOpacity style={styles.button} onPress={handleSaveAndExit}>
              <Text style={styles.buttonText}>Save & Exit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={handleQuit}>
              <Text style={styles.buttonText}>Quit Without Saving</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                setShowMenuPopup(false);
                playSound('chime').catch(() => {});
              }}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showQuitConfirmPopup} transparent animationType="fade" statusBarTranslucent={false}>
        <View style={styles.modalOverlay}>
          <View style={[styles.quitConfirmPopup, styles.modalShadow, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.quitConfirmTitle, { color: colors.textPrimary }]}>Quit Game?</Text>
            <Text style={[styles.quitConfirmMessage, { color: colors.textSecondary }]}>Are you sure you want to quit? The word will be revealed.</Text>
            <TouchableOpacity style={styles.quitConfirmButtonContainer} onPress={handleConfirmQuit}>
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

      <Modal visible={showWordRevealPopup} transparent animationType="fade" statusBarTranslucent={false}>
        <View style={styles.modalOverlay}>
          <View style={[styles.wordRevealPopup, styles.modalShadow, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.wordRevealTitle, { color: colors.textPrimary }]}>Game Over</Text>
            <Text style={[styles.wordRevealMessage, { color: colors.textSecondary }]}>The word was: {targetWord || 'Unknown'}</Text>
            <TouchableOpacity style={styles.wordRevealButtonContainer} onPress={handleWordRevealOk}>
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showMaxGuessesPopup} transparent animationType="fade" statusBarTranslucent={false}>
        <View style={styles.modalOverlay}>
          <View style={[styles.maxGuessesPopup, styles.modalShadow, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.maxGuessesTitle, { color: colors.textPrimary }]}>Max Guesses Reached</Text>
            <Text style={[styles.maxGuessesMessage, { color: colors.textSecondary }]}>You've reached the maximum of {MAX_GUESSES} guesses.</Text>
            <TouchableOpacity style={styles.maxGuessesButtonContainer} onPress={handlePlayAgain}>
              <Text style={styles.buttonText}>Play Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.maxGuessesButtonContainer}
              onPress={async () => {
                setShowMaxGuessesPopup(false);
                await handleReturnHome();
              }}
            >
              <Text style={styles.buttonText}>Main Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTimeUpPopup} transparent animationType="fade" statusBarTranslucent={false}>
        <View style={styles.modalOverlay}>
          <View style={[styles.maxGuessesPopup, styles.modalShadow, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.maxGuessesTitle, { color: colors.textPrimary }]}>Time's Up!</Text>
            <TouchableOpacity style={styles.maxGuessesButtonContainer} onPress={handlePlayAgain}>
              <Text style={styles.buttonText}>Play Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.maxGuessesButtonContainer}
              onPress={async () => {
                setShowTimeUpPopup(false);
                await handleReturnHome();
              }}
            >
              <Text style={styles.buttonText}>Main Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default TimedGameScreen;

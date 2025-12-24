import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Modal, Dimensions, BackHandler, Platform } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, auth } from './firebase';
import { addDoc, updateDoc, doc, collection, arrayUnion, getDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import { isValidWord } from './gameLogic';
import { getNotificationService } from './notificationService';
import notificationPermissionHelper from './notificationPermissionHelper';
import { useTheme } from './ThemeContext';
import styles from './styles';

const SetWordGameScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { challenge, isAccepting } = route.params;
  const insets = useSafeAreaInsets();
  const { updateNavigationBar, colors } = useTheme();
  
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState(null);
  const [showDifficultySelection, setShowDifficultySelection] = useState(true);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  const [showChallengeSentPopup, setShowChallengeSentPopup] = useState(false);
  const [createdGameId, setCreatedGameId] = useState(null);
  const [hardModeUnlocked, setHardModeUnlocked] = useState(false);
  const [opponentHardModeUnlocked, setOpponentHardModeUnlocked] = useState(true); // Default to true to avoid flicker

  // Calculate optimal sizing for alphabet grid to use full width
  const windowWidth = Dimensions.get('window').width;
  const isIPad = Platform.OS === 'ios' && windowWidth >= 768;
  const availableWidth = isIPad ? Math.min(windowWidth * 0.7, 600) : windowWidth - 20;
  
  // Calculate optimal letter size and spacing to maximize usage
  const getOptimalSizing = () => {
    const longestRow = 10; // QWERTY top row has 10 letters
    const minSpacing = isIPad ? 3 : 2;
    const totalSpacing = (longestRow - 1) * minSpacing; // Total spacing needed
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

  // QWERTY keyboard layout (same as GameScreen)
  const qwertyKeys = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  // Ensure navigation bar stays the correct color when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      if (updateNavigationBar) {
        updateNavigationBar();
      }
    }, [updateNavigationBar])
  );

  // Force navigation bar color when modals open/close - with delay to ensure it happens after modal renders
  useEffect(() => {
    if (updateNavigationBar) {
      // Immediate update
      updateNavigationBar();
      // Also update after a small delay to catch any system resets
      const timeout = setTimeout(() => {
        updateNavigationBar();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [showChallengeSentPopup, showMenuPopup, updateNavigationBar]);

  // If accepting a challenge, use the challenge's difficulty and skip selection
  useEffect(() => {
    if (isAccepting && challenge?.difficulty) {
      setDifficulty(challenge.difficulty);
      setShowDifficultySelection(false);
    }
  }, [isAccepting, challenge]);

  // Check hard mode unlock status when component mounts
  useEffect(() => {
    const checkUnlockStatus = async () => {
      if (showDifficultySelection) {
        const isUnlocked = await checkHardModeUnlocked();
        setHardModeUnlocked(isUnlocked);
        
        // For PvP challenges, also check opponent's unlock status
        if (!isAccepting && challenge?.to) {
          const opponentUnlocked = await checkUserHardModeUnlocked(challenge.to);
          setOpponentHardModeUnlocked(opponentUnlocked);
        } else {
          setOpponentHardModeUnlocked(true); // Solo mode or accepting challenge
        }
      }
    };
    
    checkUnlockStatus();
  }, [showDifficultySelection, isAccepting, challenge]);

  // Prevent back button from going to word submission page - always go to main screen
  useEffect(() => {
    const backAction = () => {
      // Always navigate to main screen instead of going back
      navigation.navigate('MainTabs');
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [navigation]);

  // Check if hard mode is unlocked for current user
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

  // Check if hard mode is unlocked for a specific user
  const checkUserHardModeUnlocked = async (userId) => {
    try {
      if (!userId) return false;
      
      const userDoc = await getDoc(doc(db, 'users', userId));
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
      console.error('Failed to check hard mode unlock status for user:', userId, error);
      return false;
    }
  };

  const handleSubmit = async () => {
    
    if (!word || word.trim().length < 3) {
      Alert.alert('Invalid Word', 'Please enter a word with at least 3 letters.');
      return;
    }
    
    // Industry standard: Ask for notification permissions when sending first challenge
    if (!isAccepting && auth.currentUser?.uid) {
      await notificationPermissionHelper.requestAtContext('challenge', auth.currentUser.uid);
    }

    // Validate word length based on difficulty
    const minLength = difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6;
    if (word.trim().length !== minLength) {
      Alert.alert('Invalid Word Length', `Please enter a ${minLength}-letter word for ${difficulty} difficulty.`);
      return;
    }

    // Validate word against the appropriate word list
    const wordLength = difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6;
    const isValid = await isValidWord(word.trim().toLowerCase(), wordLength);
    if (!isValid) {
      await playSound('invalidWord').catch(() => {});
      Alert.alert('Invalid Word', 'That word is not in our dictionary. Please try another word.');
      return;
    }

    setLoading(true);
    try {
                      if (isAccepting) {
            // Player 2 is accepting the challenge and setting their word
           
           // Validate challenge object has required properties
           if (!challenge.from || !challenge.to || !challenge.player1Word) {
             console.error('🔍 Challenge object missing required properties:', {
               from: challenge.from,
               to: challenge.to,
               player1Word: challenge.player1Word,
               fullChallenge: challenge
             });
             throw new Error('Challenge data is incomplete. Please try again.');
           }
           
                                 const gameData = {
            type: 'pvp',
            difficulty: difficulty,
            wordLength: difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6,
            players: [challenge.from, challenge.to],
            playerIds: [challenge.from, challenge.to],
            status: 'active',
            createdAt: new Date(),
            lastActivity: new Date(), // Add this field for ResumeGamesScreen
            lastUpdated: new Date(), // Add this field for PvPGameScreen
            currentTurn: challenge.from, // Player 1 goes first
              player1: {
                uid: challenge.from,
                username: challenge.fromUsername || challenge.from || 'Player 1',
                word: challenge.player1Word,
                guesses: [],
                solved: false,
                attempts: 0
              },
              player2: {
                uid: challenge.to,
                username: challenge.toUsername || challenge.to || 'Player 2',
                word: word.trim().toLowerCase(),
                guesses: [],
                solved: false,
                attempts: 0
              },
              gameHistory: [],
              maxAttempts: 25
            };

         
         const gameRef = await addDoc(collection(db, 'games'), gameData);
         // Update challenge status and link to game
         
         await updateDoc(doc(db, 'challenges', challenge.id), {
           status: 'accepted',
           player2Word: word.trim().toLowerCase(),
           gameId: gameRef.id,
           acceptedAt: new Date()
         });
         
         // Update only Player 2's activeGames array (Player 1 will update theirs when they enter the game)
         try {
           await updateDoc(doc(db, 'users', auth.currentUser.uid), {
             activeGames: arrayUnion(gameRef.id)
           });
         } catch (updateError) {
           console.error('🔍 Failed to update Player 2\'s activeGames array:', updateError);
         }
         
        // Send push notification to Player 1 that the game has started
        try {
          const wordLength = difficulty === 'easy' ? 4 : difficulty === 'hard' ? 6 : 5;
          await getNotificationService().sendPushNotification(
            challenge.from,
            'WhatWord',
            'Let the battle begin!',
            {
              type: 'game_started',
              gameId: gameRef.id,
              opponentId: challenge.to,
              opponentName: challenge.toUsername || 'Player 2',
              wordLength: wordLength,
              timestamp: new Date().toISOString()
            }
          );
        } catch (notificationError) {
          console.error('🔍 Failed to send game start push notification:', notificationError);
        }

        setCreatedGameId(gameRef.id);
        // Skip "Game Started" popup - go directly to PvPGame screen
        // "The Battle Has Begun!" popup will show in PvPGameScreen instead
        playSound('chime').catch(() => {});
        navigation.navigate('PvPGame', { gameId: gameRef.id });
      } else {
        // Player 1 is creating the challenge
        const challengeData = {
          type: 'pvp',
          difficulty: difficulty,
          from: challenge.from,
          fromUid: challenge.from, // add canonical uid field for listeners
          to: challenge.to,
          toUid: challenge.to, // add canonical uid field for listeners
          fromUsername: challenge.fromUsername,
          toUsername: challenge.toUsername,
          status: 'pending',
          createdAt: new Date(),
          player1Word: word.trim().toLowerCase(),
          player2Word: null,
          gameId: null
        };

        
        const challengeRef = await addDoc(collection(db, 'challenges'), challengeData);
        
        // Push notification sent from friendsService.sendGameChallenge() instead
        
        playSound('chime');
        
        // Show success message
        setShowChallengeSentPopup(true);
      }
     } catch (error) {
       console.error('Failed to submit word:', error);
       Alert.alert('Error', `Failed to submit word: ${error.message}`);
     } finally {
      setLoading(false);
    }
  };

  const selectDifficulty = async (selectedDifficulty) => {
    // Check if hard mode is locked
    if (selectedDifficulty === 'hard') {
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

      // For PvP challenges, also check if the opponent has hard mode unlocked
      if (!isAccepting && challenge?.to) {
        const opponentUnlocked = await checkUserHardModeUnlocked(challenge.to);
        if (!opponentUnlocked) {
          Alert.alert(
            'Opponent Cannot Play Hard Mode 🔒',
            'The player you want to challenge does not have Hard Mode unlocked.\n\nThey need to either:\n🏆 Reach Word Expert rank\n💎 Get premium access\n\nPlease choose Easy or Regular difficulty instead.',
            [{ text: 'OK', style: 'default' }]
          );
          return;
        }
      }
    }

    setDifficulty(selectedDifficulty);
    setShowDifficultySelection(false);
    playSound('chime').catch(() => {});
  };

  const addLetter = (letter) => {
    if (word.length < (difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6)) {
      setWord(prev => prev + letter);
      playSound('letterInput').catch(() => {});
    }
  };





  if (showDifficultySelection) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { paddingTop: insets.top }]}>
        {/* Back Button - safe area aware and always visible */}
        <TouchableOpacity
          style={{
            position: 'absolute',
            left: 12,
            top: (insets?.top || 0) + 8,
            height: 44,
            minWidth: 44,
            paddingHorizontal: 10,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onPress={() => {
            playSound('backspace').catch(() => {});
            navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={{ color: '#F59E0B', fontSize: 16, fontWeight: '600' }}>‹ Back</Text>
        </TouchableOpacity>
        
        <View style={styles.difficultyContainer}>
          <Text style={styles.header}>Choose Difficulty</Text>
          <Text style={styles.subtitle}>
            {isAccepting 
              ? `Select difficulty for your word:`
              : `Select difficulty for your challenge:`
            }
          </Text>
          
          <TouchableOpacity
            style={[styles.difficultyButton, { zIndex: 100 }]}
            onPress={() => {
              playSound('chime');
              selectDifficulty('easy');
            }}
          >
            <Text style={[styles.buttonText, { numberOfLines: 1 }]}>Easy (4 letters)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.difficultyButton, { zIndex: 100 }]}
            onPress={() => {
              playSound('chime');
              selectDifficulty('regular');
            }}
          >
            <Text style={[styles.buttonText, { numberOfLines: 1 }]}>Regular (5 letters)</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { paddingTop: insets.top }]}>

      

        {/* Header */}
        <Text style={styles.header}>
          {isAccepting ? 'Set Your Mystery Word' : 'Set Your Mystery Word'}
        </Text>
        


        {/* Word Display */}
        <View style={styles.wordContainer}>
          {Array.from({ length: difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6 }, (_, index) => (
            <View key={index} style={styles.letterBox}>
              <Text style={styles.letterText}>
                {word[index] || ''}
              </Text>
            </View>
          ))}
        </View>

                 {/* Action Buttons - Same as GameScreen */}
         <View style={styles.inputControlsPvP}>
           <TouchableOpacity
             style={[styles.backspaceButtonContainer, word.length === 0 && styles.disabledButton]}
                           onPress={() => {
                setWord(prev => prev.slice(0, -1));
                playSound('backspace').catch(() => {});
              }}
             disabled={word.length === 0}
           >
                           <Text style={[styles.buttonTextBackspace, { numberOfLines: 1 }]}>BACKSPACE</Text>
           </TouchableOpacity>
           
           <TouchableOpacity
             style={[styles.guessButtonContainer, word.length === 0 && styles.disabledButton]}
             onPress={handleSubmit}
             disabled={word.length === 0 || loading}
           >
             <Text style={styles.buttonText}>SEND</Text>
           </TouchableOpacity>
         </View>

                 {/* Alphabet Grid - Same as GameScreen */}
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
                     {row.map((letter) => (
                       <TouchableOpacity
                         key={letter}
                         style={{ 
                           width: letterSize, 
                           height: buttonHeight, 
                           marginHorizontal: spacing / 2,
                           marginVertical: 2,
                           justifyContent: 'center',
                           alignItems: 'center',
                           backgroundColor: colors.surface,
                           borderWidth: 2,
                           borderColor: colors.border,
                           borderRadius: 6
                         }}
                         onPress={() => addLetter(letter)}
                       >
                         <Text style={{ 
                           color: colors.textPrimary,
                           fontSize: Math.floor(letterSize * 0.55),
                           fontFamily: 'Roboto-Bold',
                           textAlign: 'center',
                           includeFontPadding: false
                         }}>
                           {letter}
                         </Text>
                       </TouchableOpacity>
                     ))}
                   </View>
                 ))}
           </View>
         </View>



        {/* Back Button */}
        <TouchableOpacity
          style={styles.textButton}
          onPress={() => {
            playSound('backspace').catch(() => {});
            navigation.goBack();
          }}
        >
                   <Text style={styles.textButtonText}>Cancel</Text>
       </TouchableOpacity>

     {/* Menu Popup Modal */}
     <Modal visible={showMenuPopup} transparent animationType="fade" statusBarTranslucent={false}>
       <View style={styles.modalOverlay}>
         <View style={[styles.modalContainer, styles.modalShadow]}>
           <Text style={styles.header}>Game Menu</Text>
           
           <TouchableOpacity
             style={styles.button}
             onPress={async () => {
               setShowMenuPopup(false);
               try {
                 playSound('backspace').catch(() => {});
               } catch (error) {
                 // Ignore sound errors
               }
               navigation.navigate('MainTabs');
             }}
           >
             <Text style={styles.buttonText}>Return to Home</Text>
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
     
     {/* Challenge Sent Popup Modal */}
     <Modal visible={showChallengeSentPopup} transparent animationType="fade" statusBarTranslucent={false}>
       <View style={styles.modalOverlay}>
         <View style={[styles.winPopup, styles.modalShadow]}>
           <Text style={[styles.winMessage, { color: '#E5E7EB' }]}>
             Challenge sent to {challenge.toUsername}
           </Text>
           <TouchableOpacity
             style={styles.winButtonContainer}
             onPress={() => {
               setShowChallengeSentPopup(false);
               playSound('chime').catch(() => {});
               navigation.navigate('CreateChallenge');
             }}
           >
             <Text style={styles.buttonText}>OK</Text>
           </TouchableOpacity>
         </View>
       </View>
     </Modal>
   </SafeAreaView>
 );
};

export default SetWordGameScreen;

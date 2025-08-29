import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, auth } from './firebase';
import { addDoc, updateDoc, doc, collection, arrayUnion } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import { isValidWord } from './gameLogic';
import styles from './styles';

const SetWordGameScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { challenge, isAccepting } = route.params;
  
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState(null);
  const [showDifficultySelection, setShowDifficultySelection] = useState(true);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  const [hardModeUnlocked, setHardModeUnlocked] = useState(false);
  const [opponentHardModeUnlocked, setOpponentHardModeUnlocked] = useState(true); // Default to true to avoid flicker



  // QWERTY keyboard layout (same as GameScreen)
  const qwertyKeys = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

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
      
      // Check if user has reached Word Expert rank (Regular mode average ≤ 8)
      if (regularAvg > 0 && regularAvg <= 8) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to check hard mode unlock status for user:', userId, error);
      return false;
    }
  };

  const handleSubmit = async () => {
    console.log('🔍 handleSubmit called with:', { word, difficulty, isAccepting, challenge });
    
    if (!word || word.trim().length < 3) {
      Alert.alert('Invalid Word', 'Please enter a word with at least 3 letters.');
      return;
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
           console.log('🔍 Challenge object for Player 2:', challenge);
           
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
              status: 'active',
              createdAt: new Date(),
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

         console.log('🔍 About to create game with data:', gameData);
         console.log('🔍 Current user UID:', auth.currentUser?.uid);
         console.log('🔍 Games collection path:', collection(db, 'games').path);
         
         const gameRef = await addDoc(collection(db, 'games'), gameData);
         console.log('🔍 Game created successfully:', gameRef.id);
         
         // Update challenge status and link to game
         console.log('🔍 About to update challenge:', challenge.id);
         console.log('🔍 Challenge document path:', doc(db, 'challenges', challenge.id).path);
         
         await updateDoc(doc(db, 'challenges', challenge.id), {
           status: 'accepted',
           player2Word: word.trim().toLowerCase(),
           gameId: gameRef.id,
           acceptedAt: new Date()
         });
         console.log('🔍 Challenge updated successfully');
         
         // Update both players' activeGames arrays
         try {
           // Update Player 1's activeGames array
           await updateDoc(doc(db, 'users', challenge.from), {
             activeGames: arrayUnion(gameRef.id)
           });
           
           // Update Player 2's activeGames array  
           await updateDoc(doc(db, 'users', auth.currentUser.uid), {
             activeGames: arrayUnion(gameRef.id)
           });
           
           console.log('🔍 Both players\' activeGames arrays updated successfully');
         } catch (updateError) {
           console.error('🔍 Failed to update players\' activeGames arrays:', updateError);
         }
         
         // Send notification to Player 1 that the game has started
         try {
           const notificationData = {
             type: 'gameStarted',
             from: auth.currentUser.uid,
             to: challenge.from,
             gameId: gameRef.id,
             message: `${challenge.toUsername || 'Player 2'} has accepted your challenge! The game is ready to begin.`,
             timestamp: new Date(),
             read: false
           };
           
           await addDoc(collection(db, 'notifications'), notificationData);
           console.log('🔍 Game start notification sent to Player 1');
         } catch (notificationError) {
           console.error('🔍 Failed to send game start notification:', notificationError);
         }

        Alert.alert('Game Started!', 'Both players can now play at their own pace!', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('PvPGame', { gameId: gameRef.id })
          }
        ]);
        playSound('chime');
      } else {
        // Player 1 is creating the challenge
        const challengeData = {
          type: 'pvp',
          difficulty: difficulty,
          from: challenge.from,
          to: challenge.to,
          fromUsername: challenge.fromUsername,
          toUsername: challenge.toUsername,
          status: 'pending',
          createdAt: new Date(),
          player1Word: word.trim().toLowerCase(),
          player2Word: null,
          gameId: null
        };

        console.log('🔍 About to create challenge with data:', challengeData);
        console.log('🔍 Current user UID:', auth.currentUser?.uid);
        console.log('🔍 Challenge collection path:', collection(db, 'challenges').path);
        
        const challengeRef = await addDoc(collection(db, 'challenges'), challengeData);
        
        console.log('🔍 Challenge created successfully:', challengeRef.id);
        console.log('🔍 Challenge data:', challengeData);
        console.log('🔍 Challenge document path:', challengeRef.path);
        console.log('🔍 Challenge should be visible to user:', challengeData.to);
        
        Alert.alert('Challenge Sent!', `Challenge sent to ${challenge.toUsername}!`, [
          {
            text: 'OK',
            onPress: () => navigation.navigate('CreateChallenge')
          }
        ]);
        playSound('chime');
      }
    } catch (error) {
      console.error('🔍 Failed to submit word:', error);
      console.error('🔍 Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
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
          'Hard Mode is locked. Unlock it by either:\n\n🏆 Reaching Word Expert rank\n💎 Getting premium access',
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
  };

  const addLetter = (letter) => {
    if (word.length < (difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6)) {
      setWord(prev => prev + letter);
      playSound('letterInput');
    }
  };

  const removeLetter = () => {
    if (word.length > 0) {
      setWord(prev => prev.slice(0, -1));
      playSound('backspace');
    }
  };

  const clearWord = () => {
    setWord('');
  };

  if (showDifficultySelection) {
    return (
      <View style={styles.screenContainer}>

        
        <View style={styles.difficultyContainer}>
          <Text style={styles.header}>Choose Difficulty</Text>
          <Text style={styles.subtitle}>
            {isAccepting 
              ? `Select difficulty for your word:`
              : `Select difficulty for your challenge:`
            }
          </Text>
          
          <TouchableOpacity
            style={styles.button}
            onPress={() => selectDifficulty('easy')}
          >
            <Text style={styles.buttonText}>Easy (4 letters)</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.button}
            onPress={() => selectDifficulty('regular')}
          >
            <Text style={styles.buttonText}>Regular (5 letters)</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.button, 
              (!hardModeUnlocked || !opponentHardModeUnlocked) && styles.lockedButton
            ]}
            onPress={() => {
              if (hardModeUnlocked && opponentHardModeUnlocked) {
                selectDifficulty('hard');
              } else if (!hardModeUnlocked) {
                // Show unlock popup for locked hard mode
                Alert.alert(
                  'Hard Mode Locked 🔒',
                  'Hard Mode (6-letter words) is currently locked.\n\nTo unlock it, you need to:\n\n🏆 Reach Word Expert Rank\n• Play Regular mode games (5 letters)\n• Achieve an average of 8 attempts or fewer\n\n💎 OR Get Premium Access\n• Instant unlock with premium subscription\n• Access to all game modes and features\n\nWould you like to go to your Profile to see your progress?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Go to Profile', onPress: () => navigation.navigate('Profile') }
                  ]
                );
              } else if (!opponentHardModeUnlocked) {
                // Show popup explaining opponent doesn't have access
                Alert.alert(
                  'Opponent Cannot Play Hard Mode 🔒',
                  'The player you want to challenge does not have Hard Mode unlocked yet.\n\nThey need to either:\n\n🏆 Reach Word Expert Rank\n• Play Regular mode games (5 letters)\n• Achieve an average of 8 attempts or fewer\n\n💎 OR Get Premium Access\n• Instant unlock with premium subscription\n\nPlease choose Easy or Regular difficulty instead, or wait for them to unlock Hard Mode.',
                  [{ text: 'OK', style: 'default' }]
                );
              }
            }}
          >
            <Text style={[
              styles.buttonText,
              (!hardModeUnlocked || !opponentHardModeUnlocked) && styles.lockedButtonText
            ]}>
              {!hardModeUnlocked 
                ? '🔒 Hard (6 letters) - Locked 💡' 
                : !opponentHardModeUnlocked 
                  ? '🔒 Hard (6 letters) - Opponent Locked 💡'
                  : 'Hard (6 letters)'
              }
            </Text>
          </TouchableOpacity>

          {/* Hard Mode Lock Status Message */}
          {(!hardModeUnlocked || !opponentHardModeUnlocked) && (
            <View style={styles.lockStatusContainer}>
              <Text style={styles.lockStatusText}>
                {!hardModeUnlocked 
                  ? '🔒 You need to unlock Hard Mode first'
                  : '🔒 Your opponent cannot play Hard Mode yet'
                }
              </Text>
              <Text style={styles.lockStatusSubtext}>
                {!hardModeUnlocked 
                  ? 'Reach Word Expert rank or get premium access'
                  : 'They need to reach Word Expert rank or get premium access'
                }
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screenContainer}>

      

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
             onPress={removeLetter}
             disabled={word.length === 0}
           >
             <Text style={styles.buttonTextBackspace}>BACKSPACE</Text>
           </TouchableOpacity>
           
           <TouchableOpacity
             style={[styles.guessButtonContainer, word.length === 0 && styles.disabledButton]}
             onPress={clearWord}
             disabled={word.length === 0}
           >
             <Text style={styles.buttonText}>CLEAR</Text>
           </TouchableOpacity>
         </View>

                 {/* Alphabet Grid - Same as GameScreen */}
         <View style={styles.alphabetContainer}>
           <View style={styles.alphabetGrid}>
                              {qwertyKeys.map((row, rowIndex) => (
                   <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: 5 }}>
                     {row.map((letter) => (
                       <TouchableOpacity
                         key={letter}
                         style={styles.letter}
                         onPress={() => addLetter(letter)}
                       >
                         <Text style={styles.letter}>
                           {letter}
                         </Text>
                       </TouchableOpacity>
                     ))}
                   </View>
                 ))}
           </View>
         </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.button, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {isAccepting ? 'Start Game' : 'Send Challenge'}
          </Text>
        </TouchableOpacity>

        {/* Back Button */}
        <TouchableOpacity
          style={styles.textButton}
          onPress={() => navigation.goBack()}
        >
                   <Text style={styles.textButtonText}>Cancel</Text>
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
             style={styles.button}
             onPress={() => {
               setShowMenuPopup(false);
               navigation.goBack();
             }}
           >
             <Text style={styles.buttonText}>Go Back</Text>
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
   </SafeAreaView>
 );
};

export default SetWordGameScreen;

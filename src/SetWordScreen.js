import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { db } from './firebase';
import { addDoc, updateDoc, doc, collection } from 'firebase/firestore';
// Audio mode is now handled in soundsUtil.js
import { playSound } from './soundsUtil';
import styles from './styles';

const SetWordScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { challenge, isAccepting } = route.params;
  const insets = useSafeAreaInsets();
  
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState(null);
  const [showDifficultySelection, setShowDifficultySelection] = useState(true);

  // If accepting a challenge, use the challenge's difficulty and skip selection
  useEffect(() => {
    if (isAccepting && challenge?.difficulty) {
      setDifficulty(challenge.difficulty);
      setShowDifficultySelection(false);
    }
  }, [isAccepting, challenge]);

  // Audio mode is now handled in soundsUtil.js

  const handleSubmit = async () => {
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

    setLoading(true);
    try {
      if (isAccepting) {
        // Player 2 is accepting the challenge and setting their word
        const gameData = {
          type: 'pvp',
          difficulty: difficulty,
          players: [challenge.from, challenge.to],
          status: 'active',
          createdAt: new Date(),
          player1: {
            uid: challenge.from,
            username: challenge.fromUsername,
            word: challenge.player1Word,
            guesses: [],
            solved: false
          },
          player2: {
            uid: challenge.to,
            username: challenge.toUsername,
            word: word.trim().toLowerCase(),
            guesses: [],
            solved: false
          }
        };

        const gameRef = await addDoc(collection(db, 'games'), gameData);
        
        // Update challenge status and link to game
        await updateDoc(doc(db, 'challenges', challenge.id), {
          status: 'accepted',
          player2Word: word.trim().toLowerCase(),
          gameId: gameRef.id,
          acceptedAt: new Date()
        });

        Alert.alert('Game Started!', 'Both players can now play at their own pace!', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Home')
          }
        ]);
        playSound('chime');
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
        
        
        Alert.alert('Challenge Sent!', `Challenge sent to ${challenge.toUsername}!`, [
          {
            text: 'OK',
            onPress: () => navigation.replace('ResumeGames')
          }
        ]);
        playSound('chime');
      }
    } catch (error) {
      console.error('Failed to submit word:', error);
      Alert.alert('Error', 'Failed to submit word. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectDifficulty = (selectedDifficulty) => {
    setDifficulty(selectedDifficulty);
    setShowDifficultySelection(false);
    playSound('chime');
  };

  return (
    <SafeAreaView style={styles.screenContainer}>
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
        {showDifficultySelection ? (
          <>
            <Text style={styles.header}>Choose Difficulty</Text>
            <Text style={styles.subtitle}>
              {isAccepting 
                ? `Select difficulty for your word:`
                : `Select difficulty for your challenge:`
              }
            </Text>
            
            <TouchableOpacity
              style={styles.difficultyButton}
              onPress={() => selectDifficulty('easy')}
            >
              <Text style={[styles.buttonText, { numberOfLines: 1 }]}>Easy (4 letters)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.difficultyButton}
              onPress={() => selectDifficulty('regular')}
            >
              <Text style={[styles.buttonText, { numberOfLines: 1 }]}>Regular (5 letters)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.difficultyButton}
              onPress={() => selectDifficulty('hard')}
            >
              <Text style={[styles.buttonText, { numberOfLines: 1 }]}>Hard (6 letters)</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.header}>
              {isAccepting ? 'Set Your Mystery Word' : 'Set Your Mystery Word'}
            </Text>
            
            <Text style={styles.subtitle}>
              {isAccepting 
                ? `Enter a ${difficulty} word (${difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6} letters) for ${challenge.fromUsername} to guess:`
                : `Enter a ${difficulty} word (${difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6} letters) for ${challenge.toUsername} to guess:`
              }
            </Text>

            <TextInput
              style={styles.input}
              placeholder={`Enter ${difficulty} word...`}
              placeholderTextColor="#9CA3AF"
              value={word}
              onChangeText={setWord}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={difficulty === 'easy' ? 4 : difficulty === 'regular' ? 5 : 6}
            />


          </>
        )}

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.difficultyButton, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>SEND</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.textButton}
          onPress={() => {
            playSound('backspace').catch(() => {});
            navigation.goBack();
          }}
        >
          <Text style={styles.textButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default SetWordScreen;

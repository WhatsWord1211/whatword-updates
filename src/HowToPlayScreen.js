import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styles from './styles';
import { playSound } from './soundsUtil';

const HowToPlayScreen = () => {
  const navigation = useNavigation();
  const [step, setStep] = useState(0);

  // QWERTY keyboard layout for dummy alphabet grid
  const qwertyKeys = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  // Dummy alphabet state for first grid (eliminated letters)
  const dummyAlphabetEliminated = Array(26).fill('unknown');
  dummyAlphabetEliminated['A'.charCodeAt(0) - 65] = 'absent'; // A as eliminated
  dummyAlphabetEliminated['B'.charCodeAt(0) - 65] = 'absent'; // B as eliminated

  // Dummy alphabet state for second grid (present letters)
  const dummyAlphabetPresent = Array(26).fill('unknown');
  dummyAlphabetPresent['T'.charCodeAt(0) - 65] = 'present'; // T as present
  dummyAlphabetPresent['O'.charCodeAt(0) - 65] = 'present'; // O as present

  // Calculate max width for grid based on screen size
  const windowWidth = Dimensions.get('window').width;

  const steps = [
    {
      title: 'Welcome to',
      description: (
        <View style={{ alignItems: 'center', width: '100%', paddingHorizontal: 5 }}>
          <Image
            source={require('../assets/images/WhatsWord-header.png')}
            style={{ width: 300, height: 150, resizeMode: 'contain' }}
          />
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22, marginBottom: 20 }]}>
            1. Pick a word you think will stump your opponent.
          </Text>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22, marginBottom: 20 }]}>
            2. Solve their word before they solve yours.
          </Text>
        </View>
      ),
    },
    
    {
      title: 'Understanding Feedback',
      description: (
        <View style={{ width: '100%', paddingHorizontal: 5 }}>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22, marginBottom: 20 }]}>
            1. After each guess, you'll get feedback on which letters are in the mystery word.
          </Text>
          <View style={[styles.feedbackGuide, { flexDirection: 'column' }]}>
            <View style={[styles.feedbackItem, { marginBottom: 20 }]}>
              <View style={[styles.feedbackCircle, {marginTop: 10 }] } />
              <Text style={[styles.feedbackText, { color: '#FFFFFF', marginTop: 10, fontSize: 22 }]}>
                Correct Letter - Wrong Spot
              </Text>
            </View>
            <View style={styles.feedbackItem}>
              <View style={[styles.feedbackDot,{ marginBottom: 20}]} />
              <Text style={[styles.feedbackText, { color: '#FFFFFF', marginBottom: 20, fontSize: 22 }]}>
                Correct Letter - Right Spot
              </Text>
            </View>
          </View>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22, marginBottom: 20 }]}>
            2. If you don't get any feedback, none of the letters in your guess are in the mystery word.
          </Text>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22, marginBottom: 20 }]}>
            3. Your job is to figure out where each letter belongs!
          </Text>
        </View>
      ),
    },
    {
      title: 'Toggling Letters',
      description: (
        <View style={{ width: windowWidth, paddingHorizontal: 5, margin: 0 }}>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22, marginBottom: 15, marginHorizontal: 0 }]}>
            Long-press a letter to shade what letters you think you've eliminated.
          </Text>
          <View style={[styles.alphabetContainer, { marginBottom: 10, padding: 0, margin: 0, width: windowWidth }]}>
            <View style={[styles.alphabetGrid, { width: windowWidth, alignSelf: 'center', padding: 0, margin: 0, flexShrink: 1 }]}>
              {qwertyKeys.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 2 }}>
                  {row.map((letter) => {
                    const index = letter.charCodeAt(0) - 65;
                    return (
                      <View key={letter} style={{ margin: 1 }}>
                        <Text style={[styles.letter, dummyAlphabetEliminated[index] === 'absent' && styles.eliminatedLetter, { fontSize: 16, margin: 1 }]}>
                          {letter}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22, marginBottom: 15, marginHorizontal: 0 }]}>
            Long-press again to mark letters you think are in the word.
          </Text>
          <View style={[styles.alphabetContainer, { marginBottom: 10, padding: 0, margin: 0, width: windowWidth }]}>
            <View style={[styles.alphabetGrid, { width: windowWidth, alignSelf: 'center', padding: 0, margin: 0, flexShrink: 1 }]}>
              {qwertyKeys.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 2 }}>
                  {row.map((letter) => {
                    const index = letter.charCodeAt(0) - 65;
                    return (
                      <View key={letter} style={{ margin: 1 }}>
                        <Text style={[styles.letter, dummyAlphabetPresent[index] === 'present' && styles.presentLetter, dummyAlphabetEliminated[index] === 'absent' && styles.eliminatedLetter, { fontSize: 16, margin: 1 }]}>
                          {letter}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22, marginHorizontal: 0 }]}>
            Another long-press returns to normal. 
          </Text>
        </View>
      ),
    },
    {
      title: 'Solo Mode',
      description: (
        <View style={{ width: '100%', paddingHorizontal: 5 }}>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', marginBottom: 30, fontSize: 22 }]}>
            Test your skills in solo mode. Solve mystery words and climb the leaderboard by keeping your average guesses low.
          </Text>
          <Text style={[styles.tutorialText, { color: '#FFFFFF', fontSize: 22 }]}>
            Use up to three hints to reveal letters. Using a hint disqualifies that game from the leaderboard. Use them wisely. Good luck!
          </Text>
        </View>
      ),
    },
  ];

  useEffect(() => {
    const checkFirstLogin = async () => {
      try {
        const hasLaunched = await AsyncStorage.getItem('hasLaunched');
        if (!hasLaunched) {
          await AsyncStorage.setItem('hasLaunched', 'true');
        }
      } catch (error) {
        console.error('HowToPlayScreen: Failed to check or set first login', error);
      }
    };
    checkFirstLogin();
  }, []);

  const handleNext = async () => {
    try {
      await playSound('chime');
      if (step < steps.length - 1) {
        setStep(step + 1);
      } else {
        navigation.navigate('Home');
      }
    } catch (error) {
      console.error('HowToPlayScreen: Failed to play chime sound', error);
    }
  };

  const handleBack = async () => {
    try {
      await playSound('chime');
      navigation.navigate('Home');
    } catch (error) {
      console.error('HowToPlayScreen: Failed to play chime sound', error);
    }
  };

  const handleBackOtherPages = async () => {
    try {
      await playSound('chime');
      setStep(step - 1);
    } catch (error) {
      console.error('HowToPlayScreen: Failed to play chime sound', error);
    }
  };

  return (
    <SafeAreaView style={[styles.screenContainer, { padding: 0 }]}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          padding: 5,
          justifyContent: 'space-between',
        }}
        horizontal={false}
      >
        <View style={{ alignItems: 'center', width: '100%' }}>
          <Text style={[styles.header, { color: '#FFFFFF', fontSize: 28 }]}>
            {steps[step].title}
          </Text>
          {steps[step].description}
        </View>
        <View style={{ alignItems: 'center', marginTop: 20 }}>
          <TouchableOpacity
            style={[styles.button, { marginBottom: 10 }]}
            onPress={handleNext}
          >
            <Text style={[styles.buttonText, { color: '#FFFFFF', fontSize: 20 }]}>
              {step < steps.length - 1 ? 'Next' : 'Start Playing'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={step === 0 ? handleBack : handleBackOtherPages}
          >
            <Text style={[styles.buttonText, { color: '#FFFFFF', fontSize: 20 }]}>
              {step === 0 ? 'Home' : 'Back'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default HowToPlayScreen;
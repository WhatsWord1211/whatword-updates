import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Dimensions, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoView, useVideoPlayer } from 'expo-video';
import styles from './styles';
import { playSound } from './soundsUtil';
import ThreeDGreenDot from './ThreeDGreenDot';

const HowToPlayScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  
  // Video player setup
  const player = useVideoPlayer(require('../assets/images/how-to-video.mp4'), player => {
    player.loop = true;
    player.muted = false;
  });

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

  const steps = [
    {
      title: 'Welcome To',
      description: (
        <View style={{ alignItems: 'center', width: '100%', paddingHorizontal: 5 }}>
          <Image
            source={require('../assets/images/WhatWord-header.png')}
            style={{ width: 200, height: 80, marginBottom: 20 }}
            resizeMode="contain"
          />
          <Text style={{ color: '#FFFFFF', fontSize: 20, marginBottom: 15, textAlign: 'center' }}>
            1. Pick a word you think will stump your opponent.
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 20, marginBottom: 20, textAlign: 'center' }}>
            2. Solve their word before they solve yours.
          </Text>
          <TouchableOpacity
            style={styles.videoButton}
            onPress={() => setShowVideo(true)}
          >
            <Text style={styles.videoButtonText}>📹 Watch How-To Video</Text>
          </TouchableOpacity>
        </View>
      ),
    },
    
    {
      title: 'Understanding Feedback',
      description: (
        <View style={{ width: '100%', paddingHorizontal: 5 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, marginBottom: 15, textAlign: 'center' }}>
            1. After each guess, you'll get feedback on which letters are in the mystery word.
          </Text>
          <View style={{ flexDirection: 'column', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, marginTop: 15 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#8B5CF6', backgroundColor: 'transparent', marginRight: 10 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 20 }}>
                Correct Letter - Wrong Spot
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <ThreeDGreenDot size={20} style={{ marginRight: 10 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 20 }}>
                Correct Letter - Right Spot
              </Text>
            </View>
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 20, marginBottom: 15, textAlign: 'center' }}>
            2. If you don't get any feedback, none of the letters in your guess are in the mystery word.
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 20, marginBottom: 15, textAlign: 'center' }}>
            3. Your job is to figure out where each letter belongs!
          </Text>
        </View>
      ),
    },
    {
      title: 'Toggling Letters',
      description: (
        <View style={{ width: '100%', paddingHorizontal: 5 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, marginBottom: 15, textAlign: 'center' }}>
            Long-press a letter to shade what letters you think you've eliminated.
          </Text>
          <View style={[styles.alphabetContainer, { marginBottom: 10, padding: 0, margin: 0, width: '100%' }]}>
            <View style={[styles.alphabetGrid, { width: '100%', alignSelf: 'center', padding: 0, margin: 0, flexShrink: 1 }]}>
              {qwertyKeys.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 2 }}>
                  {row.map((letter) => {
                    const index = letter.charCodeAt(0) - 65;
                    return (
                      <View key={letter} style={[styles.letter, dummyAlphabetEliminated[index] === 'absent' && styles.eliminatedLetter, { fontSize: 16, margin: 1 }]}>
                        <Text style={{ color: '#E5E7EB', textAlign: 'center', lineHeight: 30 }}>
                          {letter}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 18, marginBottom: 15, textAlign: 'center' }}>
            Long-press again to mark letters you think are in the word.
          </Text>
          <View style={[styles.alphabetContainer, { marginBottom: 10, padding: 0, margin: 0, width: '100%' }]}>
            <View style={[styles.alphabetGrid, { width: '100%', alignSelf: 'center', padding: 0, margin: 0, flexShrink: 1 }]}>
              {qwertyKeys.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 2 }}>
                  {row.map((letter) => {
                    const index = letter.charCodeAt(0) - 65;
                    return (
                      <View key={letter} style={[styles.letter, dummyAlphabetPresent[index] === 'present' && styles.presentLetter, dummyAlphabetEliminated[index] === 'absent' && styles.eliminatedLetter, { fontSize: 16, margin: 1 }]}>
                        <Text style={{ color: '#E5E7EB', textAlign: 'center', lineHeight: 30 }}>
                          {letter}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 20, textAlign: 'center' }}>
            Another long-press returns to normal. 
          </Text>
        </View>
      ),
    },
    {
      title: 'Solo Mode',
      description: (
        <View style={{ width: '100%', paddingHorizontal: 5 }}>
          <Text style={{ color: '#FFFFFF', marginBottom: 20, fontSize: 20, textAlign: 'center' }}>
            Test your skills in solo mode. Solve mystery words and climb the leaderboard by keeping your average guesses low.
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 20, textAlign: 'center' }}>
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
        navigation.navigate('MainTabs');
      }
    } catch (error) {
      console.error('HowToPlayScreen: Failed to play chime sound', error);
    }
  };

  const handleBack = async () => {
    try {
      await playSound('chime');
      navigation.navigate('MainTabs');
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

  // Video functions removed

  // Debug logging

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { padding: 0, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          padding: 20,
          justifyContent: 'space-between',
        }}
        horizontal={false}
      >
        <View style={{ alignItems: 'center', width: '100%' }}>
          <Text style={{ 
            color: '#FFFFFF', 
            fontSize: 28, 
            fontWeight: 'bold',
            marginBottom: 20,
            textAlign: 'center'
          }}>
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
      
      {/* Video Modal */}
      <Modal
        visible={showVideo}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowVideo(false)}
      >
        <View style={styles.videoModalOverlay}>
          <View style={styles.videoContainer}>
            <VideoView
              style={styles.video}
              player={player}
              fullscreenOptions={{ allowsFullscreen: true }}
              allowsPictureInPicture={true}
            />
            <TouchableOpacity
              style={styles.videoCloseButton}
              onPress={() => {
                setShowVideo(false);
                player.pause();
              }}
            >
              <Text style={styles.videoCloseButtonText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default HowToPlayScreen;
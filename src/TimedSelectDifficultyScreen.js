import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import styles from './styles';
import { playSound } from './soundsUtil';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

const TimedSelectDifficultyScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [hardModeUnlocked, setHardModeUnlocked] = useState(false);

  useEffect(() => {
    const verifyHardMode = async () => {
      const unlocked = await checkHardModeUnlocked();
      setHardModeUnlocked(unlocked);
    };

    verifyHardMode().catch(error => {
      console.error('TimedSelectDifficultyScreen: Failed to verify hard mode status:', error);
    });
  }, []);

  const checkHardModeUnlocked = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return false;

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) return false;

      const userData = userDoc.data();

      if (userData.isPremium) return true;

      const regularAvg = userData.regularAverageScore || 0;
      const regularGamesCount = userData.regularGamesCount || 0;

      return regularAvg > 0 && regularAvg <= 10 && regularGamesCount >= 15;
    } catch (error) {
      console.error('TimedSelectDifficultyScreen: Failed to check hard mode unlock status:', error);
      return false;
    }
  };

  const handleDifficultySelect = async (difficulty) => {
    try {
      if (isLoading) return;

      if (difficulty === 'hard' && !hardModeUnlocked) {
        Alert.alert(
          'Hard Mode Locked 🔒',
          'Hard Mode is locked.\n\n🏆 Reach Word Expert rank:\n• Play 15+ Regular mode games\n• Achieve average of 10 attempts or fewer\n\n💎 Or get premium access for instant unlock.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Profile', onPress: () => navigation.navigate('Profile') }
          ]
        );
        return;
      }

      const wordLength = difficulty === 'easy' ? 4 : difficulty === 'hard' ? 6 : 5;

      setIsLoading(true);
      await playSound('chime').catch(() => {});

      navigation.navigate('TimedGame', {
        difficulty,
        wordLength,
      });

      setIsLoading(false);
    } catch (error) {
      console.error('TimedSelectDifficultyScreen: Failed to select difficulty:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Failed to start timed mode. Please try again.');
    }
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.screenContainer, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]}>
      <StatusBar hidden={false} barStyle="light-content" />
      <View style={{ width: '100%', paddingHorizontal: 24 }}>
        <TouchableOpacity
          style={styles.resumeBackButton}
          onPress={() => {
            playSound('backspace').catch(() => {});
            navigation.goBack();
          }}
        >
          <Text style={styles.resumeBackButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.header, { color: colors.textPrimary, textAlign: 'center', marginTop: 24 }]}>Timed Mode</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 8, fontSize: 16 }}>
          Pick a difficulty and beat the 3-minute clock.
        </Text>
      </View>

      <View style={{ width: '100%', paddingHorizontal: 24, marginTop: 40 }}>
        <TouchableOpacity
          style={[styles.button, isLoading && styles.disabledButton]}
          activeOpacity={0.8}
          onPress={() => handleDifficultySelect('easy')}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Easy (4 Letters)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.disabledButton, { marginTop: 24 }]}
          activeOpacity={0.8}
          onPress={() => handleDifficultySelect('regular')}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Regular (5 Letters)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            { marginTop: 24 },
            !hardModeUnlocked && styles.lockedButton,
            isLoading && styles.disabledButton,
          ]}
          activeOpacity={0.8}
          onPress={() => handleDifficultySelect('hard')}
          disabled={isLoading}
        >
          <Text style={[styles.buttonText, !hardModeUnlocked && styles.lockedButtonText]}>
            {hardModeUnlocked ? 'Hard (6 Letters)' : '🔒 Hard (6 Letters)'}
          </Text>
          {!hardModeUnlocked && (
            <Text style={[styles.sectionSubtitle, { textAlign: 'center', marginTop: 6 }]}>Unlock via rank or premium</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default TimedSelectDifficultyScreen;

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import styles from './styles';
import { playSound } from './soundsUtil';

const TimedSelectDifficultyScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [isLoading, setIsLoading] = useState(false);

  const handleDifficultySelect = async (difficulty) => {
    try {
      if (isLoading) return;

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
          How many times in a row can you beat the clock?
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
      </View>
    </SafeAreaView>
  );
};

export default TimedSelectDifficultyScreen;

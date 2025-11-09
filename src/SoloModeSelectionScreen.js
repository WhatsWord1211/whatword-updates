import React from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import styles from './styles';
import { playSound } from './soundsUtil';

const SoloModeSelectionScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const handleNormalMode = async () => {
    try {
      await playSound('chime').catch(() => {});
      navigation.navigate('Game', {
        gameMode: 'solo',
        showDifficulty: true,
      });
    } catch (error) {
      console.error('SoloModeSelectionScreen: Failed to launch normal mode:', error);
    }
  };

  const handleTimedMode = async () => {
    try {
      await playSound('chime').catch(() => {});
      navigation.navigate('TimedSelectDifficulty');
    } catch (error) {
      console.error('SoloModeSelectionScreen: Failed to launch timed mode:', error);
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
        <Text style={[styles.header, { color: colors.textPrimary, textAlign: 'center', marginTop: 24 }]}>Play Solo</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 8, fontSize: 16 }}>
          Choose how you want to play.
        </Text>
      </View>

      <View style={{ width: '100%', paddingHorizontal: 24, marginTop: 40 }}>
        <TouchableOpacity
          style={[styles.button, { marginBottom: 20 }]}
          activeOpacity={0.8}
          onPress={handleNormalMode}
        >
          <Text style={styles.buttonText}>Normal Mode</Text>
          <Text
            style={[
              styles.sectionSubtitle,
              {
                textAlign: 'center',
                marginTop: 6,
                fontSize: 18,
                color: '#FFFFFF',
                textShadowColor: '#000000',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 3,
              },
            ]}
          >
            Classic solo experience
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.8}
          onPress={handleTimedMode}
        >
          <Text style={styles.buttonText}>Timed Mode</Text>
          <Text
            style={[
              styles.sectionSubtitle,
              {
                textAlign: 'center',
                marginTop: 6,
                fontSize: 18,
                color: '#FFFFFF',
                textShadowColor: '#000000',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 3,
              },
            ]}
          >
            Beat the clock in 3 minutes
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default SoloModeSelectionScreen;

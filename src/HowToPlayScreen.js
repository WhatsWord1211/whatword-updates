import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const HowToPlayScreen = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How To Play</Text>
      <Text style={styles.description}>
        Guess the word by entering letters. Green dots mean correct letters in the correct spot. Blue circles mean correct letters in the wrong spot.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  description: {
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#F59E0B',
    width: '80%',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#1F2937',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 18,
  },
});

export default HowToPlayScreen;
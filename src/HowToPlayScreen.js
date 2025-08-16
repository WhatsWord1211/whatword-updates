import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const HowToPlayScreen = () => {
  const navigation = useNavigation();

  return (
    <View style={{ flex: 1, backgroundColor: '#1F2937', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 20 }}>How To Play</Text>
      <Text style={{ color: '#FFFFFF', marginBottom: 20, textAlign: 'center' }}>
        Guess the word by entering letters. Green dots mean correct letters in the correct spot. Blue circles mean correct letters in the wrong spot.
      </Text>
      <TouchableOpacity
        style={{ backgroundColor: '#3B82F6', width: '80%', paddingVertical: 12, borderRadius: 8 }}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: 'bold', fontSize: 18 }}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
};

export default HowToPlayScreen;
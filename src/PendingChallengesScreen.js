import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const PendingChallengesScreen = () => {
  const navigation = useNavigation();
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const challengesQuery = query(
      collection(db, 'challenges'),
      where('toUid', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(challengesQuery, (snapshot) => {
      const challenges = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingChallenges(challenges);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const acceptChallenge = async (challenge) => {
    try {
      // Navigate to SetWordGameScreen to set the mystery word
      navigation.navigate('SetWordGame', {
        challenge: challenge,
        isAccepting: true
      });
    } catch (error) {
      console.error('Failed to accept challenge:', error);
      Alert.alert('Error', 'Failed to accept challenge. Please try again.');
    }
  };

  const declineChallenge = async (challenge) => {
    try {
      // Update challenge status to declined
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'declined',
        declinedAt: new Date()
      });
      
      Alert.alert('Declined', 'Challenge declined.');
      playSound('chime');
    } catch (error) {
      console.error('Failed to decline challenge:', error);
      Alert.alert('Error', 'Failed to decline challenge. Please try again.');
    }
  };

  const renderChallenge = ({ item }) => (
    <View style={styles.challengeItem}>
      <View style={styles.challengeInfo}>
        <Text style={styles.challengeUsername}>
          {item.fromUsername || 'Unknown User'}
        </Text>
        <Text style={styles.challengeEmail}>Challenges you to a duel!</Text>
        {item.difficulty && (
          <Text style={styles.challengeDifficulty}>
            Difficulty: {item.difficulty.charAt(0).toUpperCase() + item.difficulty.slice(1)}
          </Text>
        )}
      </View>
      <View style={styles.challengeActions}>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => acceptChallenge(item)}
        >
          <Text style={styles.buttonText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={() => declineChallenge(item)}
        >
          <Text style={styles.buttonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screenContainer}>
      <Text style={styles.header}>Game Challenges</Text>
      
      {pendingChallenges.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No pending challenges</Text>
          <Text style={styles.emptySubtext}>When someone challenges you to a PvP game, it will appear here.</Text>
        </View>
      ) : (
        <View style={styles.challengesContainer}>
          <Text style={styles.resultsTitle}>Pending Challenges ({pendingChallenges.length})</Text>
          <FlatList
            data={pendingChallenges}
            renderItem={renderChallenge}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* Back Button */}
      <TouchableOpacity
        style={styles.textButton}
        onPress={() => {
          playSound('backspace');
          navigation.goBack();
        }}
      >
        <Text style={styles.textButtonText}>Back to Friends</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default PendingChallengesScreen;

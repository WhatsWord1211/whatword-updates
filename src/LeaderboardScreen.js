import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import styles from './styles';

const LeaderboardScreen = () => {
  const navigation = useNavigation();
  const currentUserId = auth.currentUser?.uid || 'Anonymous';
  const [leaderboard, setLeaderboard] = useState([]);
  const [playerRank, setPlayerRank] = useState(null);
  const [playerAverage, setPlayerAverage] = useState(null);
  const [playerDisplayName, setPlayerDisplayName] = useState('Guest');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        // Fetch current user's displayName
        if (currentUserId !== 'Anonymous') {
          const userDoc = await getDoc(doc(db, 'users', currentUserId));
          if (userDoc.exists()) {
            setPlayerDisplayName(userDoc.data().username || auth.currentUser?.displayName || 'Guest');
          }
        }

        // Fetch solo mode scores
        const q = query(
          collection(db, 'leaderboard'),
          where('mode', '==', 'solo'),
          orderBy('timestamp', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const scores = querySnapshot.docs.map(doc => doc.data());

        // Group scores by userId
        const groupedScores = {};
        scores.forEach(score => {
          const userId = score.userId || 'Anonymous';
          if (!groupedScores[userId]) groupedScores[userId] = [];
          groupedScores[userId].push(score);
        });

        // Fetch display names for all users
        const userIds = Object.keys(groupedScores).filter(id => id !== 'Anonymous');
        const userDocs = await Promise.all(
          userIds.map(userId => getDoc(doc(db, 'users', userId)))
        );
        const displayNames = {};
        userDocs.forEach(doc => {
          if (doc.exists()) {
            displayNames[doc.id] = doc.data().username || 'Guest';
          }
        });

        // Calculate rolling average for each user (last 15 games)
        const averages = Object.keys(groupedScores)
          .filter(userId => userId !== 'Anonymous')
          .map(userId => {
            const userScores = groupedScores[userId]
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
              .slice(0, 15);
            const average = userScores.length > 0
              ? userScores.reduce((sum, score) => sum + score.guesses, 0) / userScores.length
              : null;
            return { 
              userId, 
              displayName: displayNames[userId] || 'Guest', 
              average: average ? average.toFixed(1) : 'N/A', 
              games: userScores.length 
            };
          })
          .filter(entry => entry.average !== 'N/A')
          .sort((a, b) => parseFloat(a.average) - parseFloat(b.average))
          .slice(0, 10);

        setLeaderboard(averages);

        // Calculate current player's rank and average
        if (currentUserId !== 'Anonymous') {
          const userScores = groupedScores[currentUserId]
            ? groupedScores[currentUserId]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 15)
            : [];
          if (userScores.length > 0) {
            const playerAvg = userScores.reduce((sum, score) => sum + score.guesses, 0) / userScores.length;
            setPlayerAverage(playerAvg.toFixed(1));
            const allAverages = Object.keys(groupedScores)
              .filter(userId => userId !== 'Anonymous')
              .map(userId => {
                const scores = groupedScores[userId]
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .slice(0, 15);
                return {
                  userId,
                  average: scores.length > 0
                    ? scores.reduce((sum, score) => sum + score.guesses, 0) / scores.length
                    : null,
                };
              })
              .filter(entry => entry.average !== null)
              .sort((a, b) => a.average - b.average);
            const rank = allAverages.findIndex(entry => entry.userId === currentUserId) + 1;
            setPlayerRank(rank > 0 ? rank : null);
          } else {
            setPlayerAverage('N/A');
            setPlayerRank(null);
          }
        }
      } catch (error) {
        console.error('LeaderboardScreen: Error fetching leaderboard', error);
      }
    };
    fetchLeaderboard();
  }, [currentUserId]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Leaderboard</Text>
      </View>
      <Text style={styles.subtitle}>Top 10 Players (Solo Mode, Last 15 Games)</Text>
      {leaderboard.length === 0 ? (
        <Text style={styles.subtitle}>No scores yet!</Text>
      ) : (
        leaderboard.map((entry, idx) => (
          <View key={idx} style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>
              #{idx + 1} {entry.displayName}: {entry.average} guesses ({entry.games} games)
            </Text>
          </View>
        ))
      )}
      {currentUserId !== 'Anonymous' && (
        <View style={{ marginVertical: 20 }}>
          <Text style={styles.sectionTitle}>
            Your Rank: {playerRank ? `#${playerRank}` : 'N/A'}
          </Text>
          <Text style={styles.sectionTitle}>
            Your Average: {playerAverage} guesses
          </Text>
          <Text style={styles.sectionTitle}>
            Name: {playerDisplayName}
          </Text>
        </View>
      )}
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.buttonText}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
};

export default LeaderboardScreen;
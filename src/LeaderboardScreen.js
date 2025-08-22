import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, RefreshControl } from 'react-native';
import { db, auth } from './firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, where } from 'firebase/firestore';
import styles from './styles';

const LeaderboardScreen = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [userRank, setUserRank] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadLeaderboard();
      }
    });

    return unsubscribe;
  }, []);

  const loadLeaderboard = async () => {
    try {
      // Get all users to calculate running averages
      const usersQuery = query(collection(db, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      
      // Calculate running averages for each user
      const leaderboardData = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        
        // Get user's last 15 games from leaderboard collection
        const leaderboardQuery = query(
          collection(db, 'leaderboard'),
          where('userId', '==', userDoc.id),
          orderBy('timestamp', 'desc'),
          limit(15)
        );
        
        try {
          const gamesSnapshot = await getDocs(leaderboardQuery);
          const recentGames = gamesSnapshot.docs.map(doc => doc.data());
          
          if (recentGames.length > 0) {
            // Calculate running average of attempts
            const totalAttempts = recentGames.reduce((sum, game) => sum + game.guesses, 0);
            const runningAverage = totalAttempts / recentGames.length;
            
            leaderboardData.push({
              id: userDoc.id,
              ...userData,
              runningAverage: runningAverage,
              gamesCount: recentGames.length
            });
          }
        } catch (error) {
          console.error(`Failed to get games for user ${userDoc.id}:`, error);
        }
      }
      
      // Sort by running average (lowest is best)
      leaderboardData.sort((a, b) => a.runningAverage - b.runningAverage);
      
      // Add ranks and limit to top 100
      const topPlayers = leaderboardData.slice(0, 100).map((player, index) => ({
        ...player,
        rank: index + 1
      }));
      
      setLeaderboard(topPlayers);

      // Find current user's rank
      if (user) {
        const userRank = leaderboardData.find(player => player.uid === user.uid);
        if (userRank) {
          setUserRank(userRank);
        } else {
          // User not in top 100, calculate their rank from full list
          const userPosition = leaderboardData.find(player => player.uid === user.uid);
          if (userPosition) {
            // Calculate rank from full sorted list
            const userIndex = leaderboardData.findIndex(player => player.uid === user.uid);
            setUserRank({
              ...userPosition,
              rank: userIndex + 1
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  };

  const renderLeaderboardItem = ({ item, index }) => (
    <View style={[
      styles.leaderboardItem,
      item.uid === user?.uid && styles.currentUserItem
    ]}>
      <View style={styles.rankContainer}>
        <Text style={[
          styles.rankText,
          index < 3 ? styles.topRankText : null
        ]}>
          #{item.rank}
        </Text>
        {index < 3 && (
          <Text style={styles.medal}>
            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
          </Text>
        )}
      </View>
      
      <View style={styles.playerInfo}>
        <Text style={[
          styles.playerName,
          item.uid === user?.uid && styles.currentUserName
        ]}>
          {item.username || item.displayName || 'Unknown Player'}
        </Text>
        <Text style={styles.playerStats}>
          Games: {item.gamesPlayed || 0} | Wins: {item.gamesWon || 0}
        </Text>
      </View>
      
      <View style={styles.scoreContainer}>
        <Text style={[
          styles.scoreText,
          index < 3 ? styles.topScoreText : null
        ]}>
          {item.runningAverage ? item.runningAverage.toFixed(1) : 'N/A'}
        </Text>
        <Text style={styles.scoreLabel}>Avg Attempts</Text>
        <Text style={styles.gamesCountText}>
          ({item.gamesCount || 0} games)
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screenContainer}>
      {/* FAB */}
      <TouchableOpacity 
        style={styles.fabTop} 
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.fabText}>🏠</Text>
      </TouchableOpacity>
      
      <ScrollView 
        style={{ flex: 1, width: '100%' }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.header}>Leaderboard</Text>
        
        {/* Current User's Position */}
        {userRank && (
          <View style={styles.userRankContainer}>
            <Text style={styles.userRankTitle}>Your Position</Text>
            <View style={[styles.leaderboardItem, styles.currentUserItem]}>
              <View style={styles.rankContainer}>
                <Text style={styles.rankText}>#{userRank.rank}</Text>
              </View>
              
              <View style={styles.playerInfo}>
                <Text style={styles.currentUserName}>
                  {userRank.username || userRank.displayName || 'You'}
                </Text>
                <Text style={styles.playerStats}>
                  Games: {userRank.gamesPlayed || 0} | Wins: {userRank.gamesWon || 0}
                </Text>
              </View>
              
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreText}>
                  {userRank.runningAverage ? userRank.runningAverage.toFixed(1) : 'N/A'}
                </Text>
                <Text style={styles.scoreLabel}>Avg Attempts</Text>
                <Text style={styles.gamesCountText}>
                  ({userRank.gamesCount || 0} games)
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Top Players */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Players</Text>
          <FlatList
            data={leaderboard}
            renderItem={renderLeaderboardItem}
            keyExtractor={item => item.uid}
            scrollEnabled={false}
            style={{ maxHeight: 400 }}
          />
        </View>

        {/* How to Improve */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>💡 How to Improve Your Rank</Text>
          <Text style={styles.tipText}>• Solve words in fewer attempts to lower your average</Text>
          <Text style={styles.tipText}>• Play consistently to maintain a good running average</Text>
          <Text style={styles.tipText}>• Challenge friends to PvP games</Text>
          <Text style={styles.tipText}>• Use hints strategically to reduce guess count</Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default LeaderboardScreen;
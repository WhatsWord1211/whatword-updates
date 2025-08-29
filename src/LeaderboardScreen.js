import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, RefreshControl, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, where, updateDoc } from 'firebase/firestore';
import styles from './styles';

const LeaderboardScreen = () => {
  const navigation = useNavigation();
  const [soloLeaderboard, setSoloLeaderboard] = useState([]);
  const [pvpLeaderboard, setPvpLeaderboard] = useState([]);
  const [userSoloRank, setUserSoloRank] = useState(null);
  const [userPvpRank, setUserPvpRank] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('solo'); // 'solo' or 'pvp'
  const [activeDifficulty, setActiveDifficulty] = useState('regular'); // 'easy', 'regular', or 'hard'
  const [userFriends, setUserFriends] = useState([]);
  const [hardModeUnlocked, setHardModeUnlocked] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadUserFriends(currentUser);
        loadLeaderboards(currentUser);
        checkHardModeUnlock(currentUser);
      }
    });

    return unsubscribe;
  }, []);

  // Refresh leaderboard when screen comes into focus or difficulty changes
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        loadUserFriends(user);
        loadLeaderboards(user);
      }
    }, [user, activeDifficulty])
  );

  // Check hard mode unlock status
  const checkHardModeUnlock = async (currentUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setHardModeUnlocked(userData.hardModeUnlocked || false);
      }
    } catch (error) {
      console.error('LeaderboardScreen: Failed to check hard mode unlock status:', error);
    }
  };

  // Handle difficulty tab selection
  const handleDifficultyChange = (difficulty) => {
    if (difficulty === 'hard' && !hardModeUnlocked) {
      // Show alert that hard mode is locked
      Alert.alert(
        'Hard Mode Locked',
        'You need to win 10 regular mode games to unlock hard mode!',
        [{ text: 'OK' }]
      );
      return;
    }
    setActiveDifficulty(difficulty);
  };


  const loadUserFriends = async (currentUser) => {
    try {
      console.log('LeaderboardScreen: Loading user friends for:', currentUser.uid);
      // Get user's friends from the main user document
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (!userDoc.exists()) {
        console.log('LeaderboardScreen: User document not found');
        setUserFriends([]);
        return;
      }
      
      const userData = userDoc.data();
      const friendIds = userData.friends || [];
      
      console.log('LeaderboardScreen: Found friend IDs:', friendIds);
      
      const friends = [];
      for (const friendId of friendIds) {
        try {
          const friendUserDoc = await getDoc(doc(db, 'users', friendId));
          if (friendUserDoc.exists()) {
            friends.push({
              uid: friendId,
              ...friendUserDoc.data()
            });
            console.log('LeaderboardScreen: Added friend:', friendId, friendUserDoc.data().username);
          }
        } catch (error) {
          console.error('LeaderboardScreen: Failed to load friend:', friendId, error);
        }
      }
      
      // Add current user to friends list for ranking (only if not already present)
      if (!friends.some(friend => friend.uid === currentUser.uid)) {
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (currentUserDoc.exists()) {
          const currentUserData = currentUserDoc.data();
          friends.push({
            uid: currentUser.uid,
            ...currentUserData
          });
          console.log('LeaderboardScreen: Added current user to friends list:', {
            uid: currentUser.uid,
            username: currentUserData.username,
            gamesPlayed: currentUserData.gamesPlayed
          });
        }
      }
      
      console.log('LeaderboardScreen: Total friends loaded:', friends.length);
      setUserFriends(friends);
    } catch (error) {
      console.error('Failed to load user friends:', error);
    }
  };

  const loadLeaderboards = async (currentUser) => {
    try {
      await loadSoloLeaderboard(currentUser);
      await loadPvpLeaderboard(currentUser);
    } catch (error) {
      console.error('Failed to load leaderboards:', error);
    }
  };

  const loadSoloLeaderboard = async (currentUser) => {
    try {
      console.log('LeaderboardScreen: Loading solo leaderboard for user:', currentUser.uid, 'difficulty:', activeDifficulty);
      const leaderboardData = [];
      
      // Get solo games for all friends (including current user) for the selected difficulty
      for (const friend of userFriends) {
        try {
          console.log('LeaderboardScreen: Checking leaderboard for friend:', friend.uid, friend.username, 'difficulty:', activeDifficulty);
          
          // Use simple query without orderBy to avoid index requirements
          let leaderboardQuery;
          if (activeDifficulty === 'easy') {
            leaderboardQuery = query(
              collection(db, 'leaderboard'),
              where('userId', '==', friend.uid),
              where('mode', '==', 'solo'),
              where('difficulty', '==', 'easy')
            );
          } else if (activeDifficulty === 'hard') {
            leaderboardQuery = query(
              collection(db, 'leaderboard'),
              where('userId', '==', friend.uid),
              where('mode', '==', 'solo'),
              where('difficulty', '==', 'hard')
            );
          } else {
            // Regular difficulty (default)
            leaderboardQuery = query(
              collection(db, 'leaderboard'),
              where('userId', '==', friend.uid),
              where('mode', '==', 'solo'),
              where('difficulty', '==', 'regular')
            );
          }
          
          const gamesSnapshot = await getDocs(leaderboardQuery);
          const recentGames = gamesSnapshot.docs.map(doc => doc.data());
          console.log('LeaderboardScreen: Found', recentGames.length, 'solo games for friend:', friend.uid);
          
          if (recentGames.length > 0) {
            // Sort manually and take last 15 games
            const sortedGames = recentGames.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 15);
            const totalAttempts = sortedGames.reduce((sum, game) => sum + game.guesses, 0);
            const runningAverage = totalAttempts / sortedGames.length;
            
            leaderboardData.push({
              uid: friend.uid,
              username: friend.username || friend.displayName || 'Unknown Player',
              displayName: friend.displayName || friend.username || 'Unknown Player',
              runningAverage: runningAverage,
              gamesCount: sortedGames.length,
              totalGames: friend.gamesPlayed || 0
            });
            
            console.log('LeaderboardScreen: Added friend to leaderboard:', {
              uid: friend.uid,
              username: friend.username,
              runningAverage,
              gamesCount: sortedGames.length,
              totalGames: friend.gamesPlayed || 0
            });
          }
        } catch (error) {
          console.error(`Failed to get solo games for user ${friend.uid}:`, error);
          // Continue with other users even if one fails
        }
      }
      
      console.log('LeaderboardScreen: Total leaderboard entries:', leaderboardData.length);
      
      // Sort by running average (lowest is best)
      leaderboardData.sort((a, b) => a.runningAverage - b.runningAverage);
      
      // Add ranks
      const rankedData = leaderboardData.map((player, index) => ({
        ...player,
        rank: index + 1
      }));
      
      console.log('LeaderboardScreen: Final ranked data:', rankedData);
      setSoloLeaderboard(rankedData);

      // Find current user's rank
      if (currentUser) {
        const userRank = rankedData.find(player => player.uid === currentUser.uid);
        if (userRank) {
          setUserSoloRank(userRank);
          console.log('LeaderboardScreen: Current user rank:', userRank);
        } else {
          console.log('LeaderboardScreen: Current user not found in leaderboard');
        }
      }
    } catch (error) {
      console.error('Failed to load solo leaderboard:', error);
    }
  };

  const loadPvpLeaderboard = async (currentUser) => {
    try {
      console.log('LeaderboardScreen: Loading PvP leaderboard for user:', currentUser.uid, 'difficulty:', activeDifficulty);
      
      // Debug: Check if gameStats collection has any documents
      try {
        const allStatsQuery = query(collection(db, 'gameStats'));
        const allStatsSnapshot = await getDocs(allStatsQuery);
        console.log('LeaderboardScreen: Total gameStats documents:', allStatsSnapshot.size);
        if (allStatsSnapshot.size > 0) {
          console.log('LeaderboardScreen: Sample gameStats document:', allStatsSnapshot.docs[0].data());
        }
      } catch (error) {
        console.error('LeaderboardScreen: Failed to check gameStats collection:', error);
      }
      
      const leaderboardData = [];
      
      // Get PvP game statistics for all friends (including current user)
      for (const friend of userFriends) {
        try {
          console.log('LeaderboardScreen: Checking PvP leaderboard for friend:', friend.uid, friend.username, 'difficulty:', activeDifficulty);
          
          // Get all PvP game stats where this user participated
          const pvpStatsQuery = query(
            collection(db, 'gameStats'),
            where('players', 'array-contains', friend.uid),
            where('type', '==', 'pvp')
          );
          
          const pvpStatsSnapshot = await getDocs(pvpStatsQuery);
          const pvpStats = pvpStatsSnapshot.docs.map(doc => doc.data());
          
          console.log('LeaderboardScreen: Found PvP stats for friend:', friend.uid, 'count:', pvpStats.length);
          if (pvpStats.length > 0) {
            console.log('LeaderboardScreen: Sample PvP stat:', pvpStats[0]);
          }
          
          if (pvpStats.length > 0) {
            console.log('LeaderboardScreen: Processing PvP stats for friend:', friend.uid, 'total stats:', pvpStats.length);
            
            // Filter by difficulty and get last 15 games
            const difficultyStats = pvpStats.filter(stat => {
              // Check for wordLength first (new format)
              if (stat.wordLength !== undefined) {
                if (activeDifficulty === 'easy') {
                  return stat.wordLength === 4;
                } else if (activeDifficulty === 'hard') {
                  return stat.wordLength === 6;
                } else {
                  return stat.wordLength === 5; // regular
                }
              }
              
              // Fallback to difficulty field for older games
              if (stat.difficulty !== undefined) {
                if (activeDifficulty === 'easy') {
                  return stat.difficulty === 'easy';
                } else if (activeDifficulty === 'hard') {
                  return stat.difficulty === 'hard';
                } else {
                  return stat.difficulty === 'regular';
                }
              }
              
              // If neither field exists, log and exclude
              console.log('LeaderboardScreen: PvP stat missing both wordLength and difficulty:', stat);
              return false;
            });
            
            console.log('LeaderboardScreen: Filtered stats for difficulty', activeDifficulty, 'count:', difficultyStats.length);
            
            if (difficultyStats.length > 0) {
              // Sort by completion time and take last 15 games
              const sortedStats = difficultyStats
                .sort((a, b) => new Date(b.completedAt || b.timestamp) - new Date(a.completedAt || a.timestamp))
                .slice(0, 15);
              
              // Calculate win percentage from last 15 games
              let wins = 0;
              const totalGames = sortedStats.length;
              
              for (const gameStats of sortedStats) {
                if (gameStats.winnerId === friend.uid) {
                  wins++;
                }
              }
              
              const winPercentage = totalGames > 0 ? (wins / totalGames) * 100 : 0;
              
              leaderboardData.push({
                uid: friend.uid,
                username: friend.username || friend.displayName || 'Unknown Player',
                displayName: friend.displayName || friend.username || 'Unknown Player',
                winPercentage: winPercentage,
                wins: wins,
                totalGames: totalGames,
                gamesCount: totalGames
              });
              
              console.log('LeaderboardScreen: Added PvP friend to leaderboard:', {
                uid: friend.uid,
                username: friend.username,
                winPercentage,
                wins,
                totalGames,
                difficulty: activeDifficulty
              });
            } else {
              console.log('LeaderboardScreen: No PvP stats found for difficulty', activeDifficulty, 'for friend:', friend.uid);
            }
          }
        } catch (error) {
          console.error(`Failed to get PvP game stats for user ${friend.uid}:`, error);
          // Continue with other users even if one fails
        }
      }
      
      console.log('LeaderboardScreen: Total PvP leaderboard entries:', leaderboardData.length);
      
      // Sort by win percentage (highest is best)
      leaderboardData.sort((a, b) => b.winPercentage - a.winPercentage);
      
      // Add ranks
      const rankedData = leaderboardData.map((player, index) => ({
        ...player,
        rank: index + 1
      }));
      
      console.log('LeaderboardScreen: Final PvP ranked data:', rankedData);
      setPvpLeaderboard(rankedData);

      // Find current user's rank
      if (currentUser) {
        const userRank = rankedData.find(player => player.uid === currentUser.uid);
        if (userRank) {
          setUserPvpRank(userRank);
          console.log('LeaderboardScreen: Current user PvP rank:', userRank);
        } else {
          console.log('LeaderboardScreen: Current user not found in PvP leaderboard');
        }
      }
    } catch (error) {
      console.error('Failed to load PvP leaderboard:', error);
      // Set empty PvP leaderboard if there's an error
      setPvpLeaderboard([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await loadUserFriends(user);
      await loadLeaderboards(user);
    }
    setRefreshing(false);
  };

  const renderSoloLeaderboardItem = ({ item, index }) => (
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
          Total Games: {item.totalGames || 0}
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
          (Last {item.gamesCount || 0} games)
        </Text>
      </View>
    </View>
  );

  const renderPvpLeaderboardItem = ({ item, index }) => (
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
          Games: {item.totalGames || 0}
        </Text>
      </View>
      
      <View style={styles.scoreContainer}>
        <Text style={[
          styles.scoreText,
          index < 3 ? styles.topScoreText : null
        ]}>
          {item.winPercentage ? item.winPercentage.toFixed(1) : 'N/A'}%
        </Text>
        <Text style={styles.scoreLabel}>Win Rate</Text>
        <Text style={styles.gamesCountText}>
          ({item.wins || 0}W / {item.totalGames || 0}G)
        </Text>
      </View>
    </View>
  );

  const renderCurrentUserPosition = () => {
    const currentRank = activeTab === 'solo' ? userSoloRank : userPvpRank;
    
    if (!currentRank) return null;
    
    return (
      <View style={styles.userRankContainer}>
        <Text style={styles.userRankTitle}>Your Position</Text>
        <View style={[styles.leaderboardItem, styles.currentUserItem]}>
          <View style={styles.rankContainer}>
            <Text style={styles.rankText}>#{currentRank.rank}</Text>
          </View>
          
          <View style={styles.playerInfo}>
            <Text style={styles.currentUserName}>
              {currentRank.username || currentRank.displayName || 'You'}
            </Text>
            <Text style={styles.playerStats}>
              {activeTab === 'solo' 
                ? `Total Games: ${currentRank.totalGames || 0}`
                : `Games: ${currentRank.totalGames || 0}`
              }
            </Text>
          </View>
          
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreText}>
              {activeTab === 'solo'
                ? (currentRank.runningAverage ? currentRank.runningAverage.toFixed(1) : 'N/A')
                : (currentRank.winPercentage ? currentRank.winPercentage.toFixed(1) + '%' : 'N/A')
              }
            </Text>
            <Text style={styles.scoreLabel}>
              {activeTab === 'solo' ? 'Avg Attempts' : 'Win Rate'}
            </Text>
            <Text style={styles.gamesCountText}>
              {activeTab === 'solo'
                ? `(Last ${currentRank.gamesCount || 0} games)`
                : `(${currentRank.wins || 0}W / ${currentRank.totalGames || 0}G)`
              }
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screenContainer}>
      <ScrollView 
        style={{ flex: 1, width: '100%' }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >

        
        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'solo' && styles.activeTab]}
            onPress={() => setActiveTab('solo')}
          >
            <Text style={[styles.tabText, activeTab === 'solo' && styles.activeTabText]}>
              🎯 Solo Mode
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'pvp' && styles.activeTab]}
            onPress={() => setActiveTab('pvp')}
          >
            <Text style={[styles.tabText, activeTab === 'pvp' && styles.activeTabText]}>
              ⚔️ PvP Mode
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Difficulty Tabs (show for both Solo and PvP Mode) */}
        <View style={styles.difficultyTabContainer}>
          <TouchableOpacity 
            style={[styles.difficultyTab, activeDifficulty === 'easy' && styles.activeDifficultyTab]}
            onPress={() => handleDifficultyChange('easy')}
          >
            <Text style={[styles.difficultyTabText, activeDifficulty === 'easy' && styles.activeDifficultyTabText]}>
              🟢 Easy (4)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.difficultyTab, activeDifficulty === 'regular' && styles.activeDifficultyTab]}
            onPress={() => handleDifficultyChange('regular')}
          >
            <Text style={[styles.difficultyTabText, activeDifficulty === 'regular' && styles.activeDifficultyTabText]}>
              🟡 Regular (5)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.difficultyTab, 
              activeDifficulty === 'hard' && styles.activeDifficultyTab,
              !hardModeUnlocked && styles.lockedDifficultyTab
            ]}
            onPress={() => handleDifficultyChange('hard')}
            disabled={!hardModeUnlocked}
          >
            <Text style={[
              styles.difficultyTabText, 
              activeDifficulty === 'hard' && styles.activeDifficultyTabText,
              !hardModeUnlocked && styles.lockedDifficultyTabText
            ]}>
              {!hardModeUnlocked ? '🔒' : '🔴'} Hard (6)
            </Text>
            {!hardModeUnlocked && (
              <Text style={styles.lockedDifficultySubtext}>
                Win 10 regular games
              </Text>
            )}
          </TouchableOpacity>
        </View>
        
        {/* Current User's Position */}
        {renderCurrentUserPosition()}

        {/* Top Players */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {activeTab === 'solo' 
              ? `Top Solo Players - ${activeDifficulty.charAt(0).toUpperCase() + activeDifficulty.slice(1)} Mode`
              : `Top PvP Players - ${activeDifficulty.charAt(0).toUpperCase() + activeDifficulty.slice(1)} Mode`
            }
          </Text>
          {(activeTab === 'solo' ? soloLeaderboard : pvpLeaderboard).length > 0 ? (
            <FlatList
              data={activeTab === 'solo' ? soloLeaderboard : pvpLeaderboard}
              renderItem={activeTab === 'solo' ? renderSoloLeaderboardItem : renderPvpLeaderboardItem}
              keyExtractor={item => item.uid}
              scrollEnabled={false}
              style={{ maxHeight: 400 }}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {activeTab === 'solo' 
                  ? `No solo ${activeDifficulty} games played yet. Start playing to see rankings!`
                  : `No PvP ${activeDifficulty} games completed yet. Challenge friends to see rankings!`
                }
              </Text>
            </View>
          )}
        </View>



        {/* How to Improve */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>💡 How to Improve Your Rank</Text>
          {activeTab === 'solo' ? (
            <>
              <Text style={styles.tipText}>• Solve {activeDifficulty === 'easy' ? '4-letter' : activeDifficulty === 'hard' ? '6-letter' : '5-letter'} words in fewer attempts to lower your average</Text>
              <Text style={styles.tipText}>• Play consistently to maintain a good running average</Text>
              <Text style={styles.tipText}>• Use hints strategically to reduce guess count</Text>
              <Text style={styles.tipText}>• Focus on the last 15 games for ranking</Text>
              <Text style={styles.tipText}>• Try different difficulties to challenge yourself</Text>
            </>
          ) : (
            <>
              <Text style={styles.tipText}>• Win more {activeDifficulty === 'easy' ? '4-letter' : activeDifficulty === 'hard' ? '6-letter' : '5-letter'} PvP games to increase your win percentage</Text>
              <Text style={styles.tipText}>• Challenge friends to improve your skills</Text>
              <Text style={styles.tipText}>• Learn from losses to become a better player</Text>
              <Text style={styles.tipText}>• Play consistently to maintain your ranking</Text>
              <Text style={styles.tipText}>• Focus on the last 15 games for ranking</Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default LeaderboardScreen;
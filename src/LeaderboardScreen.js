import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, where, updateDoc, onSnapshot } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const LeaderboardScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        checkHardModeUnlock(currentUser);
        // Load friends first, then leaderboards will be loaded via useFocusEffect
        loadUserFriends(currentUser);
      }
    });

    return unsubscribe;
  }, []);

  // Real-time listener for current user's profile updates
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const userData = docSnapshot.data();
        
        // Update the current user's data in the friends list
        setUserFriends(prevFriends => {
          const updatedFriends = prevFriends.map(friend => 
            friend.uid === user.uid ? { ...friend, ...userData } : friend
          );
          
          // If current user not in friends list, add them
          if (!prevFriends.some(friend => friend.uid === user.uid)) {
            updatedFriends.push({ uid: user.uid, ...userData });
          }
          
          return updatedFriends;
        });
      }
    });

    return unsubscribe;
  }, [user]);

  // Load leaderboards when friends are loaded
  useEffect(() => {
    if (user && userFriends.length >= 0) { // Changed from > 0 to >= 0 to include solo players
      loadLeaderboards(user);
    }
  }, [user, userFriends]);

  // Refresh leaderboard when screen comes into focus or difficulty changes
  useFocusEffect(
    React.useCallback(() => {
      if (user && userFriends.length >= 0) { // Changed from > 0 to >= 0 to include solo players
        loadLeaderboards(user);
      }
    }, [user, userFriends, activeDifficulty])
  );

  // Check hard mode unlock status
  const checkHardModeUnlock = async (currentUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Check if user is premium
        if (userData.isPremium) {
          setHardModeUnlocked(true);
          return;
        }
        
        // Check if user has reached Word Expert rank (Regular mode average ≤ 10 AND 15+ games played)
        const regularAvg = userData.regularAverageScore || 0;
        const regularGamesCount = userData.regularGamesCount || 0;
        if (regularAvg > 0 && regularAvg <= 10 && regularGamesCount >= 15) {
          setHardModeUnlocked(true);
        } else {
          setHardModeUnlocked(false);
        }
      }
    } catch (error) {
      console.error('LeaderboardScreen: Failed to check hard mode unlock status:', error);
      setHardModeUnlocked(false);
    }
  };

  // Handle difficulty tab selection
  const handleDifficultyChange = async (difficulty) => {
    if (difficulty === 'hard' && !hardModeUnlocked) {
      // Show alert that hard mode is locked
      Alert.alert(
        'Hard Mode Locked',
        'Hard Mode is locked. Unlock it by either:\n\n🏆 Reaching Word Expert rank\n• Play 15+ Regular mode games\n• Achieve average of 10 attempts or fewer\n\n💎 OR Get premium access',
        [{ text: 'OK' }]
      );
      return;
    }
    setActiveDifficulty(difficulty);
    playSound('toggleTab').catch(() => {});
    
    // Reload leaderboards when difficulty changes
    if (user && userFriends.length >= 0) {
      await loadLeaderboards(user);
    }
  };


  const loadUserFriends = async (currentUser) => {
    try {
      setIsLoading(true);
      console.log('🔍 [LeaderboardScreen] Loading friends using NEW subcollection system');
      
      // Use NEW subcollection system
      const friendsRef = collection(db, 'users', currentUser.uid, 'friends');
      const friendsQuery = query(friendsRef, where('status', '==', 'accepted'));
      const friendsSnapshot = await getDocs(friendsQuery);
      
      console.log('🔍 [LeaderboardScreen] Found', friendsSnapshot.docs.length, 'friends');
      
      const friends = [];
      
      // Always include current user in friends list for leaderboard
      const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (currentUserDoc.exists()) {
        friends.push({
          uid: currentUser.uid,
          ...currentUserDoc.data()
        });
      }
      
      // Add all friends
      for (const friendDoc of friendsSnapshot.docs) {
        try {
          const friendId = friendDoc.id;
          const friendUserDoc = await getDoc(doc(db, 'users', friendId));
          if (friendUserDoc.exists()) {
            friends.push({
              uid: friendId,
              ...friendUserDoc.data()
            });
          }
        } catch (error) {
          console.error('LeaderboardScreen: Failed to load friend:', friendDoc.id, error);
        }
      }
      
      setUserFriends(friends);
    } catch (error) {
      console.error('❌ [LeaderboardScreen] Failed to load user friends:', error);
      setIsLoading(false);
    }
  };

  const loadLeaderboards = async (currentUser) => {
    try {
      await loadSoloLeaderboard(currentUser);
      await loadPvpLeaderboard(currentUser);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load leaderboards:', error);
      setIsLoading(false);
    }
  };

  const loadSoloLeaderboard = async (currentUser) => {
    try {
      console.log('LeaderboardScreen: Loading solo leaderboard for difficulty:', activeDifficulty);
      console.log('LeaderboardScreen: User friends count:', userFriends.length);
      
      const leaderboardData = [];
      
      // Get solo averages for all friends (including current user) for the selected difficulty
      for (const friend of userFriends) {
        try {
          // Use the stored average scores from the user profile (same as Profile Screen)
          let runningAverage = 0;
          let gamesCount = 0;
          
          if (activeDifficulty === 'easy') {
            runningAverage = friend.easyAverageScore || 0;
            gamesCount = friend.easyGamesCount || 0;
          } else if (activeDifficulty === 'hard') {
            runningAverage = friend.hardAverageScore || 0;
            gamesCount = friend.hardGamesCount || 0;
          } else {
            // Regular difficulty (default)
            runningAverage = friend.regularAverageScore || 0;
            gamesCount = friend.regularGamesCount || 0;
          }
          
          // Only include players who have played games in this difficulty
          console.log(`LeaderboardScreen: Friend ${friend.username || friend.displayName}: avg=${runningAverage}, games=${gamesCount}`);
          
          // Include players who have played games (runningAverage > 0) OR show current user even with 0 games
          if (runningAverage > 0 || friend.uid === currentUser.uid) {
            leaderboardData.push({
              uid: friend.uid,
              username: friend.username || friend.displayName || 'Unknown Player',
              displayName: friend.displayName || friend.username || 'Unknown Player',
              runningAverage: runningAverage,
              gamesCount: gamesCount,
              totalGames: friend.gamesPlayed || 0
            });
          }
        } catch (error) {
          console.error(`Failed to get solo stats for user ${friend.uid}:`, error);
          // Continue with other users even if one fails
        }
      }
      
      
      // Sort by running average (lowest is best)
      leaderboardData.sort((a, b) => a.runningAverage - b.runningAverage);
      
      // Add ranks
      const rankedData = leaderboardData.map((player, index) => ({
        ...player,
        rank: index + 1
      }));
      
      console.log('LeaderboardScreen: Final solo leaderboard data:', rankedData);
      setSoloLeaderboard(rankedData);

      // Find current user's rank
      if (currentUser) {
        const userRank = rankedData.find(player => player.uid === currentUser.uid);
        if (userRank) {
          setUserSoloRank(userRank);
        } else {
        }
      }
    } catch (error) {
      console.error('Failed to load solo leaderboard:', error);
    }
  };

  const loadPvpLeaderboard = async (currentUser) => {
    try {
      
      // Debug: Check if gameStats collection has any documents
      try {
        const allStatsQuery = query(collection(db, 'gameStats'));
        const allStatsSnapshot = await getDocs(allStatsQuery);
        if (allStatsSnapshot.size > 0) {
        }
      } catch (error) {
        console.error('LeaderboardScreen: Failed to check gameStats collection:', error);
      }
      
      const leaderboardData = [];
      
      // Get PvP game statistics for all friends (including current user)
      for (const friend of userFriends) {
        try {
          
          // Get all PvP game stats where this user participated (all difficulties)
          const pvpStatsQuery = query(
            collection(db, 'gameStats'),
            where('players', 'array-contains', friend.uid),
            where('type', '==', 'pvp')
          );
          
          const pvpStatsSnapshot = await getDocs(pvpStatsQuery);
          const pvpStats = pvpStatsSnapshot.docs.map(doc => doc.data());
          
          if (pvpStats.length > 0) {
          }
          
          // Filter by selected difficulty, then sort by completion time and take last 15 games
          const difficultyFiltered = pvpStats.filter(stat => {
            if (!stat) return false;
            // Prefer wordLength if available (new format)
            if (stat.wordLength !== undefined) {
              if (activeDifficulty === 'easy') return stat.wordLength === 4;
              if (activeDifficulty === 'hard') return stat.wordLength === 6;
              return stat.wordLength === 5; // regular
            }
            // Fallback to difficulty string (legacy)
            if (stat.difficulty !== undefined) {
              if (activeDifficulty === 'easy') return stat.difficulty === 'easy';
              if (activeDifficulty === 'hard') return stat.difficulty === 'hard';
              return stat.difficulty === 'regular';
            }
            return false;
          });

          const sortedStats = difficultyFiltered
            .filter(stat => (stat.completedAt || stat.timestamp))
            .sort((a, b) => new Date(b.completedAt || b.timestamp) - new Date(a.completedAt || a.timestamp))
            .slice(0, 15);

          let wins = 0;
          const totalGames = sortedStats.length;
          for (const gameStats of sortedStats) {
            if (gameStats.winnerId === friend.uid) {
              wins++;
            }
          }

          const winPercentage = totalGames > 0 ? (wins / totalGames) * 100 : 0;

          // Always include friend in leaderboard, even with 0 games
          leaderboardData.push({
            uid: friend.uid,
            username: friend.username || friend.displayName || 'Unknown Player',
            displayName: friend.displayName || friend.username || 'Unknown Player',
            winPercentage: winPercentage,
            wins: wins,
            totalGames: totalGames,
            gamesCount: totalGames
          });

        } catch (error) {
          console.error(`Failed to get PvP game stats for user ${friend.uid}:`, error);
          // Continue with other users even if one fails
        }
      }
      
      
      // Sort by win percentage (highest is best). If tie, prefer more games.
      leaderboardData.sort((a, b) => {
        if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
        return (b.totalGames || 0) - (a.totalGames || 0);
      });
      
      // Add ranks
      const rankedData = leaderboardData.map((player, index) => ({
        ...player,
        rank: index + 1
      }));
      
      setPvpLeaderboard(rankedData);

      // Find current user's rank
      if (currentUser) {
        const userRank = rankedData.find(player => player.uid === currentUser.uid);
        if (userRank) {
          setUserPvpRank(userRank);
        } else {
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
        <Text style={styles.difficultyScoreText}>
          {activeDifficulty === 'easy' ? '🟢' : activeDifficulty === 'hard' ? '🔴' : '🟡'} {activeDifficulty.charAt(0).toUpperCase() + activeDifficulty.slice(1)} <Text style={styles.scoreHighlight}>{item.runningAverage ? item.runningAverage.toFixed(2) : 'N/A'}</Text> Avg Attempts
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
        <Text style={styles.difficultyScoreText}>
          {activeDifficulty === 'easy' ? '🟢' : activeDifficulty === 'hard' ? '🔴' : '🟡'} {activeDifficulty.charAt(0).toUpperCase() + activeDifficulty.slice(1)} <Text style={styles.scoreHighlight}>{item.winPercentage ? item.winPercentage.toFixed(1) : 'N/A'}%</Text> Win Rate
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
    <SafeAreaView edges={['left', 'right']} style={[styles.screenContainer, { paddingTop: insets.top }]}>
      <ScrollView 
        style={{ flex: 1, width: '100%' }} 
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        
        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'solo' && styles.activeTab]}
            onPress={() => {
              setActiveTab('solo');
              playSound('toggleTab').catch(() => {});
            }}
          >
            <Text style={[styles.tabText, activeTab === 'solo' && styles.activeTabText]}>
              🎯 Solo Mode
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'pvp' && styles.activeTab]}
            onPress={() => {
              setActiveTab('pvp');
              playSound('toggleTab').catch(() => {});
            }}
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
              Easy
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.difficultyTab, activeDifficulty === 'regular' && styles.activeDifficultyTab]}
            onPress={() => handleDifficultyChange('regular')}
          >
            <Text style={[styles.difficultyTabText, activeDifficulty === 'regular' && styles.activeDifficultyTabText]}>
              Regular
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
              {!hardModeUnlocked ? '🔒' : ''} Hard
            </Text>
            {!hardModeUnlocked && (
              <Text style={styles.lockedDifficultySubtext}>
                Reach Word Expert rank
              </Text>
            )}
          </TouchableOpacity>
        </View>
        
        {/* Current User's Position */}
        {renderCurrentUserPosition()}

        {/* Top Players */}
        <View style={[styles.section, { marginBottom: 0 }]}>
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
              showsVerticalScrollIndicator={false}
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
      </ScrollView>
    </SafeAreaView>
  );
};

export default LeaderboardScreen;
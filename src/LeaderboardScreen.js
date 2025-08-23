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

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadUserFriends(currentUser);
        loadLeaderboards(currentUser);
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

  // Debug function to check leaderboard collection
  const debugLeaderboardCollection = async () => {
    try {
      console.log('🔍 Debug: Checking leaderboard collection...');
      const snapshot = await getDocs(collection(db, 'leaderboard'));
      console.log('🔍 Debug: Total leaderboard documents:', snapshot.docs.length);
      
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`🔍 Debug: Document ${index + 1}:`, {
          id: doc.id,
          userId: data.userId,
          mode: data.mode,
          difficulty: data.difficulty || 'unknown',
          wordLength: data.wordLength || 'unknown',
          guesses: data.guesses,
          timestamp: data.timestamp
        });
      });
      
      // Also check current user's profile
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log('🔍 Debug: Current user profile:', {
            uid: user.uid,
            gamesPlayed: userData.gamesPlayed,
            gamesWon: userData.gamesWon,
            bestScore: userData.bestScore
          });
        }
      }
      
      Alert.alert('Debug Info', `Found ${snapshot.docs.length} leaderboard entries. Check console for details.`);
    } catch (error) {
      console.error('🔍 Debug: Error checking leaderboard:', error);
      Alert.alert('Debug Error', error.message);
    }
  };

  // Function to migrate old leaderboard entries to include difficulty
  const migrateOldLeaderboardEntries = async () => {
    try {
      console.log('🔄 Migrating old leaderboard entries...');
      const snapshot = await getDocs(collection(db, 'leaderboard'));
      let migratedCount = 0;
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Check if entry needs migration (missing difficulty or wordLength)
        if (data.mode === 'solo' && (!data.difficulty || !data.wordLength)) {
          console.log('🔄 Migrating entry:', doc.id);
          
          // Determine difficulty based on wordLength or default to regular
          let difficulty = data.difficulty;
          let wordLength = data.wordLength;
          
          if (!wordLength) {
            // Old entries without wordLength default to regular (5 letters)
            wordLength = 5;
            difficulty = 'regular';
          } else if (!difficulty) {
            // Entries with wordLength but no difficulty
            if (wordLength === 4) {
              difficulty = 'easy';
            } else if (wordLength === 6) {
              difficulty = 'hard';
            } else {
              difficulty = 'regular';
            }
          }
          
          // Update the document with difficulty and wordLength
          await updateDoc(doc(db, 'leaderboard', doc.id), {
            difficulty: difficulty,
            wordLength: wordLength
          });
          
          migratedCount++;
        }
      }
      
      console.log('🔄 Migration complete. Updated', migratedCount, 'entries.');
      Alert.alert('Migration Complete', `Successfully migrated ${migratedCount} old leaderboard entries!`);
      
      // Reload leaderboards after migration
      if (user) {
        await loadLeaderboards(user);
      }
    } catch (error) {
      console.error('🔄 Migration error:', error);
      Alert.alert('Migration Error', 'Failed to migrate old entries: ' + error.message);
    }
  };

  const loadUserFriends = async (currentUser) => {
    try {
      console.log('LeaderboardScreen: Loading user friends for:', currentUser.uid);
      // Get user's accepted friends
      const friendsRef = collection(db, 'users', currentUser.uid, 'friends');
      const friendsQuery = query(friendsRef, where('status', '==', 'accepted'));
      const friendsSnapshot = await getDocs(friendsQuery);
      
      const friends = [];
      for (const friendDoc of friendsSnapshot.docs) {
        const friendData = friendDoc.data();
        const friendUserDoc = await getDoc(doc(db, 'users', friendDoc.id));
        if (friendUserDoc.exists()) {
          friends.push({
            uid: friendDoc.id,
            ...friendUserDoc.data()
          });
          console.log('LeaderboardScreen: Added friend:', friendDoc.id, friendUserDoc.data().username);
        }
      }
      
      // Add current user to friends list for ranking
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
          
          // Create difficulty-specific query
          let leaderboardQuery;
          if (activeDifficulty === 'easy') {
            leaderboardQuery = query(
              collection(db, 'leaderboard'),
              where('userId', '==', friend.uid),
              where('mode', '==', 'solo'),
              where('difficulty', '==', 'easy'),
              orderBy('timestamp', 'desc'),
              limit(15)
            );
          } else if (activeDifficulty === 'hard') {
            leaderboardQuery = query(
              collection(db, 'leaderboard'),
              where('userId', '==', friend.uid),
              where('mode', '==', 'solo'),
              where('difficulty', '==', 'hard'),
              orderBy('timestamp', 'desc'),
              limit(15)
            );
          } else {
            // Regular difficulty (default)
            leaderboardQuery = query(
              collection(db, 'leaderboard'),
              where('userId', '==', friend.uid),
              where('mode', '==', 'solo'),
              where('difficulty', '==', 'regular'),
              orderBy('timestamp', 'desc'),
              limit(15)
            );
          }
          
          try {
            const gamesSnapshot = await getDocs(leaderboardQuery);
            const recentGames = gamesSnapshot.docs.map(doc => doc.data());
            console.log('LeaderboardScreen: Found', recentGames.length, 'solo games for friend:', friend.uid);
            
            if (recentGames.length > 0) {
              // Calculate running average of attempts (last 15 games)
              const totalAttempts = recentGames.reduce((sum, game) => sum + game.guesses, 0);
              const runningAverage = totalAttempts / recentGames.length;
              
              leaderboardData.push({
                uid: friend.uid,
                username: friend.username || friend.displayName || 'Unknown Player',
                displayName: friend.displayName || friend.username || 'Unknown Player',
                runningAverage: runningAverage,
                gamesCount: recentGames.length,
                totalGames: friend.gamesPlayed || 0
              });
              
              console.log('LeaderboardScreen: Added friend to leaderboard:', {
                uid: friend.uid,
                username: friend.username,
                runningAverage,
                gamesCount: recentGames.length,
                totalGames: friend.gamesPlayed || 0
              });
            }
          } catch (queryError) {
            console.error(`LeaderboardScreen: Query error for user ${friend.uid}:`, queryError);
            
            // Try a simpler query without orderBy to see if that's the issue
            try {
              let simpleQuery;
              if (activeDifficulty === 'easy') {
                simpleQuery = query(
                  collection(db, 'leaderboard'),
                  where('userId', '==', friend.uid),
                  where('mode', '==', 'solo'),
                  where('difficulty', '==', 'easy')
                );
              } else if (activeDifficulty === 'hard') {
                simpleQuery = query(
                  collection(db, 'leaderboard'),
                  where('userId', '==', friend.uid),
                  where('mode', '==', 'solo'),
                  where('difficulty', '==', 'hard')
                );
              } else {
                simpleQuery = query(
                  collection(db, 'leaderboard'),
                  where('userId', '==', friend.uid),
                  where('mode', '==', 'solo'),
                  where('difficulty', '==', 'regular')
                );
              }
              
              const simpleSnapshot = await getDocs(simpleQuery);
              const simpleGames = simpleSnapshot.docs.map(doc => doc.data());
              console.log('LeaderboardScreen: Simple query found', simpleGames.length, 'games for friend:', friend.uid);
              
              if (simpleGames.length > 0) {
                // Sort manually since orderBy failed
                const sortedGames = simpleGames.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 15);
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
                
                console.log('LeaderboardScreen: Added friend to leaderboard (simple query):', {
                  uid: friend.uid,
                  username: friend.username,
                  runningAverage,
                  gamesCount: sortedGames.length,
                  totalGames: friend.gamesPlayed || 0
                });
              }
            } catch (simpleQueryError) {
              console.error(`LeaderboardScreen: Simple query also failed for user ${friend.uid}:`, simpleQueryError);
            }
            
            // Fallback: try to get old entries without difficulty (for backward compatibility)
            try {
              const fallbackQuery = query(
                collection(db, 'leaderboard'),
                where('userId', '==', friend.uid),
                where('mode', '==', 'solo')
              );
              
              const fallbackSnapshot = await getDocs(fallbackQuery);
              const fallbackGames = fallbackSnapshot.docs.map(doc => doc.data());
              
              // Filter games by word length to match current difficulty
              const targetWordLength = activeDifficulty === 'easy' ? 4 : activeDifficulty === 'hard' ? 6 : 5;
              const filteredGames = fallbackGames.filter(game => 
                game.wordLength === targetWordLength || 
                (!game.wordLength && activeDifficulty === 'regular') // Default to regular for old entries
              );
              
              if (filteredGames.length > 0) {
                const sortedGames = filteredGames.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 15);
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
                
                console.log('LeaderboardScreen: Added friend to leaderboard (fallback):', {
                  uid: friend.uid,
                  username: friend.username,
                  runningAverage,
                  gamesCount: sortedGames.length,
                  totalGames: friend.gamesPlayed || 0
                });
              }
            } catch (fallbackError) {
              console.error(`LeaderboardScreen: Fallback query failed for user ${friend.uid}:`, fallbackError);
            }
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
      const leaderboardData = [];
      
      // Get PvP games for all friends (including current user)
      for (const friend of userFriends) {
        try {
          // Get all PvP games where this user participated
          const pvpGamesQuery = query(
            collection(db, 'games'),
            where('players', 'array-contains', friend.uid),
            where('status', '==', 'completed')
          );
          
          const pvpGamesSnapshot = await getDocs(pvpGamesQuery);
          const pvpGames = pvpGamesSnapshot.docs.map(doc => doc.data());
          
          if (pvpGames.length > 0) {
            // Calculate win percentage
            let wins = 0;
            let totalGames = pvpGames.length;
            
            for (const game of pvpGames) {
              if (game.winnerId === friend.uid) {
                wins++;
              }
            }
            
            const winPercentage = (wins / totalGames) * 100;
            
            leaderboardData.push({
              uid: friend.uid,
              username: friend.username || friend.displayName || 'Unknown Player',
              displayName: friend.displayName || friend.username || 'Unknown Player',
              winPercentage: winPercentage,
              wins: wins,
              totalGames: totalGames
            });
          }
        } catch (error) {
          console.error(`Failed to get PvP games for user ${friend.uid}:`, error);
          // Continue with other users even if one fails
        }
      }
      
      // Sort by win percentage (highest is best)
      leaderboardData.sort((a, b) => b.winPercentage - a.winPercentage);
      
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
        }
      }
    } catch (error) {
      console.error('Failed to load PvP leaderboard:', error);
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
        
        {/* Difficulty Tabs (only show for Solo Mode) */}
        {activeTab === 'solo' && (
          <View style={styles.difficultyTabContainer}>
            <TouchableOpacity 
              style={[styles.difficultyTab, activeDifficulty === 'easy' && styles.activeDifficultyTab]}
              onPress={() => setActiveDifficulty('easy')}
            >
              <Text style={[styles.difficultyTabText, activeDifficulty === 'easy' && styles.activeDifficultyTabText]}>
                🟢 Easy (4)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.difficultyTab, activeDifficulty === 'regular' && styles.activeDifficultyTab]}
              onPress={() => setActiveDifficulty('regular')}
            >
              <Text style={[styles.difficultyTabText, activeDifficulty === 'regular' && styles.activeDifficultyTabText]}>
                🟡 Regular (5)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.difficultyTab, activeDifficulty === 'hard' && styles.activeDifficultyTab]}
              onPress={() => setActiveDifficulty('hard')}
            >
              <Text style={[styles.difficultyTabText, activeDifficulty === 'hard' && styles.activeDifficultyTabText]}>
                🔴 Hard (6)
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Current User's Position */}
        {renderCurrentUserPosition()}

        {/* Top Players */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {activeTab === 'solo' 
              ? `Top Solo Players - ${activeDifficulty.charAt(0).toUpperCase() + activeDifficulty.slice(1)} Mode`
              : 'Top PvP Players'
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
                  ? 'No solo games played yet. Start playing to see rankings!'
                  : 'No PvP games completed yet. Challenge friends to see rankings!'
                }
              </Text>
            </View>
          )}
        </View>

        {/* Debug Buttons */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#7C3AED', flex: 1 }]}
            onPress={debugLeaderboardCollection}
          >
            <Text style={styles.buttonText}>🔍 Debug</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#10B981', flex: 1 }]}
            onPress={migrateOldLeaderboardEntries}
          >
            <Text style={styles.buttonText}>🔄 Migrate</Text>
          </TouchableOpacity>
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
              <Text style={styles.tipText}>• Win more PvP games to increase your win percentage</Text>
              <Text style={styles.tipText}>• Challenge friends to improve your skills</Text>
              <Text style={styles.tipText}>• Learn from losses to become a better player</Text>
              <Text style={styles.tipText}>• Play consistently to maintain your ranking</Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default LeaderboardScreen;
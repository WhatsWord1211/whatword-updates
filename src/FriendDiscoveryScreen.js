import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, orderBy, limit, startAfter, addDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { playSound } from './soundsUtil';
import settingsService from './settingsService';
import { getThemeColors } from './theme';
import styles from './styles';

const FriendDiscoveryScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState({});
  const [activeTab, setActiveTab] = useState('search'); // 'search', 'suggestions', 'leaderboard'

  useEffect(() => {
    loadSettings();
    loadSuggestedUsers();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await settingsService.initialize();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadSuggestedUsers = async () => {
    if (!auth.currentUser) return;
    
    try {
      setLoading(true);
      
      // Get current user's friends
      const friendsQuery = query(
        collection(db, 'friends'),
        where('userId', '==', auth.currentUser.uid),
        where('status', '==', 'accepted')
      );
      const friendsSnapshot = await getDocs(friendsQuery);
      const friendIds = friendsSnapshot.docs.map(doc => doc.data().friendId);
      
      // Get friends of friends (excluding current friends)
      const friendsOfFriends = new Set();
      for (const friendId of friendIds) {
        const fofQuery = query(
          collection(db, 'friends'),
          where('userId', '==', friendId),
          where('status', '==', 'accepted')
        );
        const fofSnapshot = await getDocs(fofQuery);
        fofSnapshot.docs.forEach(doc => {
          const fofId = doc.data().friendId;
          if (fofId !== auth.currentUser.uid && !friendIds.includes(fofId)) {
            friendsOfFriends.add(fofId);
          }
        });
      }
      
      // Get user details for suggestions
      const suggestions = [];
      for (const userId of Array.from(friendsOfFriends).slice(0, 10)) {
        try {
          const userDoc = await getDocs(query(
            collection(db, 'users'),
            where('uid', '==', userId)
          ));
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            if (userData.showInFriendSuggestions !== false) {
              suggestions.push({
                uid: userId,
                username: userData.username || 'Unknown User',
                gamesPlayed: userData.gamesPlayed || 0,
                gamesWon: userData.gamesWon || 0,
                isFriendOfFriend: true
              });
            }
          }
        } catch (error) {
          console.error('Failed to get user data:', error);
        }
      }
      
      setSuggestedUsers(suggestions);
    } catch (error) {
      console.error('Failed to load suggested users:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      setSearching(true);
      setSearchResults([]);
      
      // Search by username (exact match or contains)
      const usersQuery = query(
        collection(db, 'users'),
        where('username', '>=', searchQuery),
        where('username', '<=', searchQuery + '\uf8ff'),
        limit(20)
      );
      
      const snapshot = await getDocs(usersQuery);
      const results = [];
      
      snapshot.docs.forEach(doc => {
        const userData = doc.data();
        if (userData.uid !== auth.currentUser.uid && 
            userData.allowUsernameSearch !== false &&
            userData.profileVisibility !== 'private') {
          results.push({
            uid: userData.uid,
            username: userData.username,
            gamesPlayed: userData.gamesPlayed || 0,
            gamesWon: userData.gamesWon || 0,
            profileVisibility: userData.profileVisibility || 'public'
          });
        }
      });
      
      setSearchResults(results);
    } catch (error) {
      console.error('Failed to search users:', error);
      Alert.alert('Error', 'Failed to search users. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const sendFriendRequest = async (targetUserId, username) => {
    try {
      // Check if already friends or request pending
      const existingQuery = query(
        collection(db, 'friends'),
        where('userId', '==', auth.currentUser.uid),
        where('friendId', '==', targetUserId)
      );
      const existingSnapshot = await getDocs(existingQuery);
      
      if (!existingSnapshot.empty) {
        const existing = existingSnapshot.docs[0].data();
        if (existing.status === 'accepted') {
          Alert.alert('Already Friends', `You are already friends with ${username}!`);
          return;
        } else if (existing.status === 'pending') {
          Alert.alert('Request Pending', `Friend request to ${username} is already pending.`);
          return;
        }
      }
      
      // Send friend request
      const requestData = {
        fromUid: auth.currentUser.uid,
        toUid: targetUserId,
        status: 'pending',
        createdAt: new Date(),
        fromUsername: auth.currentUser.displayName || 'Unknown User'
      };
      
      await addDoc(collection(db, 'challenges'), requestData);
      
      Alert.alert('Request Sent', `Friend request sent to ${username}!`);
      playSound('chime');
      
      // Refresh suggestions
      loadSuggestedUsers();
    } catch (error) {
      console.error('Failed to send friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    }
  };

  const renderUserItem = ({ item }) => (
    <View style={[styles.userCard, { backgroundColor: theme.surfaceLight }]}>
      <View style={styles.userInfo}>
        <Text style={[styles.username, { color: theme.textPrimary }]}>{item.username}</Text>
        <Text style={[styles.userStats, { color: theme.textSecondary }]}>
          {item.gamesPlayed} games • {item.gamesWon} wins
        </Text>
        {item.isFriendOfFriend && (
          <Text style={[styles.friendOfFriend, { color: theme.accent }]}>
            👥 Friend of friend
          </Text>
        )}
      </View>
      
      <TouchableOpacity
        style={[styles.addFriendButton, { backgroundColor: theme.primary }]}
        onPress={() => sendFriendRequest(item.uid, item.username)}
      >
        <Text style={[styles.addFriendButtonText, { color: theme.textInverse }]}>
          Add Friend
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderTabButton = (tabName, label, icon) => (
    <TouchableOpacity
      style={[
        styles.tabButton,
        { backgroundColor: activeTab === tabName ? theme.primary : theme.surfaceLight }
      ]}
      onPress={() => setActiveTab(tabName)}
    >
      <Text style={[
        styles.tabButtonText,
        { color: activeTab === tabName ? theme.textInverse : theme.textSecondary }
      ]}>
        {icon} {label}
      </Text>
    </TouchableOpacity>
  );

  const theme = getThemeColors(settings.theme || 'dark');

  return (
    <SafeAreaView style={[styles.screenContainer, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.backButtonText, { color: theme.textPrimary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Find Friends</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {renderTabButton('search', 'Search', '🔍')}
        {renderTabButton('suggestions', 'Suggestions', '💡')}
        {renderTabButton('leaderboard', 'Leaderboard', '🏆')}
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Search Tab */}
        {activeTab === 'search' && (
          <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Search by Username</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
              Find players by searching for their username
            </Text>
            
            <View style={styles.searchContainer}>
              <TextInput
                style={[styles.searchInput, { 
                  backgroundColor: theme.surfaceLight,
                  color: theme.textPrimary,
                  borderColor: theme.border
                }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Enter username..."
                placeholderTextColor={theme.textMuted}
                onSubmitEditing={searchUsers}
              />
              
              <TouchableOpacity
                style={[styles.searchButton, { backgroundColor: theme.primary }]}
                onPress={searchUsers}
                disabled={searching}
              >
                {searching ? (
                  <ActivityIndicator color={theme.textInverse} size="small" />
                ) : (
                  <Text style={[styles.searchButtonText, { color: theme.textInverse }]}>Search</Text>
                )}
              </TouchableOpacity>
            </View>

            {searchResults.length > 0 && (
              <View style={styles.resultsContainer}>
                <Text style={[styles.resultsTitle, { color: theme.textSecondary }]}>
                  Search Results ({searchResults.length})
                </Text>
                <FlatList
                  data={searchResults}
                  renderItem={renderUserItem}
                  keyExtractor={(item) => item.uid}
                  scrollEnabled={false}
                />
              </View>
            )}

            {searchResults.length === 0 && searching && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Searching...</Text>
              </View>
            )}
          </View>
        )}

        {/* Suggestions Tab */}
        {activeTab === 'suggestions' && (
          <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Friend Suggestions</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
              People you might know based on your friends
            </Text>
            
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading suggestions...</Text>
              </View>
            ) : suggestedUsers.length > 0 ? (
              <FlatList
                data={suggestedUsers}
                renderItem={renderUserItem}
                keyExtractor={(item) => item.uid}
                scrollEnabled={false}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: theme.textMuted }]}>
                  No suggestions available yet.{'\n'}
                  Add some friends to get personalized suggestions!
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Leaderboard Tab */}
        {activeTab === 'leaderboard' && (
          <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Top Players</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
              Discover top players on the leaderboard
            </Text>
            
            <View style={styles.leaderboardInfo}>
              <Text style={[styles.infoText, { color: theme.textMuted }]}>
                The leaderboard shows top players based on games won and win rate.{'\n\n'}
                You can send friend requests to players you'd like to challenge!
              </Text>
            </View>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
              onPress={() => navigation.navigate('Leaderboard')}
            >
              <Text style={[styles.actionButtonText, { color: theme.textInverse }]}>
                View Full Leaderboard
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Information Section */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>How Friend Discovery Works</Text>
          
          <View style={styles.infoContainer}>
            <Text style={[styles.infoTitle, { color: theme.textSecondary }]}>Current Limitations:</Text>
            <Text style={[styles.infoText, { color: theme.textMuted }]}>
              • Username search requires exact or partial matches{'\n'}
              • No public user directory{'\n'}
              • Players must know usernames to connect{'\n'}
              • Limited discovery options
            </Text>
            
            <Text style={[styles.infoTitle, { color: theme.textSecondary, marginTop: 16 }]}>New Features:</Text>
            <Text style={[styles.infoText, { color: theme.textMuted }]}>
              • Friend suggestions based on your network{'\n'}
              • Leaderboard discovery{'\n'}
              • Privacy-controlled visibility{'\n'}
              • Multiple discovery methods
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default FriendDiscoveryScreen;


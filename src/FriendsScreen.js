import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, setDoc, onSnapshot, query, where, collection, updateDoc, arrayUnion } from 'firebase/firestore';
import friendsService from './friendsService';
import styles from './styles';
import { playSound } from './soundsUtil';

const FriendsScreen = () => {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('friends'); // 'friends', 'requests', 'challenges'

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        friendsService.setCurrentUser(currentUser);
        
        // Set up listeners
        const friendsUnsubscribe = friendsService.listenToFriends(setFriends);
        const requestsUnsubscribe = friendsService.listenToFriendRequests(setFriendRequests);
        const challengesUnsubscribe = friendsService.listenToChallenges(setChallenges);
        
        return () => {
          if (friendsUnsubscribe) friendsUnsubscribe();
          if (requestsUnsubscribe) requestsUnsubscribe();
          if (challengesUnsubscribe) challengesUnsubscribe();
        };
      }
    });
    
    return () => {
      unsubscribeAuth();
      friendsService.cleanup();
    };
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      Alert.alert('Search Error', 'Please enter at least 2 characters to search');
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await friendsService.searchUsers(searchQuery.trim());
      setSearchResults(results);
    } catch (error) {
      console.error('FriendsScreen: Search failed:', error);
      Alert.alert('Search Error', 'Failed to search users. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async (toUserId) => {
    try {
      await friendsService.sendFriendRequest(toUserId);
      Alert.alert('Success', 'Friend request sent!');
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('FriendsScreen: Failed to send friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    }
  };

  const acceptFriendRequest = async (fromUserId) => {
    try {
      await friendsService.acceptFriendRequest(fromUserId);
      await playSound('chime');
    } catch (error) {
      console.error('FriendsScreen: Failed to accept friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    }
  };

  const declineFriendRequest = async (fromUserId) => {
    try {
      await friendsService.declineFriendRequest(fromUserId);
    } catch (error) {
      console.error('FriendsScreen: Failed to decline friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request. Please try again.');
    }
  };

  const removeFriend = async (friendUserId) => {
    Alert.alert(
      'Remove Friend',
      'Are you sure you want to remove this friend?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await friendsService.removeFriend(friendUserId);
              Alert.alert('Success', 'Friend removed successfully');
            } catch (error) {
              console.error('FriendsScreen: Failed to remove friend:', error);
              Alert.alert('Error', 'Failed to remove friend. Please try again.');
            }
          }
        }
      ]
    );
  };

  const sendChallenge = async (friendUserId, wordLength = 5) => {
    try {
      const challengeId = await friendsService.sendChallenge(friendUserId, wordLength);
      Alert.alert('Challenge Sent!', 'Your friend will be notified of the challenge.');
      setShowInviteModal(false);
      await playSound('chime');
    } catch (error) {
      console.error('FriendsScreen: Failed to send challenge:', error);
      Alert.alert('Error', 'Failed to send challenge. Please try again.');
    }
  };

  const acceptChallenge = async (challenge) => {
    try {
      const gameId = await friendsService.acceptChallenge(challenge.challengeId);
      Alert.alert('Challenge Accepted!', 'Starting the game...');
      
      // Navigate to the game
      navigation.navigate('Game', {
        gameMode: 'pvp',
        gameId: gameId,
        playerId: user.uid,
        showDifficulty: false,
        gameState: 'setWord',
        isCreator: false,
        wordLength: challenge.wordLength
      });
      
      await playSound('chime');
    } catch (error) {
      console.error('FriendsScreen: Failed to accept challenge:', error);
      Alert.alert('Error', 'Failed to accept challenge. Please try again.');
    }
  };

  const declineChallenge = async (challenge) => {
    try {
      await friendsService.declineChallenge(challenge.challengeId);
      Alert.alert('Challenge Declined', 'The challenge has been declined.');
    } catch (error) {
      console.error('FriendsScreen: Failed to decline challenge:', error);
      Alert.alert('Error', 'Failed to decline challenge. Please try again.');
    }
  };

  const renderSearchResult = ({ item }) => (
    <View style={styles.friendItem}>
      <View style={{ flex: 1 }}>
        <Text style={styles.friendText}>{item.username}</Text>
        {item.email && <Text style={styles.friendSubtext}>{item.email}</Text>}
      </View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#10B981' }]}
        onPress={() => sendFriendRequest(item.id)}
      >
        <Text style={styles.buttonText}>Add Friend</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFriend = ({ item }) => (
    <View style={styles.friendItem}>
      <View style={{ flex: 1 }}>
        <Text style={styles.friendText}>{item.username}</Text>
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          setSelectedFriend(item);
          setShowInviteModal(true);
        }}
      >
        <Text style={styles.buttonText}>Challenge</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#EF4444', marginLeft: 8 }]}
        onPress={() => removeFriend(item.id)}
      >
        <Text style={styles.buttonText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFriendRequest = ({ item }) => (
    <View style={styles.friendItem}>
      <View style={{ flex: 1 }}>
        <Text style={styles.friendText}>Request from {item.fromUsername || 'Unknown'}</Text>
        <Text style={styles.friendSubtext}>{new Date(item.timestamp).toLocaleDateString()}</Text>
      </View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#10B981' }]}
        onPress={() => acceptFriendRequest(item.from)}
      >
        <Text style={styles.buttonText}>Accept</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#EF4444', marginLeft: 8 }]}
        onPress={() => declineFriendRequest(item.from)}
      >
        <Text style={styles.buttonText}>Decline</Text>
      </TouchableOpacity>
    </View>
  );

  const renderChallenge = ({ item }) => (
    <View style={styles.friendItem}>
      <View style={{ flex: 1 }}>
        <Text style={styles.friendText}>Challenge from {item.senderUsername}</Text>
        <Text style={styles.friendSubtext}>{item.wordLength} letters • {new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#10B981' }]}
        onPress={() => acceptChallenge(item)}
      >
        <Text style={styles.buttonText}>Accept</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#EF4444', marginLeft: 8 }]}
        onPress={() => declineChallenge(item)}
      >
        <Text style={styles.buttonText}>Decline</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTabButton = (tabName, label, count = 0) => (
    <TouchableOpacity
      style={[
        styles.tabButton,
        activeTab === tabName && styles.activeTabButton
      ]}
      onPress={() => setActiveTab(tabName)}
    >
      <Text style={[
        styles.tabButtonText,
        activeTab === tabName && styles.activeTabButtonText
      ]}>
        {label}
      </Text>
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'friends':
        return (
          <>
            <Text style={styles.sectionHeader}>My Friends ({friends.length})</Text>
            {friends.length === 0 ? (
              <Text style={styles.emptyText}>No friends yet. Search for users to add friends!</Text>
            ) : (
              <FlatList
                data={friends}
                renderItem={renderFriend}
                keyExtractor={item => item.id}
                style={{ maxHeight: 300 }}
              />
            )}
          </>
        );
      
      case 'requests':
        return (
          <>
            <Text style={styles.sectionHeader}>Friend Requests ({friendRequests.length})</Text>
            {friendRequests.length === 0 ? (
              <Text style={styles.emptyText}>No pending friend requests</Text>
            ) : (
              <FlatList
                data={friendRequests}
                renderItem={renderFriendRequest}
                keyExtractor={item => item.from}
                style={{ maxHeight: 300 }}
              />
            )}
          </>
        );
      
      case 'challenges':
        return (
          <>
            <Text style={styles.sectionHeader}>Game Challenges ({challenges.length})</Text>
            {challenges.length === 0 ? (
              <Text style={styles.emptyText}>No pending game challenges</Text>
            ) : (
              <FlatList
                data={challenges}
                renderItem={renderChallenge}
                keyExtractor={item => item.challengeId}
                style={{ maxHeight: 300 }}
              />
            )}
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.screenContainer}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>Friends & Challenges</Text>
        
        {/* Search Section */}
        <View style={styles.searchSection}>
          <Text style={styles.sectionHeader}>Find Friends</Text>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.input}
              placeholder="Search by username or email"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity
              style={[styles.button, { marginLeft: 8 }]}
              onPress={handleSearch}
              disabled={isSearching}
            >
              <Text style={styles.buttonText}>
                {isSearching ? 'Searching...' : 'Search'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {searchResults.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Search Results</Text>
              <FlatList
                data={searchResults}
                renderItem={renderSearchResult}
                keyExtractor={item => item.id}
                style={{ maxHeight: 200 }}
              />
            </>
          )}
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          {renderTabButton('friends', 'Friends', friends.length)}
          {renderTabButton('requests', 'Requests', friendRequests.length)}
          {renderTabButton('challenges', 'Challenges', challenges.length)}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {renderContent()}
        </View>
      </ScrollView>

      {/* Challenge Modal */}
      <Modal visible={showInviteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow]}>
            <Text style={styles.header}>Challenge {selectedFriend?.username}</Text>
            <Text style={styles.modalText}>Select word length for the challenge:</Text>
            
            <View style={styles.wordLengthContainer}>
              {[4, 5, 6, 7, 8].map((length) => (
                <TouchableOpacity
                  key={length}
                  style={styles.wordLengthButton}
                  onPress={() => sendChallenge(selectedFriend?.id, length)}
                >
                  <Text style={styles.wordLengthButtonText}>{length} Letters</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#6B7280' }]}
              onPress={() => setShowInviteModal(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default FriendsScreen;
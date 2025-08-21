import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, orderBy, limit, getDocs, addDoc, onSnapshot, updateDoc, doc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const AddFriendsScreen = () => {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('add'); // 'add' or 'requests'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  // Listen for pending friend requests
  useEffect(() => {
    if (activeTab === 'requests') {
      const requestsQuery = query(
        collection(db, 'friendRequests'),
        where('to', '==', auth.currentUser.uid),
        where('status', '==', 'pending')
      );

      const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
        const requests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPendingRequests(requests);
      });

      return () => unsubscribe();
    }
  }, [activeTab]);

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter a username to search for.');
      return;
    }

    setLoading(true);
    try {
      const trimmedQuery = searchQuery.trim();
      console.log('🔍 Starting search for:', trimmedQuery);
      
      // Query users by username
      const usersQuery = query(
        collection(db, 'users'),
        where('username', '>=', trimmedQuery),
        where('username', '<=', trimmedQuery + '\uf8ff'),
        orderBy('username'),
        limit(10)
      );

      const querySnapshot = await getDocs(usersQuery);
      const users = querySnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      }));

      console.log('🔍 Search completed, found:', users.length, 'users');
      setSearchResults(users);
    } catch (error) {
      console.error('Search failed:', error);
      Alert.alert('Search Failed', 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (user) => {
    try {
      const requestData = {
        from: auth.currentUser.uid,
        fromUsername: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown',
        to: user.uid,
        toUsername: user.username || user.displayName || 'Unknown',
        status: 'pending',
        timestamp: new Date()
      };

      await addDoc(collection(db, 'friendRequests'), requestData);
      
      Alert.alert('Success', `Friend request sent to ${user.username || user.displayName}!`);
      playSound('chime');
      
      // Clear search results
      setSearchResults([]);
      setSearchQuery('');
    } catch (error) {
      console.error('Failed to send friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    }
  };

  const acceptFriendRequest = async (request) => {
    try {
      // Update request status
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'accepted',
        acceptedAt: new Date()
      });

      // Update current user's friends list
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        friends: arrayUnion(request.from)
      });

      // Also update the other user's friends list for mutual friendship
      await updateDoc(doc(db, 'users', request.from), {
        friends: arrayUnion(auth.currentUser.uid)
      });

      Alert.alert('Success', `You are now friends with ${request.fromUsername}!`);
      playSound('chime');
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    }
  };

  const declineFriendRequest = async (request) => {
    try {
      await deleteDoc(doc(db, 'friendRequests', request.id));
      Alert.alert('Declined', 'Friend request declined.');
      playSound('chime');
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request. Please try again.');
    }
  };

  const renderSearchResult = ({ item }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        <Text style={styles.username}>
          {item.username || item.displayName || 'Unknown User'}
        </Text>
        <Text style={styles.userEmail}>
          {item.email}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.button, styles.addButton]}
        onPress={() => sendFriendRequest(item)}
      >
        <Text style={styles.buttonText}>Add Friend</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRequest = ({ item }) => (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <Text style={styles.requestUsername}>
          {item.fromUsername || 'Unknown User'}
        </Text>
        <Text style={styles.requestText}>wants to be your friend</Text>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => acceptFriendRequest(item)}
        >
          <Text style={styles.buttonText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={() => declineFriendRequest(item)}
        >
          <Text style={styles.buttonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.screenContainer}>
      <Text style={styles.header}>Friends Management</Text>
      
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'add' && styles.activeTabButton]}
          onPress={() => setActiveTab('add')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'add' && styles.activeTabButtonText]}>
            Add Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'requests' && styles.activeTabButton]}
          onPress={() => setActiveTab('requests')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'requests' && styles.activeTabButtonText]}>
            Friend Requests {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'add' ? (
        <>
          {/* Search Section */}
          <View style={styles.searchSection}>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by username..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.searchButton, loading && styles.disabledButton]}
                onPress={searchUsers}
                disabled={loading}
              >
                <Text style={styles.searchButtonText}>
                  {loading ? 'Searching...' : 'Search'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <View style={styles.searchResults}>
              <Text style={styles.resultsTitle}>Search Results ({searchResults.length})</Text>
              <FlatList
                data={searchResults}
                renderItem={renderSearchResult}
                keyExtractor={item => item.uid}
                style={{ maxHeight: 400 }}
                showsVerticalScrollIndicator={false}
              />
            </View>
          )}

          {/* No Results Message */}
          {searchResults.length === 0 && searchQuery.trim() && !loading && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No users found with that username.</Text>
              <Text style={styles.emptySubtext}>Try a different search term.</Text>
            </View>
          )}
        </>
      ) : (
        <>
          {/* Friend Requests */}
          {pendingRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No pending friend requests</Text>
              <Text style={styles.emptySubtext}>When someone sends you a friend request, it will appear here.</Text>
            </View>
          ) : (
            <View style={styles.requestsContainer}>
              <Text style={styles.resultsTitle}>Pending Requests ({pendingRequests.length})</Text>
              <FlatList
                data={pendingRequests}
                renderItem={renderRequest}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
              />
            </View>
          )}
        </>
      )}

      {/* Back Button */}
      <TouchableOpacity
        style={styles.textButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.textButtonText}>Back to Friends</Text>
      </TouchableOpacity>
    </View>
  );
};

export default AddFriendsScreen;

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, orderBy, limit, getDocs, addDoc, onSnapshot, updateDoc, doc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';
import { getNotificationService } from './notificationService';
import friendsService from './friendsService';
import notificationPermissionHelper from './notificationPermissionHelper';

// ⚠️ SYSTEM MISMATCH WARNING ⚠️
// This file uses the OLD friendRequests collection system
// Other files (FriendRequestsScreen.js, friendsService.js) use the NEW subcollection system
// This mismatch is causing friend requests to not appear properly
console.warn('🚨 [AddFriendsScreen] Using OLD friendRequests collection system - this may cause issues with other screens');

const AddFriendsScreen = () => {
  console.log('🔍 [AddFriendsScreen] Component rendering');
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('add'); // 'add' or 'requests'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  // Listen for pending friend requests
  useEffect(() => {
    if (activeTab === 'requests') {
      console.log('🔍 [AddFriendsScreen] Setting up friend request listener');
      console.log('🔍 [AddFriendsScreen] Current user ID:', auth.currentUser?.uid);
      
      const requestsQuery = query(
        collection(db, 'friendRequests'),
        where('toUid', '==', auth.currentUser.uid),
        where('status', '==', 'pending')
      );

      console.log('🔍 [AddFriendsScreen] Querying OLD friendRequests collection for user:', auth.currentUser?.uid);
      console.log('🔍 [AddFriendsScreen] Query: where("toUid", "==", "' + auth.currentUser.uid + '") AND where("status", "==", "pending")');

      const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
        console.log('🔍 [AddFriendsScreen] Friend request listener triggered');
        console.log('🔍 [AddFriendsScreen] Snapshot size:', snapshot.docs.length);
        console.log('🔍 [AddFriendsScreen] Snapshot docs:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const requests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log('🔍 [AddFriendsScreen] Processed requests:', requests);
        setPendingRequests(requests);
      }, (error) => {
        console.error('❌ [AddFriendsScreen] Friend request listener error:', error);
      });

      return () => {
        console.log('🔍 [AddFriendsScreen] Cleaning up friend request listener');
        unsubscribe();
      };
    }
  }, [activeTab]);

  const searchUsers = async () => {
    console.log('🔍 [AddFriendsScreen] searchUsers function called!');
    console.log('🔍 [AddFriendsScreen] searchQuery:', searchQuery);
    
    if (!searchQuery.trim()) {
      console.log('🔍 [AddFriendsScreen] Empty search query, showing alert');
      Alert.alert('Error', 'Please enter a username to search for.');
      return;
    }

    setLoading(true);
    try {
      const trimmedQuery = searchQuery.trim();
      console.log('🔍 [AddFriendsScreen] Searching for username:', trimmedQuery);
      
      // Use the friendsService searchUsers function which has better error handling
      const users = await friendsService.searchUsers(trimmedQuery);
      
      console.log('🔍 [AddFriendsScreen] Search results from friendsService:', users.length);
      users.forEach(user => {
        console.log('🔍 [AddFriendsScreen] Found user:', user.username, 'ID:', user.id);
      });

      // Convert to the format expected by this component
      const formattedUsers = users.map(user => ({
        uid: user.id,
        username: user.username,
        displayName: user.displayName,
        photoURL: user.photoURL,
        friendshipStatus: user.friendshipStatus
      }));

      console.log('🔍 [AddFriendsScreen] Formatted users:', formattedUsers.length);
      setSearchResults(formattedUsers);
    } catch (error) {
      console.error('🔍 [AddFriendsScreen] Search failed:', error);
      console.error('🔍 [AddFriendsScreen] Error details:', error.message, error.code);
      Alert.alert('Search Failed', `Please try again. Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (user) => {
    try {
      // Industry standard: Ask for notification permissions at relevant moment
      const currentUserId = auth.currentUser?.uid;
      if (currentUserId) {
        await notificationPermissionHelper.requestAtContext('friend_request', currentUserId);
      }
      
      // Proceed with friend request regardless of permission result
      proceedWithFriendRequest(user);
    } catch (error) {
      console.error('❌ [AddFriendsScreen] Failed to send friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    }
  };

  const proceedWithFriendRequest = async (user) => {
    try {
      console.log('🔍 [AddFriendsScreen] Starting friend request process');
      console.log('🔍 [AddFriendsScreen] Current user:', auth.currentUser?.uid, auth.currentUser?.displayName);
      console.log('🔍 [AddFriendsScreen] Target user:', user.uid, user.username || user.displayName);
      
      // Check if a request already exists
      console.log('🔍 [AddFriendsScreen] Checking for existing friend request...');
      const existingRequestQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', auth.currentUser.uid),
        where('toUid', '==', user.uid),
        where('status', '==', 'pending')
      );
      
      const existingRequestSnapshot = await getDocs(existingRequestQuery);
      console.log('🔍 [AddFriendsScreen] Existing request query results:', existingRequestSnapshot.docs.length, 'documents found');
      
      if (!existingRequestSnapshot.empty) {
        console.log('🔍 [AddFriendsScreen] Duplicate request detected - preventing send');
        Alert.alert('Request Already Sent', `You have already sent a friend request to ${user.username || user.displayName}.`);
        return;
      }
      
      console.log('🔍 [AddFriendsScreen] No existing request found - proceeding with new request');
      
      const requestData = {
        fromUid: auth.currentUser.uid,
        fromUsername: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown',
        toUid: user.uid,
        toUsername: user.username || user.displayName || 'Unknown',
        status: 'pending',
        timestamp: new Date()
      };

      console.log('🔍 [AddFriendsScreen] Request data to be saved:', requestData);
      console.log('🔍 [AddFriendsScreen] Using OLD friendRequests collection system');

      const docRef = await addDoc(collection(db, 'friendRequests'), requestData);
      console.log('🔍 [AddFriendsScreen] Friend request document created with ID:', docRef.id);
      
      Alert.alert('Success', `Friend request sent to ${user.username || user.displayName}!`);
      playSound('chime');
      
      // Clear search results
      setSearchResults([]);
      setSearchQuery('');
    } catch (error) {
      console.error('❌ [AddFriendsScreen] Failed to send friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    }
  };

  const acceptFriendRequest = async (request) => {
    try {
      console.log('🔍 [AddFriendsScreen] Accepting friend request from:', request.fromUid);
      
      // Update request status
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'accepted',
        acceptedAt: new Date()
      });
      console.log('🔍 [AddFriendsScreen] Updated request status to accepted');

      // Clear any redundant friend requests between these two users
      console.log('🔍 [AddFriendsScreen] Clearing redundant friend requests...');
      const redundantRequestsQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', auth.currentUser.uid),
        where('toUid', '==', request.fromUid),
        where('status', '==', 'pending')
      );
      
      const redundantSnapshot = await getDocs(redundantRequestsQuery);
      console.log('🔍 [AddFriendsScreen] Found', redundantSnapshot.docs.length, 'redundant requests to clear');
      
      // Delete all redundant requests
      const deletePromises = redundantSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      console.log('🔍 [AddFriendsScreen] Cleared', redundantSnapshot.docs.length, 'redundant requests');

      // Update current user's friends list
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        friends: arrayUnion(request.fromUid)
      });
      console.log('🔍 [AddFriendsScreen] Updated current user friends list');

      // Also update the other user's friends list for mutual friendship
      await updateDoc(doc(db, 'users', request.fromUid), {
        friends: arrayUnion(auth.currentUser.uid)
      });
      console.log('🔍 [AddFriendsScreen] Updated other user friends list');

      Alert.alert('Success', `You are now friends with ${request.fromUsername}!`);
      playSound('chime');
    } catch (error) {
      console.error('❌ [AddFriendsScreen] Failed to accept friend request:', error);
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
    <SafeAreaView style={styles.screenContainer}>
      <Text style={styles.header}>Friends & Challenges</Text>
      
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'add' && styles.activeTabButton]}
          onPress={() => {
            setActiveTab('add');
            playSound('toggleTab').catch(() => {});
          }}
        >
          <Text style={[styles.tabButtonText, activeTab === 'add' && styles.activeTabButtonText]}>
            Add Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'requests' && styles.activeTabButton]}
          onPress={() => {
            setActiveTab('requests');
            playSound('toggleTab').catch(() => {});
          }}
        >
          <Text style={[styles.tabButtonText, activeTab === 'requests' && styles.activeTabButtonText]}>
            Friend Requests {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'add' ? (
        <>
          {console.log('🔍 [AddFriendsScreen] Rendering search section, activeTab:', activeTab)}
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
                onPress={() => {
                  console.log('🔍 [AddFriendsScreen] Search button pressed!');
                  console.log('🔍 [AddFriendsScreen] Loading state:', loading);
                  console.log('🔍 [AddFriendsScreen] Search query:', searchQuery);
                  searchUsers();
                }}
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
        onPress={() => {
          playSound('backspace').catch(() => {});
          navigation.goBack();
        }}
      >
        <Text style={styles.textButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default AddFriendsScreen;

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, Share, Linking, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, orderBy, limit, getDocs, addDoc, onSnapshot, updateDoc, doc, arrayUnion, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';
import { getNotificationService } from './notificationService';
import friendsService from './friendsService';
import notificationPermissionHelper from './notificationPermissionHelper';
import logger from './logger';

// ✅ UPDATED TO USE NEW SUBCONNECTION SYSTEM ⚠️
// This file now uses the NEW subcollection system (users/{userId}/friends/{friendId})
// Consistent with FriendRequestsScreen.js and friendsService.js
logger.debug('✅ [AddFriendsScreen] Using NEW subcollection system - consistent with other screens');

const AddFriendsScreen = () => {
  logger.debug('🔍 [AddFriendsScreen] Component rendering');
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('add'); // 'add' or 'requests'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  // Share app link function
  const shareAppLink = async () => {
    try {
      // App Store links
      const androidUrl = "https://play.google.com/store/apps/details?id=com.whatword.app";
      const iosUrl = "https://apps.apple.com/app/whatword/id6752830019";
      
      const shareMessage = "Let's play WhatWord! - the ultimate word guessing game.\n\nGuess my word before I guess yours!\n\n📱 Download now:\n\niPhone: " + iosUrl + "\n\nAndroid: " + androidUrl;
      
      await Share.share({
        message: shareMessage,
        title: 'WhatWord - Word Game'
      });
      
      playSound('chime');
    } catch (error) {
      console.error('Failed to share app link:', error);
      Alert.alert('Error', 'Failed to share app link. Please try again.');
    }
  };

  // Listen for pending friend requests
  useEffect(() => {
    if (activeTab === 'requests') {
      logger.debug('🔍 [AddFriendsScreen] Setting up friend request listener');
      logger.debug('🔍 [AddFriendsScreen] Current user ID:', auth.currentUser?.uid);
      
      const requestsQuery = query(
        collection(db, 'users', auth.currentUser.uid, 'friends'),
        where('status', '==', 'pending')
      );

      logger.debug('🔍 [AddFriendsScreen] Querying NEW subcollection system for user:', auth.currentUser?.uid);

      const unsubscribe = onSnapshot(requestsQuery, async (snapshot) => {
        logger.debug('🔍 [AddFriendsScreen] Friend request listener triggered');
        logger.debug('🔍 [AddFriendsScreen] Snapshot size:', snapshot.docs.length);
        logger.debug('🔍 [AddFriendsScreen] Snapshot docs:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const requests = [];
        for (const requestDocSnapshot of snapshot.docs) {
          const requestData = requestDocSnapshot.data();
          logger.debug('🔍 [AddFriendsScreen] Processing request from:', requestDocSnapshot.id, 'with data:', requestData);
          
          // Get the sender's user profile
          const userDocRef = await getDoc(doc(db, 'users', requestDocSnapshot.id));
          if (userDocRef.exists()) {
            const userData = userDocRef.data();
            logger.debug('🔍 [AddFriendsScreen] Found user profile for:', requestDocSnapshot.id, userData);
            
            requests.push({
              id: requestDocSnapshot.id,
              fromUid: requestDocSnapshot.id,
              fromUsername: requestData.senderUsername || userData.username,
              username: userData.username,
              displayName: userData.displayName,
              status: requestData.status,
              createdAt: requestData.createdAt
            });
          }
        }
        
        logger.debug('🔍 [AddFriendsScreen] Processed requests:', requests);
        setPendingRequests(requests);
      }, (error) => {
        logger.error('❌ [AddFriendsScreen] Friend request listener error:', error);
      });

      return () => {
        logger.debug('🔍 [AddFriendsScreen] Cleaning up friend request listener');
        unsubscribe();
      };
    }
  }, [activeTab]);

  const searchUsers = async () => {
    logger.debug('🔍 [AddFriendsScreen] searchUsers function called!');
    logger.debug('🔍 [AddFriendsScreen] searchQuery:', searchQuery);
    
    if (!searchQuery.trim()) {
      logger.debug('🔍 [AddFriendsScreen] Empty search query, showing alert');
      Alert.alert('Error', 'Please enter a username to search for.');
      return;
    }

    setLoading(true);
    try {
      const trimmedQuery = searchQuery.trim();
      logger.debug('🔍 [AddFriendsScreen] Searching for username:', trimmedQuery);
      
      // Use the friendsService searchUsers function which has better error handling
      const users = await friendsService.searchUsers(trimmedQuery);
      
      logger.debug('🔍 [AddFriendsScreen] Search results from friendsService:', users.length);
      users.forEach(user => {
        logger.debug('🔍 [AddFriendsScreen] Found user:', user.username, 'ID:', user.id);
      });

      // Convert to the format expected by this component
      const formattedUsers = users.map(user => ({
        uid: user.id,
        username: user.username,
        displayName: user.displayName,
        photoURL: user.photoURL,
        friendshipStatus: user.friendshipStatus
      }));

      logger.debug('🔍 [AddFriendsScreen] Formatted users:', formattedUsers.length);
      setSearchResults(formattedUsers);
    } catch (error) {
      logger.error('🔍 [AddFriendsScreen] Search failed:', error);
      logger.error('🔍 [AddFriendsScreen] Error details:', error.message, error.code);
      Alert.alert('Search Failed', `Please try again. Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (user) => {
    try {
      logger.debug('🔍 [AddFriendsScreen] sendFriendRequest called for user:', user);
      
      // Skip notification permission for now to isolate the issue
      // Will re-enable after friend requests are working
      
      // Proceed with friend request
      await proceedWithFriendRequest(user);
    } catch (error) {
      logger.error('❌ [AddFriendsScreen] Failed to send friend request:', error);
      logger.error('❌ [AddFriendsScreen] Error details:', error.message, error.code, error.stack);
      Alert.alert('Error', `Failed to send friend request: ${error.message}`);
    }
  };

  const proceedWithFriendRequest = async (user) => {
    try {
      logger.debug('🔍 [AddFriendsScreen] Starting friend request process');
      logger.debug('🔍 [AddFriendsScreen] Current user:', auth.currentUser?.uid, auth.currentUser?.displayName);
      logger.debug('🔍 [AddFriendsScreen] Target user:', user.uid, user.username || user.displayName);
      
      // Check if a request already exists
      logger.debug('🔍 [AddFriendsScreen] Checking for existing friend request...');
      // Check NEW subcollection system - look for existing request in recipient's friends subcollection
      const existingRequestDoc = await getDoc(doc(db, 'users', user.uid, 'friends', auth.currentUser.uid));
      logger.debug('🔍 [AddFriendsScreen] Existing request check result:', existingRequestDoc.exists());
      
      if (existingRequestDoc.exists()) {
        const existingData = existingRequestDoc.data();
        if (existingData.status === 'pending') {
          logger.debug('🔍 [AddFriendsScreen] Duplicate request detected - preventing send');
          Alert.alert('Request Already Sent', `You have already sent a friend request to ${user.username || user.displayName}.`);
          return;
        }
      }
      
      logger.debug('🔍 [AddFriendsScreen] No existing request found - proceeding with new request');
      
      const requestData = {
        fromUid: auth.currentUser.uid,
        fromUsername: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown',
        toUid: user.uid,
        toUsername: user.username || user.displayName || 'Unknown',
        status: 'pending',
        timestamp: new Date()
      };

      logger.debug('🔍 [AddFriendsScreen] Request data to be saved:', requestData);
      logger.debug('🔍 [AddFriendsScreen] Using NEW subcollection system: users/', user.uid, '/friends/', auth.currentUser.uid);

      // Use NEW subcollection system - create friend document in recipient's friends subcollection
      await setDoc(doc(db, 'users', user.uid, 'friends', auth.currentUser.uid), {
        ...requestData,
        createdAt: new Date().toISOString(),
        senderUsername: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown',
        senderId: auth.currentUser.uid
      });
      logger.debug('🔍 [AddFriendsScreen] Friend request document created successfully');
      
      Alert.alert('Success', `Friend request sent to ${user.username || user.displayName}!`);
      playSound('chime');
      
      // Clear search results and dismiss keyboard
      setSearchResults([]);
      setSearchQuery('');
      Keyboard.dismiss();
    } catch (error) {
      logger.error('❌ [AddFriendsScreen] Failed to send friend request:', error);
      logger.error('❌ [AddFriendsScreen] Error details:', error.message, error.code, error.stack);
      Alert.alert('Error', `Failed to send friend request: ${error.message || 'Unknown error'}`);
    }
  };

  const acceptFriendRequest = async (request) => {
    try {
      logger.debug('🔍 [AddFriendsScreen] Accepting friend request from:', request.fromUid);
      
      // Update request status in current user's friends subcollection
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'friends', request.fromUid), {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      });
      logger.debug('🔍 [AddFriendsScreen] Updated request status to accepted');

      // Clear any redundant friend requests between these two users
      logger.debug('🔍 [AddFriendsScreen] Clearing redundant friend requests...');
      
      // Check for redundant requests from current user to the sender
      const redundantRequestDoc = doc(db, 'users', request.fromUid, 'friends', auth.currentUser.uid);
      const redundantRequestSnapshot = await getDoc(redundantRequestDoc);
      
      if (redundantRequestSnapshot.exists()) {
        const redundantData = redundantRequestSnapshot.data();
        if (redundantData.status === 'pending') {
          logger.debug('🔍 [AddFriendsScreen] Found redundant request to clear');
          await deleteDoc(redundantRequestDoc);
          logger.debug('🔍 [AddFriendsScreen] Cleared redundant request');
        }
      }

      // Create mutual friendship in sender's friends subcollection
      await setDoc(doc(db, 'users', request.fromUid, 'friends', auth.currentUser.uid), {
        status: 'accepted',
        createdAt: request.createdAt || new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
        senderUsername: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown',
        senderId: auth.currentUser.uid
      });
      logger.debug('🔍 [AddFriendsScreen] Created mutual friendship');

      Alert.alert('Success', `You are now friends with ${request.fromUsername || request.username}!`);
      playSound('chime');
    } catch (error) {
      logger.error('❌ [AddFriendsScreen] Failed to accept friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    }
  };

  const declineFriendRequest = async (request) => {
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'friends', request.fromUid));
      Alert.alert('Declined', 'Friend request declined.');
      playSound('chime');
    } catch (error) {
      logger.error('Failed to decline friend request:', error);
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
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { paddingTop: insets.top }]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
          {logger.debug('🔍 [AddFriendsScreen] Rendering search section, activeTab:', activeTab)}
          {/* Share App Link Section */}
          <View style={styles.shareSection}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={shareAppLink}
            >
              <Text style={styles.shareButtonText}>Share App with Friends</Text>
            </TouchableOpacity>
          </View>
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
                  logger.debug('🔍 [AddFriendsScreen] Search button pressed!');
                  logger.debug('🔍 [AddFriendsScreen] Loading state:', loading);
                  logger.debug('🔍 [AddFriendsScreen] Search query:', searchQuery);
                  Keyboard.dismiss(); // Dismiss keyboard when search is initiated
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
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

export default AddFriendsScreen;

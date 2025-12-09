import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, TextInput, Modal, ScrollView, Keyboard, TouchableWithoutFeedback, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove, getDocs, addDoc, getDoc, setDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';
import logger from './logger';
import { useTheme } from './ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import friendsService from './friendsService';
import AnimatedMeshGradient from './AnimatedMeshGradient';

const FriendsManagementScreen = ({ onClearNotifications }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  
  // State for different tabs
  const [activeTab, setActiveTab] = useState('add'); // 'add', 'requests', 'friends'
  
  // Friends list
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  
  // Friend requests
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  
  // Add friends
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  
  // Requests tab badge - start as false so badge shows by default when there are requests
  const [requestsTabBadgeCleared, setRequestsTabBadgeCleared] = useState(false);
  const [badgeStateLoaded, setBadgeStateLoaded] = useState(false);

  // Load requests tab badge cleared state from AsyncStorage
  useEffect(() => {
    loadRequestsTabBadgeState();
  }, []);

  // Initialize friendsService with current user
  useEffect(() => {
    if (auth.currentUser) {
      friendsService.setCurrentUser(auth.currentUser);
    }
  }, []);

  // Share app link function
  const shareAppLink = async () => {
    try {
      // Play sound BEFORE opening share dialog to avoid background audio issues
      console.log('FriendsManagementScreen: Playing rank sound before share');
      playSound('rank');
      
      // Small delay to ensure sound starts playing before share dialog opens
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // App Store links
      const androidUrl = "https://play.google.com/store/apps/details?id=com.whatword.app";
      const iosUrl = "https://apps.apple.com/app/whatword/id6752830019";
      
      const shareMessage = "Let's play WhatWord! - the ultimate word guessing game.\n\nGuess my word before I guess yours!\n\n📱 Download now:\n\niPhone: " + iosUrl + "\n\nAndroid: " + androidUrl;
      
      await Share.share({
        message: shareMessage,
        title: 'WhatWord - Word Game'
      });
    } catch (error) {
      console.error('Failed to share app link:', error);
      Alert.alert('Error', 'Failed to share app link. Please try again.');
    }
  };

  const loadRequestsTabBadgeState = async () => {
    try {
      const storedBadgeCleared = await AsyncStorage.getItem('requestsTabBadgeCleared');
      if (storedBadgeCleared) {
        const wasCleared = JSON.parse(storedBadgeCleared);
        setRequestsTabBadgeCleared(wasCleared);
      }
      setBadgeStateLoaded(true);
    } catch (error) {
      logger.error('Failed to load requests tab badge state:', error);
      setBadgeStateLoaded(true);
    }
  };

  const saveRequestsTabBadgeCleared = async (cleared) => {
    try {
      await AsyncStorage.setItem('requestsTabBadgeCleared', JSON.stringify(cleared));
    } catch (error) {
      logger.error('Failed to save requests tab badge cleared state:', error);
    }
  };

  const clearRequestsTabBadge = () => {
    setRequestsTabBadgeCleared(true);
    saveRequestsTabBadgeCleared(true);
  };

  const getRequestsTabBadgeCount = () => {
    // Show badge if there are pending requests
    // Only hide the badge if it has been explicitly cleared by the user
    if (pendingRequests.length === 0) return 0;
    
    // If badge state hasn't loaded yet, show the badge (default behavior)
    if (!badgeStateLoaded) return pendingRequests.length;
    
    // If badge state has loaded, respect the cleared state
    const count = requestsTabBadgeCleared ? 0 : pendingRequests.length;
    
        return count;
  };

  // Load friends list
  useEffect(() => {
    if (activeTab === 'friends') {
      loadFriends();
    }
  }, [activeTab]);

  // Load friend requests immediately when component mounts
  useEffect(() => {
    const unsubscribe = loadFriendRequests();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []); // Empty dependency array - load once on mount

  // Clear search results when navigating away from the Friends screen
  useFocusEffect(
    React.useCallback(() => {
      // This runs when the screen comes into focus
      return () => {
        // This cleanup function runs when the screen loses focus
        setSearchResults([]);
        setSearchQuery('');
      };
    }, [])
  );

  const loadFriends = async () => {
    try {
      setLoadingFriends(true);
      
      console.log('🔍 [FriendsManagementScreen] Loading friends using NEW subcollection system');
      
      // Get friends from NEW subcollection system
      const friendsRef = collection(db, 'users', auth.currentUser.uid, 'friends');
      const friendsQuery = query(friendsRef, where('status', '==', 'accepted'));
      const friendsSnapshot = await getDocs(friendsQuery);
      
      console.log('🔍 [FriendsManagementScreen] Found', friendsSnapshot.docs.length, 'accepted friendships');
      
      if (friendsSnapshot.docs.length > 0) {
        // Get friend profiles
        const friendPromises = friendsSnapshot.docs.map(friendDoc => 
          getDoc(doc(db, 'users', friendDoc.id))
        );
        const friendDocs = await Promise.all(friendPromises);
        
        const friendsList = friendDocs
          .filter(doc => doc.exists())
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        
        console.log('🔍 [FriendsManagementScreen] Loaded', friendsList.length, 'friend profiles');
        setFriends(friendsList);
      } else {
        setFriends([]);
      }
    } catch (error) {
      logger.error('Failed to load friends:', error);
      Alert.alert('Error', 'Failed to load friends list');
    } finally {
      setLoadingFriends(false);
    }
  };

  const loadFriendRequests = () => {
    try {
      // Check if user is still authenticated
      if (!auth.currentUser) {
        setPendingRequests([]);
        setSentRequests([]);
        setLoadingRequests(false);
        return;
      }
      
      setLoadingRequests(true);
      
      // Load incoming requests with real-time listener using NEW subcollection system
      const incomingQuery = query(
        collection(db, 'users', auth.currentUser.uid, 'friends'),
        where('status', '==', 'pending')
      );
      
      // For outgoing requests, we need to check all users' friend subcollections where we sent requests
      // This is handled differently - we'll track outgoing in a separate collection or query
      // For now, let's focus on incoming requests which is the critical path
      
      // Set up real-time listeners
      const unsubscribeIncoming = onSnapshot(incomingQuery, async (snapshot) => {
        // Check if user is still authenticated before processing
        if (!auth.currentUser) return;
        
        console.log('🔍 [FriendsManagementScreen] Incoming requests snapshot size:', snapshot.docs.length);
        
        // In NEW subcollection system, the document ID IS the sender's UID
        const incoming = snapshot.docs.map(doc => ({ 
          id: doc.id, // This is the sender's UID
          fromUid: doc.id, // Map document ID to fromUid for compatibility
          ...doc.data() 
        }));
        
        console.log('🔍 [FriendsManagementScreen] Incoming requests data:', incoming);
        
        // Fetch usernames for incoming requests
        const requestsWithUsernames = await Promise.all(
          incoming.map(async (request) => {
            try {
              // Use senderId if available (from new system), otherwise use fromUid (document ID)
              const senderUid = request.senderId || request.fromUid || request.id;
              console.log('🔍 [FriendsManagementScreen] Fetching user data for:', senderUid);
              
              const userDoc = await getDoc(doc(db, 'users', senderUid));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const result = {
                  ...request,
                  fromUid: senderUid,
                  fromUsername: request.senderUsername || userData.username || userData.displayName || 'Unknown User'
                };
                console.log('🔍 [FriendsManagementScreen] Processed request:', result);
                return result;
              }
              return { ...request, fromUid: senderUid, fromUsername: 'Unknown User' };
            } catch (error) {
              logger.error('Failed to fetch username for request:', error);
              return { ...request, fromUsername: 'Unknown User' };
            }
          })
        );
        
        console.log('🔍 [FriendsManagementScreen] Final processed requests:', requestsWithUsernames);
        setPendingRequests(requestsWithUsernames);
        setLoadingRequests(false);
        
        // Reset requests tab badge when new requests arrive
        if (requestsWithUsernames.length > 0) {
          setRequestsTabBadgeCleared(false);
          saveRequestsTabBadgeCleared(false);
        }
      }, (error) => {
        // Only log error if user is still authenticated
        if (auth.currentUser) {
          logger.error('Failed to load incoming friend requests:', error);
        }
        setLoadingRequests(false);
      });
      
      // Outgoing requests are harder to track in the NEW subcollection system
      // because they're stored in other users' subcollections
      // For now, we'll just show incoming requests (which is the critical path)
      // TODO: Consider storing outgoing requests in a separate tracking collection
      setSentRequests([]);
      
      // Store unsubscribe functions for cleanup
      return () => {
        unsubscribeIncoming();
      };
    } catch (error) {
      logger.error('Failed to set up friend requests listeners:', error);
      Alert.alert('Error', 'Failed to load friend requests');
      setLoadingRequests(false);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    // Dismiss keyboard when search is initiated
    Keyboard.dismiss();
    
    try {
      setSearching(true);
      console.log('🔍 [FriendsManagementScreen] Searching for username:', searchQuery);
      
      // Use the friendsService searchUsers function which has better error handling
      const users = await friendsService.searchUsers(searchQuery);
      
      console.log('🔍 [FriendsManagementScreen] Search results from friendsService:', users.length);
      users.forEach(user => {
        console.log('🔍 [FriendsManagementScreen] Found user:', user.username, 'ID:', user.id);
      });

      // Convert to the format expected by this component
      const formattedUsers = users.map(user => ({
        id: user.id,
        uid: user.id,
        username: user.username,
        displayName: user.displayName,
        photoURL: user.photoURL,
        friendshipStatus: user.friendshipStatus
      }));

      console.log('🔍 [FriendsManagementScreen] Formatted users:', formattedUsers.length);
      setSearchResults(formattedUsers);
    } catch (error) {
      console.error('🔍 [FriendsManagementScreen] Search failed:', error);
      logger.error('Failed to search users:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setSearching(false);
    }
  };

  const sendFriendRequest = async (user) => {
    try {
      console.log('🔍 [FriendsManagementScreen] Starting friend request process');
      console.log('🔍 [FriendsManagementScreen] Current user:', auth.currentUser?.uid, auth.currentUser?.displayName);
      console.log('🔍 [FriendsManagementScreen] Target user:', user.uid, user.username || user.displayName);
      
      // Check if users are already friends using friendsService
      console.log('🔍 [FriendsManagementScreen] Checking if users are already friends...');
      const areFriends = await friendsService.areFriends(auth.currentUser.uid, user.uid);
      console.log('🔍 [FriendsManagementScreen] Friend check results:', areFriends);
      
      if (areFriends) {
        console.log('🔍 [FriendsManagementScreen] Users are already friends - preventing send');
        Alert.alert('Already Friends', `You are already friends with ${user.username || user.displayName}.`);
        return;
      }
      
      // Check if a request already exists
      console.log('🔍 [FriendsManagementScreen] Checking for existing friend request...');
      // Check NEW subcollection system - look for existing request in recipient's friends subcollection
      const existingRequestDoc = await getDoc(doc(db, 'users', user.uid, 'friends', auth.currentUser.uid));
      console.log('🔍 [FriendsManagementScreen] Existing request check result:', existingRequestDoc.exists());
      
      if (existingRequestDoc.exists()) {
        const existingData = existingRequestDoc.data();
        if (existingData.status === 'pending') {
          console.log('🔍 [FriendsManagementScreen] Duplicate request detected - preventing send');
          Alert.alert('Request Already Sent', `You have already sent a friend request to ${user.username || user.displayName}.`);
          return;
        }
      }
      
      console.log('🔍 [FriendsManagementScreen] No existing request found - proceeding with new request');

      const requestData = {
        fromUid: auth.currentUser.uid,
        fromUsername: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown',
        toUid: user.uid,
        toUsername: user.username || user.displayName || 'Unknown',
        status: 'pending',
        timestamp: new Date()
      };

      console.log('🔍 [FriendsManagementScreen] Request data to be saved:', requestData);
      console.log('🔍 [FriendsManagementScreen] Using NEW subcollection system: users/', user.uid, '/friends/', auth.currentUser.uid);

      // Use NEW subcollection system - create friend document in recipient's friends subcollection
      await setDoc(doc(db, 'users', user.uid, 'friends', auth.currentUser.uid), {
        ...requestData,
        createdAt: new Date().toISOString(),
        senderUsername: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown',
        senderId: auth.currentUser.uid
      });
      console.log('🔍 [FriendsManagementScreen] Friend request document created successfully');
      
      Alert.alert('Success', `Friend request sent to ${user.username || user.displayName}!`);
      playSound('chime');
      
      // Clear search and dismiss keyboard
      setSearchQuery('');
      setSearchResults([]);
      Keyboard.dismiss();
    } catch (error) {
      console.error('❌ [FriendsManagementScreen] Failed to send friend request:', error);
      logger.error('Failed to send friend request:', error);
      logger.error('❌ [FriendsManagementScreen] Error details:', error.message, error.code, error.stack);
      Alert.alert('Error', `Failed to send friend request: ${error.message || 'Unknown error'}`);
    }
  };

  const acceptFriendRequest = async (request) => {
    try {
      console.log('🔍 [FriendsManagementScreen] Accepting friend request from:', request.fromUid || request.from);
      
      // Use friendsService which handles the NEW subcollection system correctly
      await friendsService.acceptFriendRequest(request.fromUid || request.from);
      console.log('🔍 [FriendsManagementScreen] Friend request accepted via friendsService');

      // friendsService already handles updating both users' friend subcollections
      // No need to delete from old system - it doesn't exist there

      Alert.alert('Success', `You are now friends with ${request.fromUsername}!`);
      playSound('chime');
      
      // Clear notifications when request is handled
      if (onClearNotifications) {
        onClearNotifications();
      }
      
      // Reload requests and friends to reflect the change
      loadFriendRequests();
      loadFriends();
    } catch (error) {
      console.error('❌ [FriendsManagementScreen] Failed to accept friend request:', error);
      logger.error('Failed to accept friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    }
  };

  const declineFriendRequest = async (request) => {
    try {
      console.log('🔍 [FriendsManagementScreen] Declining friend request from:', request.fromUid || request.from);
      
      // Use friendsService which handles the NEW subcollection system correctly
      await friendsService.declineFriendRequest(request.fromUid || request.from);
      
      Alert.alert('Declined', 'Friend request declined.');
      playSound('chime');
      
      // Clear notifications when request is handled
      if (onClearNotifications) {
        onClearNotifications();
      }
      
      // Reload requests
      loadFriendRequests();
    } catch (error) {
      logger.error('Failed to decline friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request. Please try again.');
    }
  };

  const cancelFriendRequest = async (request) => {
    try {
      console.log('🔍 [FriendsManagementScreen] Canceling outgoing friend request to:', request.toUid);
      
      // Delete from NEW subcollection system (the request is in the recipient's subcollection)
      await deleteDoc(doc(db, 'users', request.toUid, 'friends', auth.currentUser.uid));
      console.log('🔍 [FriendsManagementScreen] Outgoing request cancelled');
      
      Alert.alert('Cancelled', 'Friend request cancelled.');
      playSound('chime');
      
      // Reload requests
      loadFriendRequests();
    } catch (error) {
      console.error('❌ [FriendsManagementScreen] Failed to cancel friend request:', error);
      logger.error('Failed to cancel friend request:', error);
      Alert.alert('Error', 'Failed to cancel friend request. Please try again.');
    }
  };

  const removeFriend = async (friend) => {
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend.username || friend.displayName} from your friends list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔍 [FriendsManagementScreen] Removing friend:', friend.id, friend.username);
              
              // Use friendsService to remove from NEW subcollection system
              await friendsService.removeFriend(friend.id);
              console.log('🔍 [FriendsManagementScreen] Friend removed via friendsService');

              Alert.alert('Removed', `${friend.username || friend.displayName} has been removed from your friends list.`);
              playSound('chime');
              
              // Reload friends to update UI
              loadFriends();
            } catch (error) {
              console.error('❌ [FriendsManagementScreen] Failed to remove friend:', error);
              logger.error('Failed to remove friend:', error);
              Alert.alert('Error', 'Failed to remove friend. Please try again.');
            }
          }
        }
      ]
    );
  };

  const renderFriend = ({ item }) => (
    <View style={[styles.friendItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.friendInfo}>
        <Text style={styles.friendUsername}>
          {item.username || item.displayName || 'Unknown User'}
        </Text>
        <TouchableOpacity
          style={[
            styles.removeButton, 
            { 
              backgroundColor: colors.error,
              borderColor: colors.error,
            }
          ]}
          onPress={() => removeFriend(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.removeButtonText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSearchResult = ({ item }) => {
    const getButtonText = () => {
      switch (item.friendshipStatus) {
        case 'accepted':
          return 'Friends';
        case 'pending':
          return 'Pending';
        case 'declined':
          return 'Add';
        case 'blocked':
          return 'Blocked';
        default:
          return 'Add';
      }
    };

    const getButtonStyle = () => {
      switch (item.friendshipStatus) {
        case 'accepted':
          return {
            backgroundColor: colors.success || '#4CAF50',
            borderColor: colors.success || '#4CAF50',
          };
        case 'pending':
          return {
            backgroundColor: colors.warning || '#FF9800',
            borderColor: colors.warning || '#FF9800',
          };
        case 'blocked':
          return {
            backgroundColor: colors.error || '#F44336',
            borderColor: colors.error || '#F44336',
          };
        default:
          return {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
          };
      }
    };

    const isButtonDisabled = () => {
      return item.friendshipStatus === 'accepted' || 
             item.friendshipStatus === 'pending' || 
             item.friendshipStatus === 'blocked';
    };

    return (
      <View style={[styles.searchResultItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.searchResultInfo}>
          <Text style={[styles.searchResultUsername, { color: colors.primary }]}>
            {item.username || item.displayName || 'Unknown User'}
          </Text>
          {item.friendshipStatus === 'accepted' && (
            <Text style={[styles.friendshipStatus, { color: colors.success || '#4CAF50' }]}>
              You are already friends
            </Text>
          )}
          {item.friendshipStatus === 'pending' && (
            <Text style={[styles.friendshipStatus, { color: colors.warning || '#FF9800' }]}>
              Friend request pending
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.addButton, 
            getButtonStyle(),
            isButtonDisabled() && { opacity: 0.6 }
          ]}
          onPress={() => !isButtonDisabled() && sendFriendRequest(item)}
          activeOpacity={0.7}
          disabled={isButtonDisabled()}
        >
          <Text style={[styles.buttonText, { color: '#FFFFFF', fontWeight: '600' }]}>
            {getButtonText()}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <AnimatedMeshGradient style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }} />
      <SafeAreaView edges={['left', 'right']} style={[styles.screenContainer, { backgroundColor: 'transparent', paddingTop: insets.top, zIndex: 1 }]}>
      <View style={{ flex: 1 }}>
        {/* Tab Navigation */}
        <View style={[styles.tabContainer, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'add' && styles.activeTab,
            { backgroundColor: activeTab === 'add' ? colors.primary : colors.surface }
          ]}
          onPress={() => {
            setActiveTab('add');
            playSound('toggleTab').catch(() => {});
          }}
        >
          <Text 
            style={[
              styles.tabText,
              { color: activeTab === 'add' ? '#FFFFFF' : '#FFFFFF' }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
          >
            Add Friends
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'requests' && styles.activeTab,
            { backgroundColor: activeTab === 'requests' ? colors.primary : colors.surface }
          ]}
          onPress={async () => {
            setActiveTab('requests');
            // Clear search results when switching away from Add Friends tab
            setSearchResults([]);
            setSearchQuery('');
            // Clear the requests tab badge when clicked
            clearRequestsTabBadge();
            playSound('toggleTab').catch(() => {});
          }}
        >
          <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
            <Text 
              style={[
                styles.tabText,
                { color: activeTab === 'requests' ? '#FFFFFF' : '#FFFFFF' }
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
            >
              Requests
            </Text>
            {/* Notification badge for requests tab */}
            {getRequestsTabBadgeCount() > 0 && (
              <View style={{
                position: 'absolute',
                top: -8,
                right: -8,
                backgroundColor: '#EF4444',
                borderRadius: 10,
                minWidth: 20,
                height: 20,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.background,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
                elevation: 5,
              }}>
                <Text style={{
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 'bold',
                  textAlign: 'center',
                }}>
                  {getRequestsTabBadgeCount() > 99 ? '99+' : getRequestsTabBadgeCount()}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'friends' && styles.activeTab,
            { backgroundColor: activeTab === 'friends' ? colors.primary : colors.surface }
          ]}
          onPress={() => {
            setActiveTab('friends');
            // Clear search results when switching away from Add Friends tab
            setSearchResults([]);
            setSearchQuery('');
            playSound('toggleTab').catch(() => {});
          }}
        >
          <Text 
            style={[
              styles.tabText,
              { color: activeTab === 'friends' ? '#FFFFFF' : '#FFFFFF' }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
          >
            Friends
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar - Only visible when Add Friends tab is active */}
      {activeTab === 'add' && (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ marginTop: 10, marginHorizontal: 20, alignItems: 'center' }}>
            <TextInput
              style={{
                width: '100%',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 6,
                borderWidth: 1,
                fontSize: 16,
                color: 'white',
                fontFamily: 'Roboto-Regular',
                backgroundColor: colors.surface,
                borderColor: colors.border,
                marginBottom: 10,
              }}
              placeholder="username"
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={searchUsers}
              selectionColor="#FFFFFF"
              cursorColor="#FFFFFF"
              autoCorrect={false}
              autoCapitalize="none"
            />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 140,
              }}
              onPress={() => {
                playSound('guess');
                searchUsers();
              }}
              disabled={searching}
            >
              <Text style={{ 
                color: '#FFFFFF', 
                fontSize: 16, 
                fontWeight: '600',
                numberOfLines: 1
              }}>
                {searching ? 'Searching...' : 'Search'}
              </Text>
            </TouchableOpacity>
            {searchResults.length > 0 && (
              <TouchableOpacity
                style={{
                  backgroundColor: colors.error || '#EF4444',
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 80,
                }}
                onPress={() => {
                  setSearchResults([]);
                  setSearchQuery('');
                  Keyboard.dismiss();
                  playSound('backspace').catch(() => {});
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                  Clear
                </Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* Share App Link Section */}
          <View style={styles.shareSection}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={shareAppLink}
            >
              <Text style={styles.shareButtonText}>
                Share App with Friends
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </TouchableWithoutFeedback>
      )}

      {/* Content */}
      <View style={{ flex: 1, width: '100%', paddingHorizontal: 16, paddingTop: 0, alignItems: 'stretch', justifyContent: 'flex-start' }}>
        {activeTab === 'friends' && (
          <View style={{ flex: 1, width: '100%' }}>
            {loadingFriends ? (
              <Text style={styles.loadingText}>
                Loading friends...
              </Text>
            ) : friends.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No friends yet. Add some friends to get started!
                </Text>
              </View>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(item) => item.id}
                renderItem={renderFriend}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={true}
                scrollEnabled={true}
                nestedScrollEnabled={true}
              />
            )}
          </View>
        )}

        {activeTab === 'requests' && (
          <View style={styles.tabContent}>
            {loadingRequests ? (
              <Text style={styles.loadingText}>
                Loading requests...
              </Text>
            ) : (
              <FlatList
                style={{ width: '100%' }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                data={[
                  ...(pendingRequests.length > 0 ? [{ type: 'header', id: 'header_incoming' }] : []),
                  ...pendingRequests.map(r => ({ ...r, type: 'incoming' })),
                  ...(sentRequests.length > 0 ? [{ type: 'header', id: 'header_sent' }] : []),
                  ...sentRequests.map(r => ({ ...r, type: 'sent' })),
                ]}
                keyExtractor={(item, index) => `${item.type}_${item.id || index}`}
                renderItem={({ item }) => {
                  if (item.type === 'header' && item.id === 'header_incoming') {
                    return (
                      <Text style={[styles.sectionTitle, { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 16 }]}>Incoming Requests ({pendingRequests.length})</Text>
                    );
                  }
                  if (item.type === 'header' && item.id === 'header_sent') {
                    return (
                      <View style={{ marginTop: 24, marginBottom: 16, alignItems: 'center' }}>
                        <Text style={[styles.sectionTitle, { color: '#FFFFFF', fontSize: 20, fontWeight: '700' }]}>Sent Requests</Text>
                      </View>
                    );
                  }
                  if (item.type === 'incoming') {
                    return (
                      <View style={{
                        padding: 20,
                        marginBottom: 16,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: '#10B981',
                        backgroundColor: '#1F2937',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.25,
                        shadowRadius: 4,
                        elevation: 5,
                      }}>
                        <View style={{ marginBottom: 16 }}>
                          <Text style={{
                            fontSize: 20,
                            fontWeight: '700',
                            marginBottom: 8,
                            color: '#FFFFFF',
                          }}>
                            {item.fromUsername || 'Unknown User'}
                          </Text>
                          <Text style={{
                            fontSize: 16,
                            color: '#D1D5DB',
                            lineHeight: 22,
                          }}>
                            wants to be your friend
                          </Text>
                        </View>
                        <View style={{ 
                          flexDirection: 'row', 
                          gap: 12,
                          justifyContent: 'flex-end'
                        }}>
                          <TouchableOpacity
                            style={{
                              backgroundColor: '#10B981',
                              paddingHorizontal: 20,
                              paddingVertical: 12,
                              borderRadius: 8,
                              minWidth: 90,
                              alignItems: 'center',
                            }}
                            onPress={() => acceptFriendRequest(item)}
                          >
                            <Text style={{
                              color: '#FFFFFF',
                              fontSize: 16,
                              fontWeight: '700',
                            }}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{
                              backgroundColor: '#EF4444',
                              paddingHorizontal: 20,
                              paddingVertical: 12,
                              borderRadius: 8,
                              minWidth: 90,
                              alignItems: 'center',
                            }}
                            onPress={() => declineFriendRequest(item)}
                          >
                            <Text style={{
                              color: '#FFFFFF',
                              fontSize: 16,
                              fontWeight: '700',
                            }}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }
                  // sent
                  return (
                    <View style={{
                      padding: 20,
                      marginBottom: 16,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: '#F59E0B',
                      backgroundColor: '#1F2937',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.25,
                      shadowRadius: 4,
                      elevation: 5,
                    }}>
                      <View style={{ marginBottom: 16 }}>
                        <Text style={{
                          fontSize: 20,
                          fontWeight: '700',
                          marginBottom: 8,
                          color: '#FFFFFF',
                        }}>
                          {item.toUsername || 'Unknown User'}
                        </Text>
                        <Text style={{
                          fontSize: 16,
                          color: '#D1D5DB',
                          lineHeight: 22,
                        }}>
                          Friend request sent
                        </Text>
                      </View>
                      <View style={{ 
                        flexDirection: 'row', 
                        gap: 12,
                        justifyContent: 'center'
                      }}>
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#EF4444',
                            paddingHorizontal: 20,
                            paddingVertical: 12,
                            borderRadius: 8,
                            minWidth: 90,
                            alignItems: 'center',
                          }}
                          onPress={() => cancelFriendRequest(item)}
                        >
                          <Text style={{
                            color: '#FFFFFF',
                            fontSize: 16,
                            fontWeight: '700',
                          }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={(
                  <View style={[styles.emptyState, { paddingHorizontal: 16 }]}>
                    <Text style={styles.emptyStateText}>No current friend requests</Text>
                  </View>
                )}
                showsVerticalScrollIndicator={true}
              />
            )}
          </View>
        )}

        {activeTab === 'add' && (
          <View style={styles.tabContent}>
            
            {searching && (
              <Text style={styles.loadingText}>
                Searching...
              </Text>
            )}
            
            {searchResults.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <Text style={[styles.resultsTitle, { color: '#FFFFFF', marginBottom: 16 }]}>
                  Search Results
                </Text>
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => item.id}
                  renderItem={renderSearchResult}
                  style={styles.list}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}
            
            {searchQuery && !searching && searchResults.length === 0 && (
              <View style={[styles.emptyState, { marginTop: 40 }]}>
                <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                  No users found with username "{searchQuery}"
                </Text>
                <Text style={[styles.emptyStateText, { color: colors.textSecondary, fontSize: 14, marginTop: 8 }]}>
                  Try a different username or check the spelling
                </Text>
              </View>
            )}
          </View>
        )}
        </View>
      </View>
      </SafeAreaView>
    </View>
  );
};

export default FriendsManagementScreen;

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, TextInput, Modal, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove, getDocs, addDoc, getDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';
import logger from './logger';
import { useTheme } from './ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import friendsService from './friendsService';

const FriendsManagementScreen = ({ onClearNotifications }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  
  // State for different tabs
  const [activeTab, setActiveTab] = useState('friends'); // 'friends', 'requests', 'add'
  
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
      
      // Get friends from user's friends array
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const friendIds = userData.friends || [];
        
        if (friendIds.length > 0) {
          // Get friend profiles
          const friendPromises = friendIds.map(friendId => 
            getDoc(doc(db, 'users', friendId))
          );
          const friendDocs = await Promise.all(friendPromises);
          
          const friendsList = friendDocs
            .filter(doc => doc.exists())
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
          
          setFriends(friendsList);
        } else {
          setFriends([]);
        }
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
      
      // Load incoming requests with real-time listener
      const incomingQuery = query(
        collection(db, 'friendRequests'),
        where('toUid', '==', auth.currentUser.uid),
        where('status', '==', 'pending')
      );
      
      // Load outgoing requests with real-time listener
      const outgoingQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', auth.currentUser.uid),
        where('status', '==', 'pending')
      );
      
      // Set up real-time listeners
      const unsubscribeIncoming = onSnapshot(incomingQuery, async (snapshot) => {
        // Check if user is still authenticated before processing
        if (!auth.currentUser) return;
        
        const incoming = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Fetch usernames for incoming requests
        const requestsWithUsernames = await Promise.all(
          incoming.map(async (request) => {
            try {
              const userDoc = await getDoc(doc(db, 'users', request.fromUid));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                return {
                  ...request,
                  fromUsername: userData.username || userData.displayName || 'Unknown User'
                };
              }
              return { ...request, fromUsername: 'Unknown User' };
            } catch (error) {
              logger.error('Failed to fetch username for request:', error);
              return { ...request, fromUsername: 'Unknown User' };
            }
          })
        );
        
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
      
      const unsubscribeOutgoing = onSnapshot(outgoingQuery, async (snapshot) => {
        // Check if user is still authenticated before processing
        if (!auth.currentUser) return;
        
        const outgoing = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Fetch usernames for outgoing requests
        const requestsWithUsernames = await Promise.all(
          outgoing.map(async (request) => {
            try {
              const userDoc = await getDoc(doc(db, 'users', request.toUid));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                return {
                  ...request,
                  toUsername: userData.username || userData.displayName || 'Unknown User'
                };
              }
              return { ...request, toUsername: 'Unknown User' };
            } catch (error) {
              logger.error('Failed to fetch username for outgoing request:', error);
              return { ...request, toUsername: 'Unknown User' };
            }
          })
        );
        
        setSentRequests(requestsWithUsernames);
        setLoadingRequests(false);
      }, (error) => {
        // Only log error if user is still authenticated
        if (auth.currentUser) {
          logger.error('Failed to load outgoing friend requests:', error);
        }
        setLoadingRequests(false);
      });
      
      // Store unsubscribe functions for cleanup
      return () => {
        unsubscribeIncoming();
        unsubscribeOutgoing();
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
      
      // Clear search
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('❌ [FriendsManagementScreen] Failed to send friend request:', error);
      logger.error('Failed to send friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    }
  };

  const acceptFriendRequest = async (request) => {
    try {
      console.log('🔍 [FriendsManagementScreen] Accepting friend request from:', request.fromUid || request.from);
      
      // Update both users' friends lists
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        friends: arrayUnion(request.fromUid || request.from)
      });
      console.log('🔍 [FriendsManagementScreen] Updated current user friends list');
      
      await updateDoc(doc(db, 'users', request.fromUid || request.from), {
        friends: arrayUnion(auth.currentUser.uid)
      });
      console.log('🔍 [FriendsManagementScreen] Updated other user friends list');

      // Clear any redundant friend requests between these two users
      console.log('🔍 [FriendsManagementScreen] Clearing redundant friend requests...');
      const redundantRequestsQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', auth.currentUser.uid),
        where('toUid', '==', request.fromUid || request.from),
        where('status', '==', 'pending')
      );
      
      const redundantSnapshot = await getDocs(redundantRequestsQuery);
      console.log('🔍 [FriendsManagementScreen] Found', redundantSnapshot.docs.length, 'redundant requests to clear');
      
      // Delete all redundant requests
      const deletePromises = redundantSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      console.log('🔍 [FriendsManagementScreen] Cleared', redundantSnapshot.docs.length, 'redundant requests');

      // Delete the friend request since it's now accepted
      await deleteDoc(doc(db, 'friendRequests', request.id));
      console.log('🔍 [FriendsManagementScreen] Deleted accepted request');

      Alert.alert('Success', `You are now friends with ${request.fromUsername}!`);
      playSound('chime');
      
      // Clear notifications when request is handled
      if (onClearNotifications) {
        onClearNotifications();
      }
      
      // Reload requests
      loadFriendRequests();
    } catch (error) {
      console.error('❌ [FriendsManagementScreen] Failed to accept friend request:', error);
      logger.error('Failed to accept friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    }
  };

  const declineFriendRequest = async (request) => {
    try {
      await deleteDoc(doc(db, 'friendRequests', request.id));
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
      await deleteDoc(doc(db, 'friendRequests', request.id));
      Alert.alert('Cancelled', 'Friend request cancelled.');
      playSound('chime');
      
      // Reload requests
      loadFriendRequests();
    } catch (error) {
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
              // Remove from both users' friends lists
              await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                friends: arrayRemove(friend.id)
              });
              
              await updateDoc(doc(db, 'users', friend.id), {
                friends: arrayRemove(auth.currentUser.uid)
              });

              Alert.alert('Removed', `${friend.username || friend.displayName} has been removed from your friends list.`);
              playSound('chime');
              
              // Reload friends
              loadFriends();
            } catch (error) {
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
    <SafeAreaView edges={['left', 'right', 'top']} style={[styles.screenContainer, { backgroundColor: colors.background }]}> 

      {/* Tab Navigation */}
      <View style={[styles.tabContainer, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
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
      </View>

      {/* Search Bar - Only visible when Add Friends tab is active */}
      {activeTab === 'add' && (
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
                width: 120,
              }}
              onPress={searchUsers}
              disabled={searching}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
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
                  playSound('backspace').catch(() => {});
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                  Clear
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Content */}
      <View style={{ flex: 1, width: '100%', paddingHorizontal: 16, paddingTop: 0, alignItems: 'stretch', justifyContent: 'flex-start' }}>
        {activeTab === 'friends' && (
          <View style={styles.tabContent}>
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
                style={styles.list}
                contentContainerStyle={{ paddingBottom: 100 }}
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
                    <Text style={styles.emptyStateText}>No friend requests</Text>
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
    </SafeAreaView>
  );
};

export default FriendsManagementScreen;

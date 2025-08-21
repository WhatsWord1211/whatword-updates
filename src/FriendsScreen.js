import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query, where, onSnapshot, arrayUnion, arrayRemove, orderBy, limit } from 'firebase/firestore';
import styles from './styles';
import { playSound } from './soundsUtil';

const FriendsScreen = () => {
  console.log('🔧 FriendsScreen: Component is rendering');
  const navigation = useNavigation();
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [showFriendOptionsModal, setShowFriendOptionsModal] = useState(false);

  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const friendsUnsubscribeRef = useRef(null);
  const requestsUnsubscribeRef = useRef(null);
  const challengesUnsubscribeRef = useRef(null);

  useEffect(() => {
    console.log('🔧 FriendsScreen: useEffect running, setting up auth listener');
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      console.log('🔧 FriendsScreen: Auth state changed:', currentUser ? currentUser.uid : 'null');
      if (currentUser) {
        setUser(currentUser);
        loadUserProfile(currentUser);
      }
    });

    return unsubscribe;
  }, []);

  const loadUserProfile = async (currentUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data());
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      // Set up friends listener - listen to current user's document directly
      const meRef = doc(db, 'users', user.uid);
      
      const unsubscribeFriends = onSnapshot(meRef, async (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          const friendIds = userData?.friends || [];
          
          if (friendIds.length > 0) {
            // Fetch friend profiles
            const friendDocs = await Promise.all(
              friendIds.map(friendId => getDoc(doc(db, 'users', friendId)))
            );
            const friendsList = friendDocs
              .filter(doc => doc.exists())
              .map(doc => ({ uid: doc.id, ...doc.data() }));
            setFriends(friendsList);
          } else {
            setFriends([]);
          }
        } else {
          setFriends([]);
        }
      });

      // Set up pending requests listener
      const requestsQuery = query(
        collection(db, 'friendRequests'),
        where('to', '==', user.uid),
        where('status', '==', 'pending')
      );
      
      const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
        console.log('🔍 Friend requests listener triggered, found', snapshot.docs.length, 'requests');
        const requests = snapshot.docs.map(doc => ({ id: doc.id, uid: doc.id, ...doc.data() }));
        console.log('🔍 Mapped requests:', requests);
        setPendingRequests(requests);
      });

      // Set up pending challenges listener
      const challengesQuery = query(
        collection(db, 'challenges'),
        where('to', '==', user.uid),
        where('status', '==', 'pending')
      );
      
      const unsubscribeChallenges = onSnapshot(challengesQuery, (snapshot) => {
        console.log('🔍 Challenges listener triggered, found', snapshot.docs.length, 'challenges');
        const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('🔍 Mapped challenges:', challenges);
        setPendingChallenges(challenges);
      });

      friendsUnsubscribeRef.current = unsubscribeFriends;
      requestsUnsubscribeRef.current = unsubscribeRequests;
      challengesUnsubscribeRef.current = unsubscribeChallenges;

      return () => {
        if (friendsUnsubscribeRef.current) {
          friendsUnsubscribeRef.current();
        }
        if (requestsUnsubscribeRef.current) {
          requestsUnsubscribeRef.current();
        }
        if (challengesUnsubscribeRef.current) {
          challengesUnsubscribeRef.current();
        }
      };
    }
  }, [user]);

  const searchUsers = async () => {
    const trimmedQuery = searchQuery.trim();
    console.log('🔍 Search function called with query:', trimmedQuery);
    console.log('🔍 Original query length:', searchQuery.length, 'Trimmed query length:', trimmedQuery.length);
    console.log('🔍 Current user state:', user);
    console.log('🔍 Current friends state:', friends);
    console.log('🔍 Current pending requests state:', pendingRequests);
    
    if (!trimmedQuery) {
      console.log('🔍 Empty search query, clearing results');
      setSearchResults([]);
      return;
    }

    try {
      console.log('🔍 Starting search for:', trimmedQuery);
      
      // First, let's see what's actually in the users collection
      console.log('🔍 Checking all users in collection...');
      const allUsersSnapshot = await getDocs(collection(db, 'users'));
      console.log('🔍 Total users in collection:', allUsersSnapshot.docs.length);
      
      if (allUsersSnapshot.docs.length > 0) {
        console.log('🔍 Sample user data:');
        allUsersSnapshot.docs.slice(0, 3).forEach((doc, index) => {
          console.log(`🔍 User ${index + 1}:`, { id: doc.id, ...doc.data() });
        });
      }
      
      // Search by username or display name
      const usersQuery = query(
        collection(db, 'users'),
        where('username', '>=', trimmedQuery),
        where('username', '<=', trimmedQuery + '\uf8ff'),
        limit(10)
      );

      console.log('🔍 Query created, executing...');
      console.log('🔍 Query details:', {
        field: 'username',
        startValue: trimmedQuery,
        endValue: trimmedQuery + '\uf8ff'
      });
      
      const snapshot = await getDocs(usersQuery);
      console.log('🔍 Query executed, found', snapshot.docs.length, 'documents');
      
      let results = snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() }))
        .filter(searchUser => searchUser.uid !== user?.uid) // Exclude current user
        .filter(searchUser => !friends.some(friend => friend.uid === searchUser.uid)) // Exclude existing friends
        .filter(searchUser => !pendingRequests.some(req => req.from === searchUser.uid)); // Exclude pending requests

      console.log('🔍 Filtered results:', results.length, 'users');
      
      // If no results from the range query, try a simple contains search
      if (results.length === 0) {
        console.log('🔍 No results from range query, trying simple search...');
        const simpleResults = allUsersSnapshot.docs
          .map(doc => ({ uid: doc.id, ...doc.data() }))
          .filter(searchUser => {
            const username = searchUser.username || '';
            const displayName = searchUser.displayName || '';
            const email = searchUser.email || '';
            
            return (username.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
                    displayName.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
                    email.toLowerCase().includes(trimmedQuery.toLowerCase()));
          })
          .filter(searchUser => searchUser.uid !== user?.uid) // Exclude current user
          .filter(searchUser => !friends.some(friend => friend.uid === searchUser.uid)) // Exclude existing friends
          .filter(searchUser => !pendingRequests.some(req => req.from === searchUser.uid)) // Exclude pending requests
          .slice(0, 10); // Limit to 10 results
        
        console.log('🔍 Simple search results:', simpleResults.length, 'users');
        results = simpleResults;
      }
      
      console.log('🔍 Final results:', results);
      
      setSearchResults(results);
    } catch (error) {
      console.error('🔍 Search failed:', error);
      Alert.alert('Error', 'Search failed. Please try again.');
    }
  };

  const sendFriendRequest = async (toUser) => {
    try {
      const requestData = {
        from: user.uid,
        to: toUser.uid,
        fromUsername: userProfile?.username || user.email?.split('@')[0] || 'Unknown',
        toUsername: toUser.username || toUser.displayName || 'Unknown',
        status: 'pending',
        timestamp: new Date(),
      };

      console.log('🔍 Attempting to create friend request with data:', requestData);
      console.log('🔍 Current user UID:', user.uid);
      console.log('🔍 Request data "from" field:', requestData.from);
      console.log('🔍 Are they equal?', user.uid === requestData.from);

      await addDoc(collection(db, 'friendRequests'), requestData);
      
      Alert.alert('Success', `Friend request sent to ${toUser.username || toUser.displayName}!`);
      setSearchQuery('');
      setSearchResults([]);
      playSound('chime');
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
      await updateDoc(doc(db, 'users', user.uid), {
        friends: arrayUnion(request.from)
      });

      // Also update the other user's friends list for mutual friendship
      // This will work with the updated Firestore rules
      await updateDoc(doc(db, 'users', request.from), {
        friends: arrayUnion(user.uid)
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
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'declined',
        declinedAt: new Date()
      });

      Alert.alert('Request Declined', 'Friend request has been declined.');
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request. Please try again.');
    }
  };

  const removeFriend = async (friend) => {
    try {
      // Only remove from current user's friends list
      // The other user will need to remove this user from their own list
      await updateDoc(doc(db, 'users', user.uid), {
        friends: arrayRemove(friend.uid)
      });

      Alert.alert('Friend Removed', `${friend.username || friend.displayName} has been removed from your friends list.`);
      playSound('chime');
    } catch (error) {
      console.error('Failed to remove friend:', error);
      Alert.alert('Error', 'Failed to remove friend. Please try again.');
    }
  };

  const acceptChallenge = async (challenge) => {
    try {
      // Navigate to SetWordScreen to set the mystery word
      navigation.navigate('SetWord', {
        challenge: challenge,
        isAccepting: true
      });
    } catch (error) {
      console.error('Failed to accept challenge:', error);
      Alert.alert('Error', 'Failed to accept challenge. Please try again.');
    }
  };

  const declineChallenge = async (challenge) => {
    try {
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'declined',
        declinedAt: new Date()
      });

      Alert.alert('Challenge Declined', 'Challenge has been declined.');
    } catch (error) {
      console.error('Failed to decline challenge:', error);
      Alert.alert('Error', 'Failed to decline challenge. Please try again.');
    }
  };



  const challengeFriend = async (friend) => {
    console.log('🔍 Challenge button pressed for friend:', friend);
    
    // Navigate to SetWordScreen to set the mystery word
    navigation.navigate('SetWord', {
      challenge: {
        from: user.uid,
        to: friend.uid,
        fromUsername: userProfile?.username || user.email?.split('@')[0] || 'Unknown',
        toUsername: friend.username || friend.displayName || 'Unknown'
      },
      isAccepting: false
    });
  };

  const renderFriend = ({ item }) => (
    <View style={styles.friendItem}>
      <View style={styles.friendInfo}>
        <Text style={styles.friendUsername}>
          {item.username || item.displayName || 'Unknown User'}
        </Text>
        <Text style={styles.friendEmail}>
          {item.email}
        </Text>
      </View>
      <View style={styles.friendActions}>
        <TouchableOpacity
          style={[styles.button, styles.challengeButton]}
          onPress={() => challengeFriend(item)}
        >
          <Text style={styles.buttonText}>Challenge</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.removeButton]}
          onPress={() => {
            setSelectedFriend(item);
            setShowFriendOptionsModal(true);
          }}
        >
          <Text style={styles.buttonText}>Remove</Text>
        </TouchableOpacity>
      </View>
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

  const renderChallenge = ({ item }) => (
    <View style={styles.challengeItem}>
      <View style={styles.challengeInfo}>
        <Text style={styles.challengeUsername}>
          {item.fromUsername || 'Unknown User'}
        </Text>
        <Text style={styles.challengeEmail}>challenged you to a PvP game!</Text>
      </View>
      <View style={styles.challengeActions}>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => acceptChallenge(item)}
        >
          <Text style={styles.buttonText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={() => declineChallenge(item)}
        >
          <Text style={styles.buttonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  console.log('🔧 FriendsScreen: About to render main UI');
  return (
    <View style={styles.screenContainer}>
      <Text style={styles.header}>Friends & Challenges</Text>
      
      {/* Main Navigation Cards */}
      <View style={styles.navigationContainer}>
        {/* Friends Management */}
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate('AddFriends')}
        >
          <Text style={styles.navCardTitle}>Friends Management</Text>
          <Text style={styles.navCardSubtitle}>
            {pendingRequests.length > 0 
              ? `Search players & ${pendingRequests.length} pending requests` 
              : 'Search and add new players'
            }
          </Text>
        </TouchableOpacity>

        {/* Games Section */}
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate('PendingChallenges')}
        >
          <Text style={styles.navCardTitle}>Games</Text>
          <Text style={styles.navCardSubtitle}>
            {pendingChallenges.length > 0 ? `${pendingChallenges.length} pending challenges` : 'Accept and create challenges'}
          </Text>
        </TouchableOpacity>

        {/* Create Challenge Button */}
        <TouchableOpacity
          style={[styles.navCard, styles.createChallengeCard]}
          onPress={() => navigation.navigate('FriendsList')}
        >
          <Text style={styles.navCardTitle}>Create Challenge</Text>
          <Text style={styles.navCardSubtitle}>
            Challenge a friend to a PvP game
          </Text>
        </TouchableOpacity>
      </View>

      {/* Friend Options Modal */}
      <Modal visible={showFriendOptionsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow]}>
            <Text style={styles.header}>Remove Friend</Text>
            <Text style={styles.modalText}>
              Are you sure you want to remove {selectedFriend?.username || selectedFriend?.displayName} from your friends list?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.removeButton]}
                onPress={() => {
                  if (selectedFriend) {
                    removeFriend(selectedFriend);
                  }
                  setShowFriendOptionsModal(false);
                  setSelectedFriend(null);
                }}
              >
                <Text style={styles.buttonText}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={() => {
                  setShowFriendOptionsModal(false);
                  setSelectedFriend(null);
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default FriendsScreen;
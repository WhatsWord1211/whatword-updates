import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, addDoc, updateDoc, collection, query, where, onSnapshot, arrayUnion, arrayRemove, orderBy, limit, runTransaction } from 'firebase/firestore';
import styles from './styles';
import { playSound } from './soundsUtil';
import { showChallengeNotification, showFriendRequestNotification } from './notificationUtil';
import gameService from './gameService';

const FriendsScreen = () => {

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
  const [activePvPGame, setActivePvPGame] = useState(null);
  const [hasShownGameStartPopup, setHasShownGameStartPopup] = useState(false);
  const [notifications, setNotifications] = useState([]);
  
  // Single listener reference for cleanup
  const userListenerRef = useRef(null);

  // Mark notification as read
  const markNotificationAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true
      });
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const removeStuckGame = async () => {
    try {
      if (activePvPGame) {
        // Delete the stuck game
        await deleteDoc(doc(db, 'games', activePvPGame.id));
        setActivePvPGame(null);
        setHasShownGameStartPopup(false);
        Alert.alert('Success', 'Stuck game removed successfully');
      }
    } catch (error) {
      console.error('Failed to remove stuck game:', error);
      Alert.alert('Error', 'Failed to remove stuck game. Please try again.');
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
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
    if (!user) return;

    // Single, coordinated listener for all user-related data
    const userRef = doc(db, 'users', user.uid);
    
    const unsubscribe = onSnapshot(userRef, async (snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.data();
        
        // Handle friends list updates
        const friendIds = userData.friends || [];
        if (friendIds.length > 0) {
          try {
            const friendDocs = await Promise.all(
              friendIds.map(friendId => getDoc(doc(db, 'users', friendId)))
            );
            const friendsList = friendDocs
              .filter(doc => doc.exists())
              .map(doc => ({ uid: doc.id, ...doc.data() }));
            setFriends(friendsList);
          } catch (error) {
            console.error('Failed to load friends:', error);
            setFriends([]);
          }
        } else {
          setFriends([]);
        }

        // Handle pending requests from user document
        const pendingRequests = userData.pendingRequests || [];
        setPendingRequests(pendingRequests);

        // Handle active games from user document
        const activeGames = userData.activeGames || [];
        if (activeGames.length > 0) {
          // Get the most recent active game
          const gameId = activeGames[activeGames.length - 1];
          try {
            const gameDoc = await getDoc(doc(db, 'games', gameId));
            if (gameDoc.exists()) {
              const gameData = gameDoc.data();
              // Validate game is actually active and valid
              if (gameData.status === 'active' || gameData.status === 'ready') {
                setActivePvPGame({ id: gameId, ...gameData });
              } else {
                setActivePvPGame(null);
              }
            }
          } catch (error) {
            console.error('Failed to load active game:', error);
            setActivePvPGame(null);
          }
        } else {
          setActivePvPGame(null);
        }
      } else {
        setFriends([]);
        setPendingRequests([]);
        setActivePvPGame(null);
      }
    });

    userListenerRef.current = unsubscribe;

    return () => {
      if (userListenerRef.current) {
        userListenerRef.current();
      }
    };
  }, [user]);

  // Function to fix stuck games by marking them as completed
  const fixStuckGames = async () => {
    try {
      console.log('🔧 Fixing stuck games...');
      const gamesQuery = query(
        collection(db, 'games'),
        where('players', 'array-contains', user.uid),
        where('status', 'in', ['ready', 'active'])
      );
      
      const snapshot = await getDocs(gamesQuery);
      console.log('🔧 Found', snapshot.docs.length, 'stuck active games');
      
      for (const doc of snapshot.docs) {
        const gameData = doc.data();
        
        // Check if this game should be completed
        if (gameData.type === 'pvp' || gameData.gameMode === 'pvp') {
          let shouldComplete = false;
          let updates = {
            status: 'completed',
            completedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          };
          
          // Check current data structure (gameHistory + player1/player2)
          if (gameData.gameHistory && gameData.player1 && gameData.player2) {
            const player1Solved = gameData.player1.solved || false;
            const player2Solved = gameData.player2.solved || false;
            
            // If both players have solved their words, game should be completed
            if (player1Solved && player2Solved) {
              shouldComplete = true;
              console.log('🔧 Both players solved - completing game:', doc.id);
              
              // Determine winner by attempts
              const player1Attempts = gameData.player1.attempts || 0;
              const player2Attempts = gameData.player2.attempts || 0;
              
              if (player1Attempts < player2Attempts) {
                updates.winnerId = gameData.player1.uid;
              } else if (player2Attempts < player1Attempts) {
                updates.winnerId = gameData.player2.uid;
              } else {
                updates.tie = true;
                updates.winnerId = null;
              }
            }
          }
          
          // Fallback: Check old data structure
          if (!shouldComplete) {
            const playerGuesses = gameData.playerGuesses || [];
            const opponentGuesses = gameData.opponentGuesses || [];
            const playerSolved = gameData.playerSolved || false;
            const opponentSolved = gameData.opponentSolved || false;
            
            if ((playerGuesses.length > 0 || opponentGuesses.length > 0) || playerSolved || opponentSolved) {
              shouldComplete = true;
              console.log('🔧 Using fallback logic for game:', doc.id);
              
              // Determine winner if possible
              if (playerSolved && !opponentSolved) {
                updates.winnerId = gameData.creatorId;
              } else if (opponentSolved && !playerSolved) {
                updates.winnerId = gameData.players.find(id => id !== gameData.creatorId);
              } else if (playerSolved && opponentSolved) {
                // Both solved - determine winner by attempts
                if (playerGuesses.length < opponentGuesses.length) {
                  updates.winnerId = gameData.creatorId;
                } else if (opponentGuesses.length < playerGuesses.length) {
                  updates.winnerId = gameData.players.find(id => id !== gameData.creatorId);
                } else {
                  updates.tie = true;
                  updates.winnerId = null;
                }
              } else if (playerGuesses.length >= 25 && opponentGuesses.length >= 25) {
                // Both reached max attempts without solving
                updates.tie = true;
                updates.winnerId = null;
              }
            }
          }
          
          if (shouldComplete) {
            console.log('🔧 Fixing stuck game:', doc.id, 'with updates:', updates);
            await updateDoc(doc(db, 'games', doc.id), updates);
            
            // Now delete the completed game and preserve statistics
            await deleteCompletedGameAndPreserveStats(doc.id, { ...gameData, ...updates });
            
            console.log('🔧 Fixed and deleted game:', doc.id);
          }
        }
      }
      
      console.log('🔧 Finished fixing stuck games');
      Alert.alert('Success', 'Stuck games have been fixed!');
      
      // The screen will automatically refresh through the existing onSnapshot listeners
      // No need to manually call a function
    } catch (error) {
      console.error('🔧 Error fixing stuck games:', error);
      Alert.alert('Error', 'Failed to fix stuck games: ' + error.message);
    }
  };

  const searchUsers = async () => {
    const trimmedQuery = searchQuery.trim();
    
    if (!trimmedQuery) {
      setSearchResults([]);
      return;
    }

    try {
      // First, let's see what's actually in the users collection
      const allUsersSnapshot = await getDocs(collection(db, 'users'));
      
      // Search by username or display name
      const usersQuery = query(
        collection(db, 'users'),
        where('username', '>=', trimmedQuery),
        where('username', '<=', trimmedQuery + '\uf8ff'),
        limit(10)
      );
      
      const snapshot = await getDocs(usersQuery);
      
      let results = snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() }))
        .filter(searchUser => searchUser.uid !== user?.uid) // Exclude current user
        .filter(searchUser => !friends.some(friend => friend.uid === searchUser.uid)) // Exclude existing friends
        .filter(searchUser => !pendingRequests.some(req => req.from === searchUser.uid)); // Exclude pending requests
      
      // If no results from the range query, try a simple contains search
      if (results.length === 0) {
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
        
        results = simpleResults;
      }
      
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
      // Use transaction to ensure both users are updated atomically
      await runTransaction(db, async (transaction) => {
        // Update request status
        const requestRef = doc(db, 'friendRequests', request.id);
        transaction.update(requestRef, {
          status: 'accepted',
          acceptedAt: new Date()
        });

        // Update both users' friends arrays atomically
        const userRef = doc(db, 'users', user.uid);
        const friendRef = doc(db, 'users', request.from);
        
        transaction.update(userRef, {
          friends: arrayUnion(request.from)
        });
        
        transaction.update(friendRef, {
          friends: arrayUnion(user.uid)
        });
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
      // Use transaction to ensure both users are updated atomically
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const friendRef = doc(db, 'users', friend.uid);
        
        transaction.update(userRef, {
          friends: arrayRemove(friend.uid)
        });
        
        transaction.update(friendRef, {
          friends: arrayRemove(user.uid)
        });
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

  return (
    <View style={styles.screenContainer}>
      {/* FAB */}
      <TouchableOpacity 
        style={styles.fabTop} 
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.fabText}>🏠</Text>
      </TouchableOpacity>
      
      <Text style={styles.header}>Friends & Challenges</Text>
      
              {/* Notifications Display */}
        {notifications.length > 0 && (
          <View style={styles.notificationsContainer}>
            {notifications.map((notification) => (
              <View key={notification.id} style={styles.notificationItem}>
                <Text style={styles.notificationText}>{notification.message}</Text>
                <TouchableOpacity
                  style={styles.dismissNotificationButton}
                  onPress={() => {
                    // Mark as read and remove from display
                    markNotificationAsRead(notification.id);
                    setNotifications(prev => prev.filter(n => n.id !== notification.id));
                  }}
                >
                  <Text style={styles.dismissNotificationButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Stuck Game Cleanup */}
        {activePvPGame && (
          <View style={styles.stuckGameContainer}>
            <Text style={styles.stuckGameText}>
              Active PvP Game Detected
            </Text>
            <Text style={styles.stuckGameSubtext}>
              {activePvPGame.player1?.word && activePvPGame.player2?.word 
                ? 'Game is ready to play' 
                : 'Waiting for both players to set words'}
            </Text>
            <TouchableOpacity
              style={styles.removeStuckGameButton}
              onPress={removeStuckGame}
            >
              <Text style={styles.removeStuckGameButtonText}>Remove Stuck Game</Text>
            </TouchableOpacity>
          </View>
        )}
      
      {/* Active PvP Game Notification */}
      {activePvPGame && (
        <View style={styles.activeGameIndicator}>
          <Text style={styles.activeGameText}>
            🎮 Active PvP Game in Progress!
          </Text>
          <TouchableOpacity
            style={styles.viewChallengesButton}
            onPress={() => {
              playSound('chime');
              navigation.navigate('PvPGame', { gameId: activePvPGame.id });
            }}
          >
            <Text style={styles.viewChallengesButtonText}>Continue Game</Text>
          </TouchableOpacity>

        </View>
      )}
      
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

        {/* Pending Challenges */}
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate('PendingChallenges')}
        >
          <Text style={styles.navCardTitle}>Pending Challenges</Text>
          <Text style={styles.navCardSubtitle}>
            {pendingChallenges.length > 0 ? `${pendingChallenges.length} challenges to respond to` : 'No pending challenges'}
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
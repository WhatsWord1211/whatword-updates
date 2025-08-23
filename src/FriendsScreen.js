import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query, where, onSnapshot, arrayUnion, arrayRemove, orderBy, limit } from 'firebase/firestore';
import styles from './styles';
import { playSound } from './soundsUtil';
import { showChallengeNotification, showFriendRequestNotification } from './notificationUtil';

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
  const friendsUnsubscribeRef = useRef(null);
  const requestsUnsubscribeRef = useRef(null);
  const challengesUnsubscribeRef = useRef(null);
  const activeGamesUnsubscribeRef = useRef(null);

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
        const requests = snapshot.docs.map(doc => ({ id: doc.id, uid: doc.id, ...doc.data() }));
        
        // Check for new friend requests (show notifications)
        const previousRequestIds = pendingRequests.map(r => r.id);
        const newRequests = requests.filter(r => !previousRequestIds.includes(r.id));
        
        // Show notifications for new friend requests
        newRequests.forEach(request => {
          showFriendRequestNotification(request.fromUsername || request.from);
        });
        
        setPendingRequests(requests);
      });

      // Set up pending challenges listener
      const challengesQuery = query(
        collection(db, 'challenges'),
        where('to', '==', user.uid),
        where('status', '==', 'pending')
      );
      
      const unsubscribeChallenges = onSnapshot(challengesQuery, (snapshot) => {
        const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Check for new challenges (show notifications)
        const previousChallengeIds = pendingChallenges.map(c => c.id);
        const newChallenges = challenges.filter(c => !previousChallengeIds.includes(c.id));
        
        // Show notifications for new challenges
        newChallenges.forEach(challenge => {
          showChallengeNotification(challenge.fromUsername, challenge.difficulty);
        });
        
        setPendingChallenges(challenges);
      });

      // Set up sent challenges listener (for Player 1 to see when their challenge is accepted)
      const sentChallengesQuery = query(
        collection(db, 'challenges'),
        where('from', '==', user.uid),
        where('status', 'in', ['pending', 'accepted'])
      );
      
      const unsubscribeSentChallenges = onSnapshot(sentChallengesQuery, (snapshot) => {
        const sentChallenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Check if any sent challenges were just accepted
        sentChallenges.forEach(challenge => {
          if (challenge.status === 'accepted' && challenge.gameId) {
            // Check if this is a recent challenge acceptance (within last 5 minutes)
            const challengeAcceptedAt = challenge.acceptedAt || challenge.timestamp;
            const isRecentAcceptance = challengeAcceptedAt && 
              (new Date().getTime() - new Date(challengeAcceptedAt.toDate?.() || challengeAcceptedAt).getTime()) < 300000; // 5 minutes
            
            if (isRecentAcceptance) {
              // Challenge was recently accepted and game created - show notification
              Alert.alert(
                '🎮 Challenge Accepted!',
                `${challenge.toUsername} has accepted your challenge! A PvP game has been created.`,
                [
                  {
                    text: 'Play Now',
                    onPress: () => {
                      playSound('chime').catch(() => {});
                      navigation.navigate('PvPGame', { gameId: challenge.gameId });
                    }
                  },
                  {
                    text: 'Later',
                    style: 'cancel'
                  }
                ]
              );
            } else {
              console.log('🚫 Preventing old challenge accepted notification:', challenge.id);
            }
          }
        });
      });

      friendsUnsubscribeRef.current = unsubscribeFriends;
      requestsUnsubscribeRef.current = unsubscribeRequests;
      challengesUnsubscribeRef.current = unsubscribeChallenges;

      // Set up active PvP games listener
      const activeGamesQuery = query(
        collection(db, 'games'),
        where('players', 'array-contains', user.uid),
        where('status', 'in', ['ready', 'active'])
      );
      
      // Reset popup state when setting up new listener
      setHasShownGameStartPopup(false);
      
      const unsubscribeActiveGames = onSnapshot(activeGamesQuery, (snapshot) => {
        const activeGames = [];
        snapshot.forEach((doc) => {
          const gameData = doc.data();
          
          // Check both possible field names and only include truly active games
          const isPvPGame = gameData.type === 'pvp' || gameData.gameMode === 'pvp';
          const isActiveStatus = ['ready', 'active'].includes(gameData.status);
          
          if (isPvPGame && isActiveStatus) {
            activeGames.push({ id: doc.id, ...gameData });
          }
        });
        
        // Check if this is a new game starting (notification for Player 1)
        // Only show popup if we haven't shown it yet and this is a truly new game
        if (activeGames.length > 0 && !hasShownGameStartPopup) {
          const newGame = activeGames[0];
          
          // Check if this is actually a new game (created recently)
          const gameCreatedAt = newGame.createdAt;
          const isRecentGame = gameCreatedAt && 
            (new Date().getTime() - new Date(gameCreatedAt).getTime()) < 60000; // Within last minute
          
          // Additional check: ensure game is in a valid state
          const isValidGame = newGame.status === 'ready' || 
            (newGame.status === 'active' && newGame.playerWord && newGame.opponentWord);
          
          if (isRecentGame && isValidGame) {
            // Show notification that the game has started
            Alert.alert(
              '🎮 PvP Game Started!',
              `Your challenge to ${newGame.player2?.username || 'your opponent'} has been accepted! The game is ready to begin.`,
              [
                {
                  text: 'Play Now',
                  onPress: () => {
                    playSound('chime').catch(() => {});
                    setHasShownGameStartPopup(true); // Mark as shown
                    navigation.navigate('PvPGame', { gameId: newGame.id });
                  }
                },
                {
                  text: 'Later',
                  style: 'cancel',
                  onPress: () => {
                    setHasShownGameStartPopup(true); // Mark as shown even if dismissed
                  }
                }
              ]
            );
          } else {
            // This is an old stuck game or invalid game, mark popup as shown to prevent it from appearing
            console.log('🚫 Preventing notification for old/invalid game:', newGame.id, newGame.status);
            setHasShownGameStartPopup(true);
          }
        }
        
        setActivePvPGame(activeGames.length > 0 ? activeGames[0] : null);
        
        // Auto-detect and fix stuck games where both players have solved
        if (activeGames.length > 0) {
          const game = activeGames[0];
          if (game.player1?.solved && game.player2?.solved && game.status === 'active') {
            console.log('🔧 Auto-detected stuck completed game:', game.id);
            // Don't auto-fix here, just log it for now to avoid interrupting user experience
            // User can use the "Remove Stuck Game" button to fix it
          }
        }
      });
      
      activeGamesUnsubscribeRef.current = unsubscribeActiveGames;

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
        if (activeGamesUnsubscribeRef.current) {
          activeGamesUnsubscribeRef.current();
        }
        if (unsubscribeSentChallenges) {
          unsubscribeSentChallenges();
        }
      };
    }
  }, [user]);

  // Debug function to check for stuck games
  const checkForStuckGames = async () => {
    try {
      console.log('🔍 Checking for stuck games...');
      const gamesQuery = query(
        collection(db, 'games'),
        where('players', 'array-contains', user.uid)
      );
      
      const snapshot = await getDocs(gamesQuery);
      console.log('🔍 Total games found:', snapshot.docs.length);
      
      snapshot.forEach((doc) => {
        const gameData = doc.data();
        console.log('🔍 Game:', { 
          id: doc.id, 
          status: gameData.status, 
          type: gameData.type, 
          gameMode: gameData.gameMode,
          createdAt: gameData.createdAt,
          completedAt: gameData.completedAt,
          lastUpdated: gameData.lastUpdated
        });
      });
    } catch (error) {
      console.error('🔍 Error checking for stuck games:', error);
    }
  };

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
            console.log('🔧 Fixed game:', doc.id);
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

  // Function to clean up old notifications and challenges
  const cleanupOldNotifications = async () => {
    try {
      console.log('🧹 Cleaning up old notifications...');
      
      // Clean up old challenges that are no longer valid
      const oldChallengesQuery = query(
        collection(db, 'challenges'),
        where('to', '==', user.uid),
        where('status', '==', 'pending')
      );
      
      const challengesSnapshot = await getDocs(oldChallengesQuery);
      let cleanedCount = 0;
      
      for (const doc of challengesSnapshot.docs) {
        const challengeData = doc.data();
        
        // Check if challenge is older than 7 days
        const challengeAge = new Date().getTime() - new Date(challengeData.timestamp?.toDate?.() || challengeData.timestamp).getTime();
        const isOld = challengeAge > (7 * 24 * 60 * 60 * 1000); // 7 days
        
        if (isOld) {
          await updateDoc(doc(db, 'challenges', doc.id), {
            status: 'expired',
            expiredAt: new Date().toISOString()
          });
          cleanedCount++;
        }
      }
      
      console.log('🧹 Cleaned up', cleanedCount, 'old challenges');
      Alert.alert('Cleanup Complete', `Cleaned up ${cleanedCount} old notifications!`);
    } catch (error) {
      console.error('🧹 Error cleaning up notifications:', error);
      Alert.alert('Error', 'Failed to cleanup notifications: ' + error.message);
    }
  };

  // Function to force remove stuck active game
  const forceRemoveStuckGame = async () => {
    try {
      if (activePvPGame) {
        console.log('🗑️ Force removing stuck game:', activePvPGame.id);
        
        // Check if this game should actually be completed instead of abandoned
        if (activePvPGame.player1?.solved && activePvPGame.player2?.solved) {
          console.log('🗑️ Game is actually completed, marking as such instead of abandoned');
          
          // Determine winner by attempts
          const player1Attempts = activePvPGame.player1.attempts || 0;
          const player2Attempts = activePvPGame.player2.attempts || 0;
          
          let updates = {
            status: 'completed',
            completedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          };
          
          if (player1Attempts < player2Attempts) {
            updates.winnerId = activePvPGame.player1.uid;
          } else if (player2Attempts < player1Attempts) {
            updates.winnerId = activePvPGame.player2.uid;
          } else {
            updates.tie = true;
            updates.winnerId = null;
          }
          
          await updateDoc(doc(db, 'games', activePvPGame.id), updates);
          console.log('🗑️ Successfully marked game as completed');
          Alert.alert('Success', 'Game has been properly marked as completed!');
        } else {
          // Mark the game as abandoned
          await updateDoc(doc(db, 'games', activePvPGame.id), {
            status: 'abandoned',
            abandonedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            abandonedBy: user.uid
          });
          
          console.log('🗑️ Successfully marked game as abandoned');
          Alert.alert('Success', 'Stuck game has been marked as abandoned!');
        }
        
        setActivePvPGame(null);
        
        // The screen will automatically refresh through the existing onSnapshot listeners
        // No need to manually call a function
      }
    } catch (error) {
      console.error('🗑️ Error removing stuck game:', error);
      Alert.alert('Error', 'Failed to remove stuck game: ' + error.message);
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
          {/* Debug: Force remove stuck game */}
          <TouchableOpacity
            style={[styles.viewChallengesButton, { backgroundColor: '#EF4444', marginTop: 10 }]}
            onPress={forceRemoveStuckGame}
          >
            <Text style={styles.viewChallengesButtonText}>🔧 Fix Completed Game</Text>
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

        {/* Debug: Check for stuck games */}
        <TouchableOpacity
          style={[styles.navCard, { backgroundColor: '#7C3AED' }]}
          onPress={checkForStuckGames}
        >
          <Text style={styles.navCardTitle}>🔍 Debug: Check Games</Text>
          <Text style={styles.navCardSubtitle}>
            Check for stuck or completed games
          </Text>
        </TouchableOpacity>

        {/* Fix stuck games */}
        <TouchableOpacity
          style={[styles.navCard, { backgroundColor: '#10B981' }]}
          onPress={fixStuckGames}
        >
          <Text style={styles.navCardTitle}>🔧 Fix Stuck Games</Text>
          <Text style={styles.navCardSubtitle}>
            Automatically fix stuck active games
          </Text>
        </TouchableOpacity>

        {/* Clean up old notifications */}
        <TouchableOpacity
          style={[styles.navCard, { backgroundColor: '#F59E0B' }]}
          onPress={cleanupOldNotifications}
        >
          <Text style={styles.navCardTitle}>🧹 Clean Notifications</Text>
          <Text style={styles.navCardSubtitle}>
            Remove old expired challenges
          </Text>
        </TouchableOpacity>

        {/* Force dismiss popup */}
        <TouchableOpacity
          style={[styles.navCard, { backgroundColor: '#F59E0B' }]}
          onPress={() => {
            setHasShownGameStartPopup(true);
            Alert.alert('Popup Dismissed', 'The game start popup has been dismissed.');
          }}
        >
          <Text style={styles.navCardTitle}>🚫 Dismiss Popup</Text>
          <Text style={styles.navCardSubtitle}>
            Force dismiss the game start popup
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
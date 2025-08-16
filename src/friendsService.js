import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  arrayUnion,
  arrayRemove,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { getNotificationService } from './notificationService';

class FriendsService {
  constructor() {
    this.currentUser = null;
    this.friendsUnsubscribe = null;
    this.requestsUnsubscribe = null;
    this.challengesUnsubscribe = null;
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }

  // Friend Requests using subcollections
  async sendFriendRequest(toUserId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      const userData = userDoc.data();
      
      // Create friend document in recipient's friends subcollection with "pending" status
      await setDoc(doc(db, 'users', toUserId, 'friends', this.currentUser.uid), {
        status: 'pending',
        createdAt: new Date().toISOString(),
        senderUsername: userData.username || 'Unknown',
        senderId: this.currentUser.uid
      });

      // Send push notification
      await getNotificationService().sendPushNotification(
        toUserId,
        'New Friend Request',
        `${userData.username || 'Someone'} sent you a friend request`,
        { type: 'friend_request', senderId: this.currentUser.uid, senderName: userData.username }
      );

      console.log('FriendsService: Friend request sent successfully');
      return true;
    } catch (error) {
      console.error('FriendsService: Failed to send friend request:', error);
      throw error;
    }
  }

  async acceptFriendRequest(fromUserId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      // Update the friend document status to "accepted" in recipient's subcollection
      await updateDoc(doc(db, 'users', this.currentUser.uid, 'friends', fromUserId), {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      });

      // Create friend document in sender's friends subcollection with "accepted" status
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      const userData = userDoc.data();
      
      await setDoc(doc(db, 'users', fromUserId, 'friends', this.currentUser.uid), {
        status: 'accepted',
        createdAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
        friendUsername: userData.username || 'Unknown',
        friendId: this.currentUser.uid
      });

      // Send push notification
      await getNotificationService().sendPushNotification(
        fromUserId,
        'Friend Request Accepted',
        `${userData.username || 'Someone'} accepted your friend request`,
        { type: 'friend_request_accepted', senderId: this.currentUser.uid, senderName: userData.username }
      );

      console.log('FriendsService: Friend request accepted successfully');
      return true;
    } catch (error) {
      console.error('FriendsService: Failed to accept friend request:', error);
      throw error;
    }
  }

  async declineFriendRequest(fromUserId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      // Delete the friend document from recipient's subcollection
      await deleteDoc(doc(db, 'users', this.currentUser.uid, 'friends', fromUserId));

      console.log('FriendsService: Friend request declined successfully');
      return true;
    } catch (error) {
      console.error('FriendsService: Failed to decline friend request:', error);
      throw error;
    }
  }

  async blockFriend(friendUserId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      // Update the friend document status to "blocked" in current user's subcollection
      await updateDoc(doc(db, 'users', this.currentUser.uid, 'friends', friendUserId), {
        status: 'blocked',
        blockedAt: new Date().toISOString()
      });

      console.log('FriendsService: Friend blocked successfully');
      return true;
    } catch (error) {
      console.error('FriendsService: Failed to block friend:', error);
      throw error;
    }
  }

  async removeFriend(friendUserId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      // Delete friend documents from both users' subcollections
      await deleteDoc(doc(db, 'users', this.currentUser.uid, 'friends', friendUserId));
      await deleteDoc(doc(db, 'users', friendUserId, 'friends', this.currentUser.uid));

      console.log('FriendsService: Friend removed successfully');
      return true;
    } catch (error) {
      console.error('FriendsService: Failed to remove friend:', error);
      throw error;
    }
  }

  // Get all friends with their status
  async getFriends() {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const friendsRef = collection(db, 'users', this.currentUser.uid, 'friends');
      const q = query(friendsRef, where('status', '==', 'accepted'));
      const querySnapshot = await getDocs(q);
      
      const friends = [];
      for (const friendDoc of querySnapshot.docs) {
        const friendData = friendDoc.data();
        // Get the friend's user profile
        const userDoc = await getDoc(doc(db, 'users', friendDoc.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          friends.push({
            id: friendDoc.id,
            username: userData.username,
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            status: friendData.status,
            createdAt: friendData.createdAt,
            acceptedAt: friendData.acceptedAt
          });
        }
      }
      
      return friends;
    } catch (error) {
      console.error('FriendsService: Failed to get friends:', error);
      return [];
    }
  }

  // Get pending friend requests
  async getPendingFriendRequests() {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const friendsRef = collection(db, 'users', this.currentUser.uid, 'friends');
      const q = query(friendsRef, where('status', '==', 'pending'));
      const querySnapshot = await getDocs(q);
      
      const requests = [];
      for (const requestDoc of querySnapshot.docs) {
        const requestData = requestDoc.data();
        // Get the sender's user profile
        const userDoc = await getDoc(doc(db, 'users', requestDoc.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          requests.push({
            id: requestDoc.id,
            username: userData.username,
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            status: requestData.status,
            createdAt: requestData.createdAt,
            senderUsername: requestData.senderUsername
          });
        }
      }
      
      return requests;
    } catch (error) {
      console.error('FriendsService: Failed to get pending friend requests:', error);
      return [];
    }
  }

  // Check if two users are friends
  async areFriends(userId1, userId2) {
    try {
      const friendDoc = await getDoc(doc(db, 'users', userId1, 'friends', userId2));
      return friendDoc.exists() && friendDoc.data().status === 'accepted';
    } catch (error) {
      console.error('FriendsService: Failed to check friendship status:', error);
      return false;
    }
  }

  // Check friendship status between two users
  async getFriendshipStatus(userId1, userId2) {
    try {
      const friendDoc = await getDoc(doc(db, 'users', userId1, 'friends', userId2));
      if (friendDoc.exists()) {
        return friendDoc.data().status;
      }
      return null; // No friendship relationship
    } catch (error) {
      console.error('FriendsService: Failed to get friendship status:', error);
      return null;
    }
  }

  // Friend Search
  async searchUsers(query) {
    try {
      if (!query || query.length < 2) return [];
      
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('username', '>=', query),
        where('username', '<=', query + '\uf8ff'),
        orderBy('username'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.id !== this.currentUser?.uid);
      
      // Add friendship status to search results
      for (const user of results) {
        user.friendshipStatus = await this.getFriendshipStatus(this.currentUser.uid, user.id);
      }
      
      return results;
    } catch (error) {
      console.error('FriendsService: Failed to search users:', error);
      return [];
    }
  }

  // Challenges
  async sendChallenge(friendUserId, wordLength = 5) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      // Check if they are friends
      const areFriends = await this.areFriends(this.currentUser.uid, friendUserId);
      if (!areFriends) {
        throw new Error('Can only challenge friends');
      }
      
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      const userData = userDoc.data();
      
      const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create challenge document
      await setDoc(doc(db, 'challenges', challengeId), {
        challengeId,
        fromUid: this.currentUser.uid,
        toUid: friendUserId,
        status: 'pending',
        gameMode: 'pvp',
        wordLength,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });

      // Send push notification
      await getNotificationService().sendPushNotification(
        friendUserId,
        'Game Challenge',
        `${userData.username || 'Someone'} challenged you to a game!`,
        { 
          type: 'challenge', 
          challengeId, 
          senderId: this.currentUser.uid, 
          senderName: userData.username,
          wordLength 
        }
      );

      console.log('FriendsService: Challenge sent successfully');
      return challengeId;
    } catch (error) {
      console.error('FriendsService: Failed to send challenge:', error);
      throw error;
    }
  }

  async acceptChallenge(challengeId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const challengeDoc = await getDoc(doc(db, 'challenges', challengeId));
      if (!challengeDoc.exists()) throw new Error('Challenge not found');
      
      const challengeData = challengeDoc.data();
      
      if (challengeData.toUid !== this.currentUser.uid) {
        throw new Error('Not authorized to accept this challenge');
      }
      
      if (challengeData.status !== 'pending') {
        throw new Error('Challenge is no longer pending');
      }
      
      // Update challenge status
      await updateDoc(doc(db, 'challenges', challengeId), {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      });

      // Create game
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await setDoc(doc(db, 'games', gameId), {
        gameId,
        challengeId,
        playerIds: [challengeData.fromUid, challengeData.toUid],
        wordLength: challengeData.wordLength,
        gameMode: 'pvp',
        status: 'ready',
        createdAt: new Date().toISOString()
      });

      // Send push notification to sender
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      const userData = userDoc.data();
      
      await getNotificationService().sendPushNotification(
        challengeData.fromUid,
        'Challenge Accepted',
        `${userData.username || 'Someone'} accepted your challenge!`,
        { 
          type: 'challenge_accepted', 
          challengeId, 
          gameId,
          senderId: this.currentUser.uid, 
          senderName: userData.username 
        }
      );

      console.log('FriendsService: Challenge accepted successfully');
      return gameId;
    } catch (error) {
      console.error('FriendsService: Failed to accept challenge:', error);
      throw error;
    }
  }

  async declineChallenge(challengeId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const challengeDoc = await getDoc(doc(db, 'challenges', challengeId));
      if (!challengeDoc.exists()) throw new Error('Challenge not found');
      
      const challengeData = challengeDoc.data();
      
      if (challengeData.toUid !== this.currentUser.uid) {
        throw new Error('Not authorized to decline this challenge');
      }
      
      // Update challenge status
      await updateDoc(doc(db, 'challenges', challengeId), {
        status: 'declined',
        declinedAt: new Date().toISOString()
      });

      // Send push notification to sender
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      const userData = userDoc.data();
      
      await getNotificationService().sendPushNotification(
        challengeData.fromUid,
        'Challenge Declined',
        `${userData.username || 'Someone'} declined your challenge`,
        { 
          type: 'challenge_declined', 
          challengeId, 
          senderId: this.currentUser.uid, 
          senderName: userData.username 
        }
      );

      console.log('FriendsService: Challenge declined successfully');
      return true;
    } catch (error) {
      console.error('FriendsService: Failed to decline challenge:', error);
      throw error;
    }
  }

  // Listeners using subcollections
  listenToFriends(callback) {
    if (!this.currentUser) return null;
    
    const friendsRef = collection(db, 'users', this.currentUser.uid, 'friends');
    const q = query(friendsRef, where('status', '==', 'accepted'));
    
    this.friendsUnsubscribe = onSnapshot(q, async (snapshot) => {
      const friends = [];
      for (const friendDoc of snapshot.docs) {
        const friendData = friendDoc.data();
        // Get the friend's user profile
        const userDoc = await getDoc(doc(db, 'users', friendDoc.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          friends.push({
            id: friendDoc.id,
            username: userData.username,
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            status: friendData.status,
            createdAt: friendData.createdAt,
            acceptedAt: friendData.acceptedAt
          });
        }
      }
      callback(friends);
    });
    
    return this.friendsUnsubscribe;
  }

  listenToFriendRequests(callback) {
    if (!this.currentUser) return null;
    
    const friendsRef = collection(db, 'users', this.currentUser.uid, 'friends');
    const q = query(friendsRef, where('status', '==', 'pending'));
    
    this.requestsUnsubscribe = onSnapshot(q, async (snapshot) => {
      const requests = [];
      for (const requestDoc of snapshot.docs) {
        const requestData = requestDoc.data();
        // Get the sender's user profile
        const userDoc = await getDoc(doc(db, 'users', requestDoc.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          requests.push({
            id: requestDoc.id,
            username: userData.username,
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            status: requestData.status,
            createdAt: requestData.createdAt,
            senderUsername: requestData.senderUsername
          });
        }
      }
      callback(requests);
    });
    
    return this.requestsUnsubscribe;
  }

  listenToChallenges(callback) {
    if (!this.currentUser) return null;
    
    const challengesRef = collection(db, 'challenges');
    const q = query(
      challengesRef,
      where('toUid', '==', this.currentUser.uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    
    this.challengesUnsubscribe = onSnapshot(q, (snapshot) => {
      const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(challenges);
    });
    
    return this.challengesUnsubscribe;
  }

  // Cleanup
  cleanup() {
    if (this.friendsUnsubscribe) {
      this.friendsUnsubscribe();
      this.friendsUnsubscribe = null;
    }
    if (this.requestsUnsubscribe) {
      this.requestsUnsubscribe();
      this.requestsUnsubscribe = null;
    }
    if (this.challengesUnsubscribe) {
      this.challengesUnsubscribe();
      this.challengesUnsubscribe = null;
    }
  }
}

export default new FriendsService();

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
import pushNotificationService from './pushNotificationService';

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
      console.log('🔍 [FriendsService] Starting sendFriendRequest');
      console.log('🔍 [FriendsService] Current user:', this.currentUser?.uid, this.currentUser?.displayName);
      console.log('🔍 [FriendsService] Target user ID:', toUserId);
      
      if (!this.currentUser) throw new Error('User not authenticated');
      
      // Check if a request already exists
      console.log('🔍 [FriendsService] Checking for existing friend request...');
      const existingRequestDoc = await getDoc(doc(db, 'users', toUserId, 'friends', this.currentUser.uid));
      
      if (existingRequestDoc.exists()) {
        const existingData = existingRequestDoc.data();
        console.log('🔍 [FriendsService] Existing request found:', existingData);
        
        if (existingData.status === 'pending') {
          console.log('🔍 [FriendsService] Duplicate request detected - preventing send');
          throw new Error('Friend request already pending');
        } else if (existingData.status === 'accepted') {
          console.log('🔍 [FriendsService] Already friends - preventing send');
          throw new Error('Already friends');
        } else if (existingData.status === 'blocked') {
          console.log('🔍 [FriendsService] User is blocked - preventing send');
          throw new Error('User is blocked');
        }
      }
      
      console.log('🔍 [FriendsService] No existing request found - proceeding with new request');
      
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      const userData = userDoc.data();
      console.log('🔍 [FriendsService] Current user data:', userData);
      
      const friendRequestData = {
        status: 'pending',
        createdAt: new Date().toISOString(),
        senderUsername: userData.username || 'Unknown',
        senderId: this.currentUser.uid
      };
      
      console.log('🔍 [FriendsService] Friend request data to be saved:', friendRequestData);
      console.log('🔍 [FriendsService] Using NEW subcollection system: users/', toUserId, '/friends/', this.currentUser.uid);
      
      // Create friend document in recipient's friends subcollection with "pending" status
      await setDoc(doc(db, 'users', toUserId, 'friends', this.currentUser.uid), friendRequestData);
      console.log('🔍 [FriendsService] Friend request document created successfully');

      // Send push notification
      console.log('🔍 [FriendsService] Sending push notification to:', toUserId);
      await getNotificationService().sendFriendRequestNotification(
        toUserId,
        userData.username || userData.displayName || 'Someone'
      );
      console.log('🔍 [FriendsService] Push notification sent successfully');

      return true;
    } catch (error) {
      console.error('❌ [FriendsService] Failed to send friend request:', error);
      throw error;
    }
  }

  async acceptFriendRequest(fromUserId) {
    try {
      console.log('🔍 [FriendsService] Accepting friend request from:', fromUserId);
      
      if (!this.currentUser) throw new Error('User not authenticated');
      
      // Update the friend document status to "accepted" in recipient's subcollection
      await updateDoc(doc(db, 'users', this.currentUser.uid, 'friends', fromUserId), {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      });
      console.log('🔍 [FriendsService] Updated request status to accepted');

      // Clear any redundant friend requests between these two users
      console.log('🔍 [FriendsService] Clearing redundant friend requests...');
      
      // Check for redundant requests from current user to the sender
      const redundantRequestDoc = doc(db, 'users', fromUserId, 'friends', this.currentUser.uid);
      const redundantRequestSnapshot = await getDoc(redundantRequestDoc);
      
      if (redundantRequestSnapshot.exists()) {
        const redundantData = redundantRequestSnapshot.data();
        if (redundantData.status === 'pending') {
          console.log('🔍 [FriendsService] Found redundant request to clear');
          await deleteDoc(redundantRequestDoc);
          console.log('🔍 [FriendsService] Cleared redundant request');
        }
      }

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
      console.log('🔍 [FriendsService] Created mutual friendship');

      // Also update OLD friendRequests collection for backward compatibility
      console.log('🔍 [FriendsService] Updating OLD friendRequests collection...');
      const oldSystemQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', fromUserId),
        where('toUid', '==', this.currentUser.uid),
        where('status', '==', 'pending')
      );
      const oldSystemSnapshot = await getDocs(oldSystemQuery);
      
      if (oldSystemSnapshot.docs.length > 0) {
        const oldSystemDoc = oldSystemSnapshot.docs[0];
        await updateDoc(oldSystemDoc.ref, {
          status: 'accepted',
          acceptedAt: new Date().toISOString()
        });
        console.log('🔍 [FriendsService] Updated OLD system request to accepted');
      }

      // Send push notification
      await getNotificationService().sendFriendRequestAcceptedNotification(
        fromUserId,
        userData.username || userData.displayName || 'Someone'
      );
      console.log('🔍 [FriendsService] Sent push notification');

      return true;
    } catch (error) {
      console.error('❌ [FriendsService] Failed to accept friend request:', error);
      throw error;
    }
  }

  async declineFriendRequest(fromUserId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      // Delete the friend document from recipient's subcollection
      await deleteDoc(doc(db, 'users', this.currentUser.uid, 'friends', fromUserId));

      // Get current user data for notification
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      const userData = userDoc.data();

      // Send push notification
      await getNotificationService().sendFriendRequestDeclinedNotification(
        fromUserId,
        userData.username || userData.displayName || 'Someone'
      );

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
      const friendsQuery = query(friendsRef, where('status', '==', 'accepted'));
      const querySnapshot = await getDocs(friendsQuery);
      
      const friends = [];
      for (const friendDocSnapshot of querySnapshot.docs) {
        const friendData = friendDocSnapshot.data();
        // Get the friend's user profile
        const userDocRef = await getDoc(doc(db, 'users', friendDocSnapshot.id));
        if (userDocRef.exists()) {
          const userData = userDocRef.data();
          friends.push({
            id: friendDocSnapshot.id,
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
      const requestsQuery = query(friendsRef, where('status', '==', 'pending'));
      const querySnapshot = await getDocs(requestsQuery);
      
      const requests = [];
      for (const requestDocSnapshot of querySnapshot.docs) {
        const requestData = requestDocSnapshot.data();
        // Get the sender's user profile
        const userDocRef = await getDoc(doc(db, 'users', requestDocSnapshot.id));
        if (userDocRef.exists()) {
          const userData = userDocRef.data();
          requests.push({
            id: requestDocSnapshot.id,
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


  // Check if two users are friends (check both NEW and OLD systems)
  async areFriends(userId1, userId2) {
    try {
      console.log('🔍 [FriendsService] Checking if users are friends:', userId1, 'and', userId2);
      
      // Check NEW subcollection system first
      const friendDoc = await getDoc(doc(db, 'users', userId1, 'friends', userId2));
      console.log('🔍 [FriendsService] NEW system - Friend doc exists:', friendDoc.exists());
      if (friendDoc.exists()) {
        const data = friendDoc.data();
        console.log('🔍 [FriendsService] NEW system - Friend doc data:', data);
        const isAccepted = data.status === 'accepted';
        console.log('🔍 [FriendsService] NEW system - Status is accepted:', isAccepted);
        if (isAccepted) return true;
      }
      
      // Check OLD friendRequests collection as fallback
      console.log('🔍 [FriendsService] Checking OLD friendRequests collection...');
      
      // Check for any non-pending status (accepted, confirmed, friends, etc.)
      const oldSystemQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', userId1),
        where('toUid', '==', userId2)
      );
      const oldSystemSnapshot = await getDocs(oldSystemQuery);
      console.log('🔍 [FriendsService] OLD system - All requests found:', oldSystemSnapshot.docs.length);
      
      // Check each document to see if it's a friendship (not pending)
      for (const docSnapshot of oldSystemSnapshot.docs) {
        const data = docSnapshot.data();
        console.log('🔍 [FriendsService] OLD system - Request status:', data.status);
        if (data.status && data.status !== 'pending' && data.status !== 'declined') {
          console.log('🔍 [FriendsService] OLD system - Found friendship with status:', data.status);
          return true;
        }
      }
      
      // Also check reverse direction in OLD system
      const reverseQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', userId2),
        where('toUid', '==', userId1)
      );
      const reverseSnapshot = await getDocs(reverseQuery);
      console.log('🔍 [FriendsService] OLD system - Reverse requests found:', reverseSnapshot.docs.length);
      
      // Check each reverse document
      for (const docSnapshot of reverseSnapshot.docs) {
        const data = docSnapshot.data();
        console.log('🔍 [FriendsService] OLD system - Reverse request status:', data.status);
        if (data.status && data.status !== 'pending' && data.status !== 'declined') {
          console.log('🔍 [FriendsService] OLD system - Found reverse friendship with status:', data.status);
          return true;
        }
      }
      
      console.log('🔍 [FriendsService] No friendship found in either system');
      return false;
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
  async searchUsers(usernameQuery) {
    try {
      // Trim whitespace from the query
      const trimmedQuery = usernameQuery?.trim();
      if (!trimmedQuery || trimmedQuery.length < 2) return [];
      
      console.log('🔍 [FriendsService] Searching for username:', trimmedQuery);
      console.log('🔍 [FriendsService] Current user:', this.currentUser?.uid);
      
      const usersRef = collection(db, 'users');
      
      // Skip indexed query and go straight to fallback to see all users
      console.log('🔍 [FriendsService] Using fallback method to see all users');
      
      // Get all users and filter client-side
      const allUsersQuery = query(usersRef, limit(100)); // Limit to prevent large downloads
      const querySnapshot = await getDocs(allUsersQuery);
      
      console.log('🔍 [FriendsService] Total users in database:', querySnapshot.docs.length);
      
      const allUsers = querySnapshot.docs
        .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }))
        .filter(user => user.id !== this.currentUser?.uid);
      
      console.log('🔍 [FriendsService] After filtering current user:', allUsers.length, 'users');
      console.log('🔍 [FriendsService] All usernames in database:', allUsers.map(u => u.username));
      
      // Filter by username on client side
      console.log('🔍 [FriendsService] Filtering with query:', trimmedQuery.toLowerCase());
      
      const filteredUsers = allUsers.filter(user => {
        if (!user.username) {
          return false;
        }
        const userLower = user.username.toLowerCase();
        const queryLower = trimmedQuery.toLowerCase();
        const matches = userLower.startsWith(queryLower);
        return matches;
      }).slice(0, 10); // Limit to 10 results
      
      console.log('🔍 [FriendsService] After username filtering:', filteredUsers.length, 'users');
      console.log('🔍 [FriendsService] Filtered users:', filteredUsers.map(u => u.username));
      
      // Add friendship status to search results
      for (const user of filteredUsers) {
        user.friendshipStatus = await this.getFriendshipStatus(this.currentUser.uid, user.id);
      }
      
      return filteredUsers;
    } catch (error) {
      console.error('🔍 [FriendsService] Failed to search users:', error);
      console.error('🔍 [FriendsService] Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
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

      return challengeId;
    } catch (error) {
      console.error('FriendsService: Failed to send challenge:', error);
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
    const friendsQuery = query(friendsRef, where('status', '==', 'accepted'));
    
    this.friendsUnsubscribe = onSnapshot(friendsQuery, async (snapshot) => {
      const friends = [];
      for (const friendDocSnapshot of snapshot.docs) {
        const friendData = friendDocSnapshot.data();
        // Get the friend's user profile
        const userDocRef = await getDoc(doc(db, 'users', friendDocSnapshot.id));
        if (userDocRef.exists()) {
          const userData = userDocRef.data();
          friends.push({
            id: friendDocSnapshot.id,
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
    if (!this.currentUser) {
      console.log('❌ [FriendsService] No current user for listenToFriendRequests');
      return null;
    }
    
    console.log('🔍 [FriendsService] Setting up listenToFriendRequests');
    console.log('🔍 [FriendsService] Current user ID:', this.currentUser.uid);
    
    const friendsRef = collection(db, 'users', this.currentUser.uid, 'friends');
    const requestsQuery = query(friendsRef, where('status', '==', 'pending'));
    
    console.log('🔍 [FriendsService] Querying NEW subcollection system for user:', this.currentUser.uid);
    
    this.requestsUnsubscribe = onSnapshot(requestsQuery, async (snapshot) => {
      console.log('🔍 [FriendsService] Friend request listener triggered');
      console.log('🔍 [FriendsService] Snapshot size:', snapshot.docs.length);
      console.log('🔍 [FriendsService] Raw snapshot docs:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      const requests = [];
      for (const requestDocSnapshot of snapshot.docs) {
        const requestData = requestDocSnapshot.data();
        console.log('🔍 [FriendsService] Processing request from:', requestDocSnapshot.id, 'with data:', requestData);
        
        // Get the sender's user profile
        const userDocRef = await getDoc(doc(db, 'users', requestDocSnapshot.id));
        if (userDocRef.exists()) {
          const userData = userDocRef.data();
          console.log('🔍 [FriendsService] Found user profile for:', requestDocSnapshot.id, userData);
          
          const requestItem = {
            id: requestDocSnapshot.id,
            username: userData.username,
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            status: requestData.status,
            createdAt: requestData.createdAt,
            senderUsername: requestData.senderUsername
          };
          
          console.log('🔍 [FriendsService] Created request item:', requestItem);
          requests.push(requestItem);
        } else {
          console.log('❌ [FriendsService] User profile not found for:', requestDocSnapshot.id);
        }
      }
      
      console.log('🔍 [FriendsService] Final processed requests:', requests);
      callback(requests);
    }, (error) => {
      console.error('❌ [FriendsService] Friend request listener error:', error);
    });
    
    return this.requestsUnsubscribe;
  }

  listenToChallenges(callback) {
    if (!this.currentUser) return null;
    
    const challengesRef = collection(db, 'challenges');
    const challengesQuery = query(
      challengesRef,
      where('toUid', '==', this.currentUser.uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    
    this.challengesUnsubscribe = onSnapshot(challengesQuery, (snapshot) => {
      const challenges = snapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }));
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

// ✅ CONSISTENT SYSTEM ⚠️
// This service uses the NEW subcollection system (users/{userId}/friends/{friendId})
// All files now use the same NEW subcollection system for consistency
console.log('✅ [FriendsService] Using NEW subcollection system - consistent with all screens');

export default new FriendsService();

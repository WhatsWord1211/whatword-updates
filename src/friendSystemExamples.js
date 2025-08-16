import friendsService from './friendsService';
import authService from './authService';

// ============================================================================
// FRIEND SYSTEM EXAMPLES USING FIRESTORE SUBCOLLECTIONS
// ============================================================================

// Initialize the service with current user
export const initializeFriendService = async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      friendsService.setCurrentUser(currentUser);
      console.log('FriendService initialized for user:', currentUser.uid);
    }
  } catch (error) {
    console.error('Failed to initialize FriendService:', error);
  }
};

// ============================================================================
// FRIEND REQUEST OPERATIONS
// ============================================================================

// Send a friend request to another user
export const sendFriendRequestExample = async (targetUserId) => {
  try {
    const result = await friendsService.sendFriendRequest(targetUserId);
    console.log('Friend request sent successfully');
    return result;
  } catch (error) {
    console.error('Failed to send friend request:', error);
    throw error;
  }
};

// Accept a friend request
export const acceptFriendRequestExample = async (senderUserId) => {
  try {
    const result = await friendsService.acceptFriendRequest(senderUserId);
    console.log('Friend request accepted successfully');
    return result;
  } catch (error) {
    console.error('Failed to accept friend request:', error);
    throw error;
  }
};

// Decline a friend request
export const declineFriendRequestExample = async (senderUserId) => {
  try {
    const result = await friendsService.declineFriendRequest(senderUserId);
    console.log('Friend request declined successfully');
    return result;
  } catch (error) {
    console.error('Failed to decline friend request:', error);
    throw error;
  }
};

// ============================================================================
// FRIEND MANAGEMENT OPERATIONS
// ============================================================================

// Block a friend
export const blockFriendExample = async (friendUserId) => {
  try {
    const result = await friendsService.blockFriend(friendUserId);
    console.log('Friend blocked successfully');
    return result;
  } catch (error) {
    console.error('Failed to block friend:', error);
    throw error;
  }
};

// Remove a friend
export const removeFriendExample = async (friendUserId) => {
  try {
    const result = await friendsService.removeFriend(friendUserId);
    console.log('Friend removed successfully');
    return result;
  } catch (error) {
    console.error('Failed to remove friend:', error);
    throw error;
  }
};

// ============================================================================
// FRIEND DATA RETRIEVAL
// ============================================================================

// Get all accepted friends
export const getFriendsExample = async () => {
  try {
    const friends = await friendsService.getFriends();
    console.log('Friends retrieved:', friends);
    return friends;
  } catch (error) {
    console.error('Failed to get friends:', error);
    return [];
  }
};

// Get pending friend requests
export const getPendingRequestsExample = async () => {
  try {
    const requests = await friendsService.getPendingFriendRequests();
    console.log('Pending requests retrieved:', requests);
    return requests;
  } catch (error) {
    console.error('Failed to get pending requests:', error);
    return [];
  }
};

// Check if two users are friends
export const checkFriendshipExample = async (userId1, userId2) => {
  try {
    const areFriends = await friendsService.areFriends(userId1, userId2);
    console.log(`Users ${userId1} and ${userId2} are friends:`, areFriends);
    return areFriends;
  } catch (error) {
    console.error('Failed to check friendship:', error);
    return false;
  }
};

// Get friendship status between two users
export const getFriendshipStatusExample = async (userId1, userId2) => {
  try {
    const status = await friendsService.getFriendshipStatus(userId1, userId2);
    console.log(`Friendship status between ${userId1} and ${userId2}:`, status);
    return status; // Returns: 'pending', 'accepted', 'blocked', or null
  } catch (error) {
    console.error('Failed to get friendship status:', error);
    return null;
  }
};

// ============================================================================
// USER SEARCH
// ============================================================================

// Search for users by username
export const searchUsersExample = async (searchQuery) => {
  try {
    const results = await friendsService.searchUsers(searchQuery);
    console.log('Search results:', results);
    
    // Each result includes friendship status
    results.forEach(user => {
      console.log(`User: ${user.username}, Friendship Status: ${user.friendshipStatus}`);
    });
    
    return results;
  } catch (error) {
    console.error('Failed to search users:', error);
    return [];
  }
};

// ============================================================================
// CHALLENGE OPERATIONS
// ============================================================================

// Send a game challenge to a friend
export const sendChallengeExample = async (friendUserId, wordLength = 5) => {
  try {
    const challengeId = await friendsService.sendChallenge(friendUserId, wordLength);
    console.log('Challenge sent successfully, ID:', challengeId);
    return challengeId;
  } catch (error) {
    console.error('Failed to send challenge:', error);
    throw error;
  }
};

// Accept a game challenge
export const acceptChallengeExample = async (challengeId) => {
  try {
    const gameId = await friendsService.acceptChallenge(challengeId);
    console.log('Challenge accepted, game created with ID:', gameId);
    return gameId;
  } catch (error) {
    console.error('Failed to accept challenge:', error);
    throw error;
  }
};

// Decline a game challenge
export const declineChallengeExample = async (challengeId) => {
  try {
    const result = await friendsService.declineChallenge(challengeId);
    console.log('Challenge declined successfully');
    return result;
  } catch (error) {
    console.error('Failed to decline challenge:', error);
    throw error;
  }
};

// ============================================================================
// REAL-TIME LISTENERS
// ============================================================================

// Listen to friends list changes
export const listenToFriendsExample = (callback) => {
  try {
    const unsubscribe = friendsService.listenToFriends(callback);
    console.log('Listening to friends list changes');
    return unsubscribe;
  } catch (error) {
    console.error('Failed to listen to friends:', error);
    return null;
  }
};

// Listen to friend request changes
export const listenToFriendRequestsExample = (callback) => {
  try {
    const unsubscribe = friendsService.listenToFriendRequests(callback);
    console.log('Listening to friend request changes');
    return unsubscribe;
  } catch (error) {
    console.error('Failed to listen to friend requests:', error);
    return null;
  }
};

// Listen to incoming challenges
export const listenToChallengesExample = (callback) => {
  try {
    const unsubscribe = friendsService.listenToChallenges(callback);
    console.log('Listening to incoming challenges');
    return unsubscribe;
  } catch (error) {
    console.error('Failed to listen to challenges:', error);
    return null;
  }
};

// ============================================================================
// COMPLETE FRIEND FLOW EXAMPLES
// ============================================================================

// Complete flow: Search, send request, accept, and challenge
export const completeFriendFlowExample = async (targetUsername, wordLength = 5) => {
  try {
    console.log('Starting complete friend flow for username:', targetUsername);
    
    // 1. Search for the user
    const searchResults = await friendsService.searchUsers(targetUsername);
    if (searchResults.length === 0) {
      throw new Error('User not found');
    }
    
    const targetUser = searchResults[0];
    console.log('Found target user:', targetUser.username);
    
    // 2. Check current friendship status
    const currentStatus = await friendsService.getFriendshipStatus(
      friendsService.currentUser.uid, 
      targetUser.id
    );
    console.log('Current friendship status:', currentStatus);
    
    if (currentStatus === 'accepted') {
      console.log('Users are already friends, sending challenge...');
      const challengeId = await friendsService.sendChallenge(targetUser.id, wordLength);
      return { type: 'challenge_sent', challengeId, targetUser };
    }
    
    if (currentStatus === 'pending') {
      console.log('Friend request already pending');
      return { type: 'request_pending', targetUser };
    }
    
    if (currentStatus === 'blocked') {
      console.log('User is blocked');
      return { type: 'user_blocked', targetUser };
    }
    
    // 3. Send friend request
    console.log('Sending friend request...');
    await friendsService.sendFriendRequest(targetUser.id);
    
    return { type: 'request_sent', targetUser };
    
  } catch (error) {
    console.error('Complete friend flow failed:', error);
    throw error;
  }
};

// Handle incoming friend request
export const handleIncomingFriendRequestExample = async (senderUserId, accept = true) => {
  try {
    console.log('Handling incoming friend request from:', senderUserId);
    
    if (accept) {
      await friendsService.acceptFriendRequest(senderUserId);
      console.log('Friend request accepted');
      return { type: 'accepted', senderUserId };
    } else {
      await friendsService.declineFriendRequest(senderUserId);
      console.log('Friend request declined');
      return { type: 'declined', senderUserId };
    }
  } catch (error) {
    console.error('Failed to handle friend request:', error);
    throw error;
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Clean up all listeners
export const cleanupListenersExample = () => {
  try {
    friendsService.cleanup();
    console.log('All listeners cleaned up');
  } catch (error) {
    console.error('Failed to cleanup listeners:', error);
  }
};

// Get user's complete social status
export const getUserSocialStatusExample = async (userId) => {
  try {
    const [friends, pendingRequests] = await Promise.all([
      friendsService.getFriends(),
      friendsService.getPendingFriendRequests()
    ]);
    
    return {
      friendsCount: friends.length,
      pendingRequestsCount: pendingRequests.length,
      friends,
      pendingRequests
    };
  } catch (error) {
    console.error('Failed to get user social status:', error);
    return { friendsCount: 0, pendingRequestsCount: 0, friends: [], pendingRequests: [] };
  }
};

// ============================================================================
// ERROR HANDLING EXAMPLES
// ============================================================================

// Handle friend system errors
export const handleFriendSystemError = (error) => {
  switch (error.message) {
    case 'User not authenticated':
      console.error('Authentication required');
      // Redirect to login
      break;
    case 'Can only challenge friends':
      console.error('Must be friends to challenge');
      // Show friend request option
      break;
    case 'Challenge not found':
      console.error('Challenge no longer exists');
      // Refresh challenges list
      break;
    case 'Not authorized to accept this challenge':
      console.error('Unauthorized action');
      // Show error message
      break;
    default:
      console.error('Unknown friend system error:', error);
      // Show generic error
  }
};

// ============================================================================
// DATA VALIDATION EXAMPLES
// ============================================================================

// Validate username for search
export const validateUsernameSearch = (username) => {
  if (!username || username.length < 2) {
    throw new Error('Username must be at least 2 characters long');
  }
  
  if (username.length > 20) {
    throw new Error('Username must be less than 20 characters');
  }
  
  // Basic alphanumeric validation
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new Error('Username can only contain letters, numbers, and underscores');
  }
  
  return true;
};

// Validate word length for challenges
export const validateWordLength = (length) => {
  const validLengths = [3, 4, 5, 6, 7, 8];
  if (!validLengths.includes(length)) {
    throw new Error('Word length must be between 3 and 8 characters');
  }
  return true;
};

// ============================================================================
// EXPORT ALL EXAMPLES
// ============================================================================

export default {
  // Initialization
  initializeFriendService,
  
  // Friend Requests
  sendFriendRequestExample,
  acceptFriendRequestExample,
  declineFriendRequestExample,
  
  // Friend Management
  blockFriendExample,
  removeFriendExample,
  
  // Data Retrieval
  getFriendsExample,
  getPendingRequestsExample,
  checkFriendshipExample,
  getFriendshipStatusExample,
  
  // User Search
  searchUsersExample,
  
  // Challenges
  sendChallengeExample,
  acceptChallengeExample,
  declineChallengeExample,
  
  // Real-time Listeners
  listenToFriendsExample,
  listenToFriendRequestsExample,
  listenToChallengesExample,
  
  // Complete Flows
  completeFriendFlowExample,
  handleIncomingFriendRequestExample,
  
  // Utilities
  cleanupListenersExample,
  getUserSocialStatusExample,
  
  // Error Handling
  handleFriendSystemError,
  
  // Validation
  validateUsernameSearch,
  validateWordLength
};

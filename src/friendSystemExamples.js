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
    
    // Each result includes friendship status
    results.forEach(user => {
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
    return challengeId;
  } catch (error) {
    console.error('Failed to send challenge:', error);
    throw error;
  }
};

// Accept a game challenge
// Note: Challenge acceptance is handled through SetWordGameScreen navigation, not directly through friendsService
export const acceptChallengeExample = async (challenge) => {
  try {
    // In the actual app, navigate to SetWordGameScreen with the challenge object
    // navigation.navigate('SetWordGame', { challenge, isAccepting: true });
    console.log('Challenge acceptance handled through SetWordGameScreen');
  } catch (error) {
    console.error('Failed to accept challenge:', error);
    throw error;
  }
};

// Decline a game challenge
export const declineChallengeExample = async (challengeId) => {
  try {
    const result = await friendsService.declineChallenge(challengeId);
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
    
    // 1. Search for the user
    const searchResults = await friendsService.searchUsers(targetUsername);
    if (searchResults.length === 0) {
      throw new Error('User not found');
    }
    
    const targetUser = searchResults[0];
    
    // 2. Check current friendship status
    const currentStatus = await friendsService.getFriendshipStatus(
      friendsService.currentUser.uid, 
      targetUser.id
    );
    
    if (currentStatus === 'accepted') {
      const challengeId = await friendsService.sendChallenge(targetUser.id, wordLength);
      return { type: 'challenge_sent', challengeId, targetUser };
    }
    
    if (currentStatus === 'pending') {
      return { type: 'request_pending', targetUser };
    }
    
    if (currentStatus === 'blocked') {
      return { type: 'user_blocked', targetUser };
    }
    
    // 3. Send friend request
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
    
    if (accept) {
      await friendsService.acceptFriendRequest(senderUserId);
      return { type: 'accepted', senderUserId };
    } else {
      await friendsService.declineFriendRequest(senderUserId);
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

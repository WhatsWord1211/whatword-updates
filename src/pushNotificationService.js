// import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, setDoc, updateDoc, collection, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/**
 * Client-side service for interacting with push notification Firebase Functions
 * This service provides methods to trigger notifications and manage notification data
 */
class PushNotificationService {
  constructor() {
    this.functions = getFunctions();
    this.firestore = getFirestore();
    this.auth = getAuth();
    
    // Initialize Firebase Functions
    this.sendCustomNotification = httpsCallable(this.functions, 'sendCustomNotification');
    this.sendBulkNotifications = httpsCallable(this.functions, 'sendBulkNotifications');
    this.getNotificationStats = httpsCallable(this.functions, 'getNotificationStats');
  }

  /**
   * Send a custom notification to a specific user
   * @param {string} userId - Target user ID
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} notificationData - Additional data payload
   * @param {string} type - Notification type
   * @returns {Promise<Object>} Function result
   */
  async sendCustomNotification(userId, title, body, notificationData = {}, type = 'custom') {
    try {
      const result = await this.sendCustomNotification({
        userId,
        title,
        body,
        notificationData,
        type,
      });
      
      console.log('Custom notification sent successfully:', result.data);
      return result.data;
    } catch (error) {
      console.error('Error sending custom notification:', error);
      throw error;
    }
  }

  /**
   * Send bulk notifications to multiple users
   * @param {Array<string>} userIds - Array of target user IDs
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} notificationData - Additional data payload
   * @param {string} type - Notification type
   * @returns {Promise<Object>} Function result
   */
  async sendBulkNotifications(userIds, title, body, notificationData = {}, type = 'bulk') {
    try {
      const result = await this.sendBulkNotifications({
        userIds,
        title,
        body,
        notificationData,
        type,
      });
      
      console.log('Bulk notifications sent successfully:', result.data);
      return result.data;
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   * @param {Object} options - Query options
   * @param {string} options.startDate - Start date for filtering
   * @param {string} options.endDate - End date for filtering
   * @param {string} options.type - Notification type filter
   * @returns {Promise<Object>} Statistics data
   */
  async getNotificationStats(options = {}) {
    try {
      const result = await this.getNotificationStats(options);
      console.log('Notification stats retrieved:', result.data);
      return result.data;
    } catch (error) {
      console.error('Error getting notification stats:', error);
      throw error;
    }
  }

  /**
   * Send a friend request notification manually
   * This can be used as a fallback if the Cloud Function doesn't trigger
   * @param {string} fromUserId - Sender user ID
   * @param {string} toUserId - Recipient user ID
   * @param {string} senderName - Sender's display name
   * @returns {Promise<Object>} Function result
   */
  async sendFriendRequestNotification(fromUserId, toUserId, senderName) {
    const title = 'New Friend Request';
    const body = `${senderName} sent you a friend request`;
    
    const notificationData = {
      type: 'friend_request',
      fromUserId,
      toUserId,
      action: 'view_friend_request',
    };

    return await this.sendCustomNotification(toUserId, title, body, notificationData, 'friend_request');
  }

  /**
   * Send a friend request response notification manually
   * @param {string} fromUserId - Original requester ID
   * @param {string} toUserId - Responder ID
   * @param {string} responderName - Responder's display name
   * @param {string} status - Response status (accepted/declined)
   * @returns {Promise<Object>} Function result
   */
  async sendFriendRequestResponseNotification(fromUserId, toUserId, responderName, status) {
    const title = 'Friend Request Update';
    const body = `${responderName} ${status} your friend request`;
    
    const notificationData = {
      type: 'friend_request_response',
      fromUserId,
      toUserId,
      status,
      action: 'view_friend_list',
    };

    return await this.sendCustomNotification(fromUserId, title, body, notificationData, 'friend_request_response');
  }

  /**
   * Send a game challenge notification manually
   * @param {string} fromUserId - Challenger ID
   * @param {string} toUserId - Challenge recipient ID
   * @param {string} challengerName - Challenger's display name
   * @param {number} wordLength - Word length for the game
   * @param {number} timeLimit - Time limit for the game
   * @returns {Promise<Object>} Function result
   */
  async sendGameChallengeNotification(fromUserId, toUserId, challengerName, wordLength, timeLimit) {
    const title = 'Game Challenge!';
    const body = `${challengerName} challenged you to a ${wordLength}-letter word game`;
    
    const notificationData = {
      type: 'game_challenge',
      fromUserId,
      toUserId,
      wordLength,
      timeLimit,
      action: 'view_challenge',
    };

    return await this.sendCustomNotification(toUserId, title, body, notificationData, 'game_challenge');
  }

  /**
   * Send a game challenge response notification manually
   * @param {string} fromUserId - Original challenger ID
   * @param {string} toUserId - Responder ID
   * @param {string} responderName - Responder's display name
   * @param {string} status - Response status (accepted/declined)
   * @returns {Promise<Object>} Function result
   */
  async sendGameChallengeResponseNotification(fromUserId, toUserId, responderName, status) {
    const title = 'Challenge Response';
    const body = `${responderName} ${status} your game challenge`;
    
    const notificationData = {
      type: 'challenge_response',
      fromUserId,
      toUserId,
      status,
      action: status === 'accepted' ? 'start_game' : 'view_challenges',
    };

    return await this.sendCustomNotification(fromUserId, title, body, notificationData, 'challenge_response');
  }

  /**
   * Send a game result notification manually
   * @param {string} userId - Target user ID
   * @param {string} result - Game result (victory/defeat/tie)
   * @param {string} opponentName - Opponent's display name
   * @param {number} userScore - User's score
   * @param {number} opponentScore - Opponent's score
   * @param {string} gameId - Game ID
   * @returns {Promise<Object>} Function result
   */
  async sendGameResultNotification(userId, result, opponentName, userScore, opponentScore, gameId) {
    let title, body;
    
    switch (result) {
      case 'victory':
        title = 'Victory! 🎉';
        body = `Congratulations! You won against ${opponentName} with ${userScore} points!`;
        break;
      case 'defeat':
        title = 'Game Over';
        body = `You lost to ${opponentName}. Score: ${userScore} - ${opponentScore}`;
        break;
      case 'tie':
        title = 'It\'s a Tie! 🤝';
        body = `The game ended in a tie! Both players scored ${userScore} points.`;
        break;
      default:
        throw new Error('Invalid game result');
    }
    
    const notificationData = {
      type: 'game_result',
      gameId,
      result,
      score: userScore,
      opponentScore,
      action: 'view_game_result',
    };

    return await this.sendCustomNotification(userId, title, body, notificationData, 'game_result');
  }

  /**
   * Send a turn notification manually
   * @param {string} userId - Current player ID
   * @param {string} opponentName - Opponent's display name
   * @param {string} gameId - Game ID
   * @returns {Promise<Object>} Function result
   */
  async sendTurnNotification(userId, opponentName, gameId) {
    const title = 'Your Turn!';
    const body = `It's your turn in the game against ${opponentName}`;
    
    const notificationData = {
      type: 'turn_notification',
      gameId,
      action: 'play_turn',
    };

    return await this.sendCustomNotification(userId, title, body, notificationData, 'turn_notification');
  }

  /**
   * Send a welcome notification to a new user
   * @param {string} userId - New user ID
   * @param {string} userName - User's display name
   * @returns {Promise<Object>} Function result
   */
  async sendWelcomeNotification(userId, userName) {
    const title = 'Welcome to WhatWord! 🎉';
    const body = `Hi ${userName}! Welcome to the ultimate word game. Start playing and challenge your friends!`;
    
    const notificationData = {
      type: 'welcome',
      action: 'explore_app',
    };

    return await this.sendCustomNotification(userId, title, body, notificationData, 'welcome');
  }

  /**
   * Send a daily reminder notification
   * @param {string} userId - Target user ID
   * @param {string} userName - User's display name
   * @returns {Promise<Object>} Function result
   */
  async sendDailyReminderNotification(userId, userName) {
    const title = 'Time to Play! 🎯';
    const body = `Hey ${userName}! Your daily word challenge is waiting. Keep your streak alive!`;
    
    const notificationData = {
      type: 'daily_reminder',
      action: 'play_daily',
    };

    return await this.sendCustomNotification(userId, title, body, notificationData, 'daily_reminder');
  }

  /**
   * Send an achievement notification
   * @param {string} userId - Target user ID
   * @param {string} achievementName - Name of the achievement
   * @param {string} description - Achievement description
   * @returns {Promise<Object>} Function result
   */
  async sendAchievementNotification(userId, achievementName, description) {
    const title = 'Achievement Unlocked! 🏆';
    const body = `Congratulations! You've earned: ${achievementName}`;
    
    const notificationData = {
      type: 'achievement',
      achievementName,
      description,
      action: 'view_achievements',
    };

    return await this.sendCustomNotification(userId, title, body, notificationData, 'achievement');
  }

  /**
   * Send a leaderboard update notification
   * @param {string} userId - Target user ID
   * @param {string} userName - User's display name
   * @param {number} newRank - User's new rank
   * @param {number} previousRank - User's previous rank
   * @returns {Promise<Object>} Function result
   */
  async sendLeaderboardUpdateNotification(userId, userName, newRank, previousRank) {
    let title, body;
    
    if (newRank < previousRank) {
      title = 'Ranking Up! 📈';
      body = `Great job ${userName}! You moved from #${previousRank} to #${newRank} on the leaderboard!`;
    } else if (newRank > previousRank) {
      title = 'Ranking Update';
      body = `Your rank changed from #${previousRank} to #${newRank}. Keep playing to improve!`;
    } else {
      return null; // No change in rank
    }
    
    const notificationData = {
      type: 'leaderboard_update',
      newRank,
      previousRank,
      action: 'view_leaderboard',
    };

    return await this.sendCustomNotification(userId, title, body, notificationData, 'leaderboard_update');
  }

  /**
   * Send a maintenance notification
   * @param {Array<string>} userIds - Array of target user IDs
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {string} maintenanceType - Type of maintenance (scheduled/emergency)
   * @param {string} estimatedDuration - Estimated duration of maintenance
   * @returns {Promise<Object>} Function result
   */
  async sendMaintenanceNotification(userIds, title, body, maintenanceType = 'scheduled', estimatedDuration = null) {
    const notificationData = {
      type: 'maintenance',
      maintenanceType,
      estimatedDuration,
      action: 'view_status',
    };

    if (estimatedDuration) {
      notificationData.estimatedDuration = estimatedDuration;
    }

    return await this.sendBulkNotifications(userIds, title, body, notificationData, 'maintenance');
  }

  /**
   * Send a promotional notification
   * @param {Array<string>} userIds - Array of target user IDs
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {string} promoCode - Promotional code if applicable
   * @param {string} expiryDate - Expiry date of the promotion
   * @returns {Promise<Object>} Function result
   */
  async sendPromotionalNotification(userIds, title, body, promoCode = null, expiryDate = null) {
    const notificationData = {
      type: 'promotional',
      action: 'view_promotion',
    };

    if (promoCode) {
      notificationData.promoCode = promoCode;
    }
    if (expiryDate) {
      notificationData.expiryDate = expiryDate;
    }

    return await this.sendBulkNotifications(userIds, title, body, notificationData, 'promotional');
  }

  /**
   * Get user's notification history from Firestore
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of notifications to retrieve
   * @returns {Promise<Array>} Array of notification documents
   */
  async getUserNotificationHistory(userId, limit = 50) {
    try {
      const notificationsRef = collection(this.firestore, 'notifications');
      const q = query(
        notificationsRef,
        where('toUid', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limit)
      );
      
      const snapshot = await getDocs(q);
      const notifications = [];
      
      snapshot.forEach(doc => {
        notifications.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      
      return notifications;
    } catch (error) {
      console.error('Error getting user notification history:', error);
      throw error;
    }
  }

  /**
   * Mark a notification as read in Firestore
   * @param {string} notificationId - Notification document ID
   * @returns {Promise<void>}
   */
  async markNotificationAsRead(notificationId) {
    try {
      const notificationRef = doc(this.firestore, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true,
        readAt: new Date(),
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all user notifications as read
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async markAllNotificationsAsRead(userId) {
    try {
      const notificationsRef = collection(this.firestore, 'notifications');
      const q = query(
        notificationsRef,
        where('toUid', '==', userId),
        where('read', '==', false)
      );
      
      const snapshot = await getDocs(q);
      const batch = this.firestore.batch();
      
      snapshot.forEach(doc => {
        const notificationRef = doc.ref;
        batch.update(notificationRef, {
          read: true,
          readAt: new Date(),
        });
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete a notification from Firestore
   * @param {string} notificationId - Notification document ID
   * @returns {Promise<void>}
   */
  async deleteNotification(notificationId) {
    try {
      const notificationRef = doc(this.firestore, 'notifications', notificationId);
      await notificationRef.delete();
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of unread notifications
   */
  async getUnreadNotificationCount(userId) {
    try {
      const notificationsRef = collection(this.firestore, 'notifications');
      const q = query(
        notificationsRef,
        where('toUid', '==', userId),
        where('read', '==', false)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('Error getting unread notification count:', error);
      throw error;
    }
  }

  /**
   * Test the notification service by sending a test notification
   * @param {string} userId - Target user ID (defaults to current user)
   * @returns {Promise<Object>} Function result
   */
  async sendTestNotification(userId = null) {
    const targetUserId = userId || this.auth.currentUser?.uid;
    
    if (!targetUserId) {
      throw new Error('No user ID provided and no current user authenticated');
    }

    const title = 'Test Notification 🔔';
    const body = 'This is a test notification to verify the service is working correctly.';
    
    const notificationData = {
      type: 'test',
      action: 'test_action',
      timestamp: new Date().toISOString(),
    };

    return await this.sendCustomNotification(targetUserId, title, body, notificationData, 'test');
  }
}

export default PushNotificationService;

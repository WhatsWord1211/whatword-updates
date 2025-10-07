import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, collection, query, where, orderBy, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import pushNotificationService from './pushNotificationService';

/**
 * NotificationService - Wrapper around pushNotificationService with Firestore integration
 * 
 * This service provides:
 * - Cross-platform push notifications via Expo (iOS + Android)
 * - In-app notification display via Firestore
 * - Notification history and management
 * 
 * Architecture:
 * - pushNotificationService: Handles actual push notification delivery using Expo
 * - notificationService (this file): Provides high-level API and Firestore integration
 */

// Note: Notification handler is configured in pushNotificationService.js
// This prevents conflicts between multiple handlers

class NotificationService {
  constructor() {
    this.currentUserId = null;
    this.notificationListeners = [];
    this.foregroundListener = null;
    this.responseListener = null;
  }

  /**
   * Initialize the notification service
   * Delegates to pushNotificationService for actual push notification setup
   */
  async initialize(userId = null) {
    try {
      console.log('NotificationService: Initializing...');
      
      if (userId) {
        this.currentUserId = userId;
        
        // Initialize push notifications via pushNotificationService
        await pushNotificationService.initialize(userId);
      }
      
      // Set up notification reception listeners
      this.setupNotificationListeners();
      
      console.log('NotificationService: Initialized successfully');
      return true;
    } catch (error) {
      console.error('NotificationService: Initialization failed:', error);
      return false;
    }
  }

  /**
   * Set the current user ID
   */
  setCurrentUser(userId) {
    this.currentUserId = userId;
    pushNotificationService.currentUserId = userId;
  }

  /**
   * Set up notification listeners for when app is in foreground
   */
  setupNotificationListeners() {
    // Clean up existing listeners
    this.cleanup();

    // Listener for notifications received while app is running
    this.foregroundListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('NotificationService: Foreground notification received:', notification);
    });

    // Listener for when user taps on notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('NotificationService: Notification tapped:', response);
      const data = response.notification.request.content.data;
      
      // Handle different notification types
      this.handleNotificationTap(data);
    });
  }

  /**
   * Handle notification tap based on type
   */
  handleNotificationTap(data) {
    console.log('NotificationService: Handling notification tap:', data);
    
    // Different handlers based on notification type
    switch (data.type) {
      case 'friend_request':
      case 'friend_request_accepted':
      case 'friend_request_declined':
        console.log('NotificationService: Friend notification tapped');
        // Navigation would be handled by the app's navigation system
        break;
        
      case 'game_challenge':
      case 'challenge':
        console.log('NotificationService: Challenge notification tapped');
        break;
        
      case 'game_started':
      case 'game_completed':
        console.log('NotificationService: Game notification tapped');
        break;
        
      default:
        console.log('NotificationService: Unknown notification type:', data.type);
    }
  }

  /**
   * Clean up listeners - Industry standard with error handling
   */
  cleanup() {
    try {
      // Clean up Expo notification listeners
      if (this.foregroundListener) {
        this.foregroundListener.remove();
        this.foregroundListener = null;
      }
      if (this.responseListener) {
        this.responseListener.remove();
        this.responseListener = null;
      }
      
      // Clean up Firestore listeners with error handling
      this.notificationListeners.forEach(unsubscribe => {
        try {
          if (unsubscribe && typeof unsubscribe === 'function') {
            unsubscribe();
          }
        } catch (error) {
          console.warn('NotificationService: Error cleaning up Firestore listener:', error);
        }
      });
      this.notificationListeners = [];
    } catch (error) {
      console.error('NotificationService: Error during cleanup:', error);
    }
  }

  // ============================================================================
  // PUSH NOTIFICATION METHODS - Delegate to pushNotificationService
  // ============================================================================

  /**
   * Send push notification
   */
  async sendPushNotification(toUserId, title, body, data = {}) {
    try {
      return await pushNotificationService.sendPushNotification(toUserId, title, body, data);
    } catch (error) {
      console.error('NotificationService: Failed to send push notification:', error);
      return null;
    }
  }

  /**
   * Send friend request notification
   */
  async sendFriendRequestNotification(toUserId, senderName) {
    return pushNotificationService.sendFriendRequestNotification(toUserId, senderName);
  }

  /**
   * Send friend request accepted notification
   */
  async sendFriendRequestAcceptedNotification(toUserId, senderName) {
    return pushNotificationService.sendFriendRequestAcceptedNotification(toUserId, senderName);
  }

  /**
   * Send friend request declined notification
   */
  async sendFriendRequestDeclinedNotification(toUserId, senderName) {
    return pushNotificationService.sendFriendRequestDeclinedNotification(toUserId, senderName);
  }

  /**
   * Send challenge notification
   */
  async sendChallengeNotification(toUserId, senderName, challengeId, wordLength) {
    return pushNotificationService.sendGameChallengeNotification(toUserId, senderName, wordLength);
  }

  /**
   * Send game started notification
   */
  async sendGameStartedNotification(toUserId, playerName, wordLength) {
    return pushNotificationService.sendGameStartedNotification(toUserId, playerName, wordLength);
  }

  /**
   * Send game completed notification
   */
  async sendGameCompletedNotification(toUserId, playerName, won) {
    return pushNotificationService.sendGameCompletedNotification(toUserId, playerName, won);
  }

  /**
   * Send game move notification
   */
  async sendGameMoveNotification(toUserId, playerName, gameId) {
    return pushNotificationService.sendGameMoveNotification(toUserId, playerName, gameId);
  }

  // ============================================================================
  // FIRESTORE IN-APP NOTIFICATIONS
  // ============================================================================

  /**
   * Save notification to Firestore for in-app display
   */
  async saveNotificationToFirestore(toUserId, title, body, data = {}) {
    try {
      const notificationId = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await setDoc(doc(db, 'notifications', notificationId), {
        toUserId,
        toUid: toUserId,
        fromUid: this.currentUserId || 'system',
        title,
        body,
        data,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'in_app'
      });
      return notificationId;
    } catch (error) {
      console.error('NotificationService: Failed to save notification to Firestore:', error);
      return null;
    }
  }

  /**
   * Listen to user's notifications from Firestore
   */
  listenToUserNotifications(userId, callback) {
    try {
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('toUid', '==', userId),
        orderBy('timestamp', 'desc')
      );

      const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const notifications = [];
        snapshot.forEach((doc) => {
          notifications.push({
            id: doc.id,
            ...doc.data()
          });
        });
        callback(notifications);
      }, (error) => {
        console.error('NotificationService: Error listening to notifications:', error);
        callback([]);
      });

      this.notificationListeners.push(unsubscribe);
      return unsubscribe;
    } catch (error) {
      console.error('NotificationService: Failed to set up notification listener:', error);
      return () => {};
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId) {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
        readAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to mark notification as read:', error);
      return false;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId) {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to delete notification:', error);
      return false;
    }
  }

  /**
   * Show local notification (for testing or in-app alerts)
   */
  async showLocalNotification(title, body, data = {}) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
      });
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to show local notification:', error);
      return false;
    }
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications() {
    try {
      await Notifications.dismissAllNotificationsAsync();
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to clear notifications:', error);
      return false;
    }
  }

  /**
   * Get badge count
   */
  async getBadgeCount() {
    try {
      const count = await Notifications.getBadgeCountAsync();
      return count;
    } catch (error) {
      console.error('NotificationService: Failed to get badge count:', error);
      return 0;
    }
  }

  /**
   * Set badge count
   */
  async setBadgeCount(count) {
    try {
      await Notifications.setBadgeCountAsync(count);
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to set badge count:', error);
      return false;
    }
  }

  /**
   * Check if notifications are enabled
   */
  async areNotificationsEnabled() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('NotificationService: Failed to check notification status:', error);
      return false;
    }
  }

  /**
   * Request notification permissions
   */
  async requestPermissions() {
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
        },
        android: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      return status === 'granted';
    } catch (error) {
      console.error('NotificationService: Failed to request permissions:', error);
      return false;
    }
  }

  // ============================================================================
  // DELEGATION TO PUSH NOTIFICATION SERVICE
  // ============================================================================

  /**
   * Get current push token
   */
  getExpoPushToken() {
    return pushNotificationService.expoPushToken;
  }

  /**
   * Check if push notifications are initialized
   */
  isPushNotificationInitialized() {
    return pushNotificationService.isInitialized;
  }

  /**
   * Get push notification service status
   */
  getPushNotificationStatus() {
    return {
      isInitialized: pushNotificationService.isInitialized,
      hasToken: !!pushNotificationService.expoPushToken,
      token: pushNotificationService.expoPushToken,
      platform: Platform.OS,
    };
  }
}

// Export the class for instantiation
export default NotificationService;

// Create a lazy-loaded singleton instance
let _instance = null;

export const getNotificationService = () => {
  if (!_instance) {
    _instance = new NotificationService();
  }
  return _instance;
};


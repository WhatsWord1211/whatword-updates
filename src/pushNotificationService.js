import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert, InteractionManager } from 'react-native';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import settingsService from './settingsService';
import logger from './logger';

// Configure notification behavior for background and foreground
// Industry standard: Always show notifications - filtering should be done server-side
Notifications.setNotificationHandler({
  handleNotification: async () => {
    // Always allow notifications to display
    // User settings are respected when SENDING, not when RECEIVING
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

class PushNotificationService {
  constructor() {
    this.expoPushToken = null;
    this.notificationListener = null;
    this.responseListener = null;
    this.isInitialized = false;
    this.isInitializing = false;
    this.currentUserId = null;
    
    // Queue and throttling
    this.notificationQueue = [];
    this.isProcessingQueue = false;
    this.lastNotificationTime = 0;
    this.minNotificationInterval = 1000; // 1 second between notifications
    
    // Token refresh tracking
    this.tokenRefreshPromise = null;
    this.lastTokenRefresh = 0;
    this.tokenRefreshInterval = 24 * 60 * 60 * 1000; // 24 hours
    
    // Request timeout
    this.requestTimeout = 5000; // 5 seconds
  }

  /**
   * Initialize push notifications and get Expo push token
   */
  async initialize(userId = null) {
    // If already initialized but a userId is provided, ensure we associate and persist token
    if (this.isInitialized) {
      if (userId && userId !== this.currentUserId) {
        this.currentUserId = userId;
        if (this.expoPushToken) {
          try {
            await this.savePushTokenToFirestore(userId, this.expoPushToken);
          } catch (_) {}
        }
      }
      return this.expoPushToken;
    }
    
    if (this.isInitializing) {
      return this.tokenRefreshPromise;
    }
    
    this.isInitializing = true;
    
    try {
      // Set current user ID if provided
      if (userId) {
        this.currentUserId = userId;
      }
      
      // Register for push notifications
      const token = await this.registerForPushNotificationsAsync();
      if (token) {
        this.expoPushToken = token;
        this.isInitialized = true;
        
        // Save token to Firestore if we have a user ID
        if (this.currentUserId) {
          await this.savePushTokenToFirestore(this.currentUserId, token);
        }
        
        // Set up listeners asynchronously
        this.setupNotificationListeners();

        return token;
      }
      
      return null;
    } catch (error) {
      logger.error('PushNotificationService: Failed to initialize:', error);
      return null;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Register for push notifications and get Expo push token
   */
  async registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
      // Create notification channels for Android
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        showBadge: true,
        enableLights: true,
        enableVibrate: true,
        lightColor: '#8B5CF6',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('game_updates', {
        name: 'Game Updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8B5CF6',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync('friend_requests', {
        name: 'Friend Requests',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8B5CF6',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });
    }

    if (Device.isDevice) {
      // Check current permissions
      const { status: existingStatus} = await Notifications.getPermissionsAsync();
      
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        // Request permissions with comprehensive options
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowAnnouncements: true,
            allowCriticalAlerts: false,
            provideAppNotificationSettings: true,
            allowProvisional: false,
          },
          android: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowVibrate: true,
            allowLights: true,
          },
        });
        
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        return null;
      }
      
      try {
        // Get Expo project ID from app.json
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? 
                         Constants.easConfig?.projectId ?? 
                         'b189d504-5441-4ee4-977f-2ad58d77659d';
        
        // Generate Expo push token with projectId (required for managed projects)
        token = (await Notifications.getExpoPushTokenAsync({
          projectId: projectId
        })).data;
      } catch (error) {
        logger.error('PushNotificationService: Failed to get Expo push token:', error);
        return null;
      }
    } else {
      return null;
    }

    return token;
  }

  /**
   * Refresh push token on app start and save to Firestore if changed
   */
  async refreshTokenIfNeeded(userId) {
    if (!userId) return null;

    const now = Date.now();
    if (this.tokenRefreshPromise) return this.tokenRefreshPromise;
    if (now - this.lastTokenRefresh < this.tokenRefreshInterval && this.expoPushToken) {
      return this.expoPushToken;
    }

    this.tokenRefreshPromise = this._performTokenRefresh(userId);
    return this.tokenRefreshPromise;
  }

  async _performTokenRefresh(userId) {
    try {
      const newToken = await this.registerForPushNotificationsAsync();
      if (newToken && newToken !== this.expoPushToken) {
        this.expoPushToken = newToken;
        this.lastTokenRefresh = Date.now();
        this.savePushTokenToFirestore(userId, newToken).catch(error => {
          logger.error('PushNotificationService: Failed to save refreshed token:', error);
        });
        return newToken;
      } else if (newToken) {
        this.lastTokenRefresh = Date.now();
        return newToken;
      }
      return null;
    } catch (error) {
      logger.error('PushNotificationService: Token refresh failed:', error);
      return null;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  /**
   * Save push token to user's Firestore document
   */
  async savePushTokenToFirestore(userId, token) {
    try {
      const isExpoToken = typeof token === 'string' && token.startsWith('ExponentPushToken');
      await setDoc(doc(db, 'users', userId), {
        expoPushToken: isExpoToken ? token : null,
        pushTokenUpdatedAt: new Date().toISOString(),
      }, { merge: true });
      return true;
    } catch (error) {
      logger.error('PushNotificationService: Failed to save push token:', error);
      return false;
    }
  }

  /**
   * Get user's push token from Firestore
   */
  async getUserPushToken(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const expoPushToken = userData.expoPushToken;

        // Only return a valid Expo token for Expo push service
        if (typeof expoPushToken === 'string' && expoPushToken.startsWith('ExponentPushToken')) {
          return expoPushToken;
        }
        return null;
      }
      return null;
    } catch (error) {
      logger.error('PushNotificationService: Failed to get user push token:', error);
      return null;
    }
  }

  /**
   * Refresh push token for current user
   */
  async refreshTokenForCurrentUser() {
    if (!this.currentUserId) return null;
    
    try {
      const newToken = await this.registerForPushNotificationsAsync();
      if (newToken) {
        await this.savePushTokenToFirestore(this.currentUserId, newToken);
        this.expoPushToken = newToken;
        return newToken;
      }
      return null;
    } catch (error) {
      logger.error('PushNotificationService: Failed to refresh token for current user:', error);
      return null;
    }
  }

  /**
   * Send push notification using Expo's push notification service (non-blocking)
   */
  async sendPushNotification(toUserId, title, body, data = {}) {
    // Auto-initialize if not already initialized
    if (!this.isInitialized && !this.isInitializing) {
      try {
        await this.initialize();
      } catch (error) {
        logger.error('PushNotificationService: Auto-initialization failed:', error);
      }
    }
    
    // Respect sender's notification settings
    try {
      const settings = await settingsService.initialize();
      if (!settings.pushNotifications) return Promise.resolve(null);
      if (settings.quietHoursEnabled && settingsService.isQuietHours()) return Promise.resolve(null);
      
      const type = data?.type;
      const typeAllowed = (
        (type === 'friend_request' || type === 'friend_request_accepted' || type === 'friend_request_declined') ? settings.friendRequestNotifications :
        (type === 'challenge' || type === 'game_challenge' || type === 'game_started' || type === 'game_completed') ? settings.gameChallengeNotifications :
        (type === 'achievement') ? settings.achievementNotifications :
        (type === 'reminder') ? settings.reminderNotifications :
        true
      );
      if (!typeAllowed) return Promise.resolve(null);
    } catch (_) {}

    // Create a unique key for deduplication
    const notificationKey = `${toUserId}_${title}_${body}_${JSON.stringify(data)}`;
    
    // Check if we've already sent this notification recently (within 5 minutes)
    const now = Date.now();
    const recentNotifications = this.notificationQueue.filter(n => 
      n.notificationKey === notificationKey && 
      (now - n.timestamp) < 5 * 60 * 1000 // 5 minutes
    );
    
    if (recentNotifications.length > 0) {
      return Promise.resolve(null);
    }
    
    // Add to queue for throttling
    return new Promise((resolve) => {
      this.notificationQueue.push({
        toUserId,
        title,
        body,
        data,
        resolve,
        timestamp: now,
        notificationKey
      });
      
      this._processNotificationQueue();
    });
  }

  /**
   * Process notification queue with throttling (non-blocking)
   */
  async _processNotificationQueue() {
    if (this.isProcessingQueue || this.notificationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    // Process one notification at a time to avoid blocking
    const processNext = async () => {
      if (this.notificationQueue.length === 0) {
        this.isProcessingQueue = false;
        return;
      }

      const now = Date.now();
      const timeSinceLastNotification = now - this.lastNotificationTime;
      
      // Throttle notifications
      if (timeSinceLastNotification < this.minNotificationInterval) {
        const delay = this.minNotificationInterval - timeSinceLastNotification;
        setTimeout(processNext, delay);
        return;
      }

      const notification = this.notificationQueue.shift();
      if (notification) {
        try {
          await this._sendSingleNotification(notification);
        } catch (error) {
          logger.error('PushNotificationService: Error processing notification:', error);
          notification.resolve(null);
        }
      }

      // Process next notification after a small delay to prevent blocking
      setTimeout(processNext, 10);
    };

    processNext();
  }

  /**
   * Send a single notification (non-blocking with timeout)
   */
  async _sendSingleNotification({ toUserId, title, body, data, resolve }) {
    try {
      // Get the recipient's push token
      const pushToken = await this.getUserPushToken(toUserId);
      const isExpoToken = typeof pushToken === 'string' && pushToken.startsWith('ExponentPushToken');

      if (!pushToken || !isExpoToken) {
        // No valid token - try to refresh if it's the current user
        if (toUserId === this.currentUserId) {
          try {
            await this.refreshTokenForCurrentUser();
          } catch (refreshError) {
            logger.error('PushNotificationService: Failed to refresh token:', refreshError);
          }
        }
        
        // Fallback to Firestore for in-app notifications
        await this.saveNotificationToFirestore(toUserId, title, body, data);
        resolve(null);
        return;
      }

      // Determine appropriate channel based on notification type
      let channelId = 'default';
      if (data.type === 'friend_request' || data.type === 'friend_request_accepted' || data.type === 'friend_request_declined') {
        channelId = 'friend_requests';
      } else if (data.type === 'game_challenge' || data.type === 'challenge' || data.type === 'game_started' || data.type === 'game_completed') {
        channelId = 'game_updates';
      }
      
      try {
        const message = {
          to: pushToken,
          sound: 'default',
          title: title,
          body: body,
          data: data,
          channelId: channelId,
          priority: 'high', // Android delivery priority
          badge: undefined,
          ttl: undefined,
        };

        // Industry standard: Add explicit timeout to Expo API fetch
        const fetchWithTimeout = Promise.race([
          fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Expo API fetch timeout')), 10000)
          )
        ]);

        const response = await fetchWithTimeout;
        const result = await response.json();

        if (result?.data?.status === 'ok' && result?.data?.id) {
          const ticketId = result.data.id;
          // Fire-and-forget receipt check
          this._checkExpoReceipt(ticketId).catch(() => {});
          resolve(ticketId);
        } else if (Array.isArray(result?.data) && result.data[0]?.status === 'ok') {
          const ticketId = result.data[0].id;
          this._checkExpoReceipt(ticketId).catch(() => {});
          resolve(ticketId);
        } else {
          logger.error('PushNotificationService: Expo push failed:', result);
          throw new Error(`Expo push failed`);
        }

      } catch (expoError) {
        logger.error('PushNotificationService: Failed to send push notification:', expoError.message);
        // Fallback to Firestore notification
        await this.saveNotificationToFirestore(toUserId, title, body, data);
        resolve('firestore_notification');
      }

      this.lastNotificationTime = Date.now();
    } catch (error) {
      logger.error('PushNotificationService: Error sending push notification:', error);
      // Fallback to Firestore notification
      this.saveNotificationToFirestore(toUserId, title, body, data).catch(error => {
        logger.error('PushNotificationService: Failed to save to Firestore:', error);
      });
      resolve(null);
    }
  }

  /**
   * Check Expo push receipt for a given ticket id (non-blocking diagnostics)
   */
  async _checkExpoReceipt(ticketId) {
    try {
      if (!ticketId) return;
      const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: [ticketId] })
      });
      const result = await response.json();
      if (result?.data?.[ticketId]?.status === 'error') {
        logger.error('PushNotificationService: Push receipt error:', result.data[ticketId]);
      }
    } catch (err) {
      // Silent failure - receipt check is diagnostic only
    }
  }

  // Firebase-related methods removed - using Expo push service directly

  /**
   * Save notification to Firestore for in-app display
   */
  async saveNotificationToFirestore(toUserId, title, body, data = {}) {
    try {
      const notificationId = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await setDoc(doc(db, 'notifications', notificationId), {
        toUserId,
        toUid: toUserId, // compatibility with existing queries
        fromUid: this.currentUserId || 'system', // Required by Firestore rules
        title,
        body,
        data,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'in_app'
      });
      return notificationId;
    } catch (error) {
      logger.error('PushNotificationService: Failed to save notification to Firestore:', error);
      return null;
    }
  }

  /**
   * Send game challenge notification
   */
  async sendGameChallengeNotification(toUserId, challengerName, wordLength) {
    const title = '🎯 New Challenge!';
    const body = `${challengerName} challenged you to a ${wordLength}-letter word game!`;
    
    return this.sendPushNotification(toUserId, title, body, {
      type: 'challenge',
      challengerName,
      wordLength,
      timestamp: new Date().toISOString(),
      action: 'view_challenge'
    });
  }

  /**
   * Send friend request notification
   */
  async sendFriendRequestNotification(toUserId, senderName) {
    const title = '👋 Friend Request';
    const body = `${senderName} wants to be friends with you!`;
    
    return this.sendPushNotification(toUserId, title, body, {
      type: 'friend_request',
      senderName,
      timestamp: new Date().toISOString(),
      action: 'view_friend_request'
    });
  }

  /**
   * Send friend request accepted notification
   */
  async sendFriendRequestAcceptedNotification(toUserId, senderName) {
    const title = '✅ Friend Added!';
    const body = `${senderName} accepted your friend request!`;
    
    return this.sendPushNotification(toUserId, title, body, {
      type: 'friend_request_accepted',
      senderName,
      timestamp: new Date().toISOString(),
      action: 'view_friends'
    });
  }

  /**
   * Send friend request declined notification
   */
  async sendFriendRequestDeclinedNotification(toUserId, senderName) {
    const title = '👋 Friend Request';
    const body = `${senderName} declined your friend request`;
    
    return this.sendPushNotification(toUserId, title, body, {
      type: 'friend_request_declined',
      senderName,
      timestamp: new Date().toISOString(),
      action: 'view_friends'
    });
  }

  /**
   * Send game started notification
   */
  async sendGameStartedNotification(toUserId, playerName, wordLength) {
    const title = '🎮 Game Started!';
    const body = `Your ${wordLength}-letter word game with ${playerName} has begun!`;
    
    return this.sendPushNotification(toUserId, title, body, {
      type: 'game_started',
      playerName,
      wordLength,
      timestamp: new Date().toISOString(),
      action: 'view_game'
    });
  }

  /**
   * Send game completed notification
   */
  async sendGameCompletedNotification(toUserId, playerName, won) {
    const title = won ? '🏆 You Won!' : '💔 Game Over';
    const body = won ? 
      `Congratulations! You beat ${playerName}!` : 
      `${playerName} solved the word first. Better luck next time!`;
    
    return this.sendPushNotification(toUserId, title, body, {
      type: 'game_completed',
      playerName,
      won,
      timestamp: new Date().toISOString(),
      action: 'view_results'
    });
  }

  /**
   * Set up notification listeners with safe navigation
   */
  setupNotificationListeners() {
    // Clean up existing listeners first
    this.cleanup();

    // Listener for notifications received while app is running
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      // Notification received - handler configured above will determine display
    });

    // Listener for when user taps on notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      
      InteractionManager.runAfterInteractions(() => {
        try {
          // Handle different notification types
          if (data.type === 'challenge' || data.type === 'game_challenge') {
            this.handleChallengeNotification(data);
          } else if (data.type === 'friend_request') {
            this.handleFriendRequestNotification(data);
          } else if (data.type === 'game_completed' || data.type === 'game_started') {
            this.handleGameNotification(data);
          }
        } catch (error) {
          logger.error('PushNotificationService: Error handling notification response:', error);
        }
      });
    });
  }

  /**
   * Handle challenge notification tap
   */
  handleChallengeNotification(data) {
    // Navigation to PendingChallenges handled by app's navigation system
  }

  handleFriendRequestNotification(data) {
    // Navigation to FriendRequests handled by app's navigation system
  }

  handleGameNotification(data) {
    // Navigation to Game handled by app's navigation system
  }

  /**
   * Clean up listeners and clear queue
   */
  cleanup() {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
    
    // Clear notification queue
    this.notificationQueue = [];
    this.isProcessingQueue = false;
  }

}

// Export singleton instance
const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
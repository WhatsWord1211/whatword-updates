import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert, InteractionManager } from 'react-native';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Configure notification behavior for background and foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log('PushNotificationService: Notification received:', notification);
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // iOS-specific: Ensure notifications show in background
      shouldShowBanner: true,
      shouldShowList: true,
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
  async initialize() {
    // Prevent multiple simultaneous initializations
    if (this.isInitialized) {
      return this.expoPushToken;
    }
    
    if (this.isInitializing) {
      return this.tokenRefreshPromise;
    }
    
    this.isInitializing = true;
    
    try {
      console.log('PushNotificationService: Initializing...');
      
      // Register for push notifications
      const token = await this.registerForPushNotificationsAsync();
      if (token) {
        this.expoPushToken = token;
        this.isInitialized = true;
        console.log('PushNotificationService: Expo push token obtained:', token);
        
        // Set up listeners asynchronously
        this.setupNotificationListeners();
        
        // Reset app badge on successful initialization
        try {
          await Notifications.setBadgeCountAsync(0);
        } catch (_) {}

        return token;
      }
      
      console.log('PushNotificationService: No push token obtained');
      return null;
    } catch (error) {
      console.error('PushNotificationService: Failed to initialize:', error);
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
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('PushNotificationService: Current permission status:', existingStatus);
      
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        console.log('PushNotificationService: Requesting notification permissions...');
        
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
        console.log('PushNotificationService: Permission request result:', status);
        
        if (status === 'granted') {
          console.log('PushNotificationService: ✅ Notification permissions granted');
        } else if (status === 'denied') {
          console.log('PushNotificationService: ❌ Notification permissions denied');
        } else {
          console.log('PushNotificationService: ⚠️ Notification permissions undetermined');
        }
      } else {
        console.log('PushNotificationService: ✅ Notification permissions already granted');
      }
      
      if (finalStatus !== 'granted') {
        console.log('PushNotificationService: Cannot proceed without notification permissions');
        return null;
      }
      
      try {
        // Try multiple ways to get the project ID
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? 
                         Constants.easConfig?.projectId ?? 
                         'b189d504-5441-4ee4-977f-2ad58d77659d';
        
        console.log('PushNotificationService: Constants.expoConfig:', Constants.expoConfig);
        console.log('PushNotificationService: Constants.easConfig:', Constants.easConfig);
        console.log('PushNotificationService: Resolved projectId:', projectId);
        
        if (!projectId) {
          throw new Error('Project ID not found');
        }
        
        token = (await Notifications.getExpoPushTokenAsync({
          projectId,
        })).data;
        console.log('PushNotificationService: Got Expo push token:', token);
        console.log('PushNotificationService: Project ID used:', projectId);
      } catch (error) {
        console.error('PushNotificationService: Failed to get Expo push token:', error);
        return null;
      }
    } else {
      console.log('PushNotificationService: Must use physical device for Push Notifications');
      return null;
    }

    return token;
  }

  /**
   * Refresh push token on app start and save to Firestore if changed
   */
  async refreshTokenIfNeeded(userId) {
    if (!userId) {
      console.log('PushNotificationService: No userId provided for token refresh');
      return null;
    }

    // Check if we need to refresh the token
    const now = Date.now();
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    if (now - this.lastTokenRefresh < this.tokenRefreshInterval && this.expoPushToken) {
      console.log('PushNotificationService: Token refresh not needed yet');
      return this.expoPushToken;
    }

    this.tokenRefreshPromise = this._performTokenRefresh(userId);
    return this.tokenRefreshPromise;
  }

  async _performTokenRefresh(userId) {
    try {
      console.log('PushNotificationService: Refreshing push token...');
      
      const newToken = await this.registerForPushNotificationsAsync();
      if (newToken && newToken !== this.expoPushToken) {
        console.log('PushNotificationService: Token changed, updating...');
        this.expoPushToken = newToken;
        this.lastTokenRefresh = Date.now();
        
        // Save to Firestore asynchronously
        this.savePushTokenToFirestore(userId, newToken).catch(error => {
          console.error('PushNotificationService: Failed to save refreshed token:', error);
        });
        
        return newToken;
      } else if (newToken) {
        console.log('PushNotificationService: Token unchanged');
        this.lastTokenRefresh = Date.now();
        return newToken;
      }
      
      return null;
    } catch (error) {
      console.error('PushNotificationService: Token refresh failed:', error);
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
      await setDoc(doc(db, 'users', userId), {
        expoPushToken: token,
        pushToken: token, // Also save as pushToken for compatibility
        pushTokenUpdatedAt: new Date().toISOString(),
      }, { merge: true });
      console.log('PushNotificationService: Saved push token to Firestore');
      return true;
    } catch (error) {
      console.error('PushNotificationService: Failed to save push token:', error);
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
        return userDoc.data().expoPushToken || userDoc.data().pushToken || null;
      }
      return null;
    } catch (error) {
      console.error('PushNotificationService: Failed to get user push token:', error);
      return null;
    }
  }

  /**
   * Send push notification using Expo's push notification service (non-blocking)
   */
  async sendPushNotification(toUserId, title, body, data = {}) {
    console.log('PushNotificationService: sendPushNotification called:', { toUserId, title, body, data });
    
    // Create a unique key for deduplication
    const notificationKey = `${toUserId}_${title}_${body}_${JSON.stringify(data)}`;
    
    // Check if we've already sent this notification recently (within 5 minutes)
    const now = Date.now();
    const recentNotifications = this.notificationQueue.filter(n => 
      n.notificationKey === notificationKey && 
      (now - n.timestamp) < 5 * 60 * 1000 // 5 minutes
    );
    
    if (recentNotifications.length > 0) {
      console.log('PushNotificationService: Duplicate notification detected, skipping:', notificationKey);
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
      
      console.log('PushNotificationService: Added to queue. Queue length:', this.notificationQueue.length);
      
      // Process queue asynchronously
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
          console.error('PushNotificationService: Error processing notification:', error);
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
      console.log('PushNotificationService: _sendSingleNotification called for user:', toUserId);
      
      // Get the recipient's push token
      const pushToken = await this.getUserPushToken(toUserId);
      console.log('PushNotificationService: Retrieved push token:', pushToken ? 'Found' : 'Not found');
      
      if (!pushToken) {
        console.log('PushNotificationService: No push token found for user:', toUserId);
        // Still save to Firestore for in-app notifications
        await this.saveNotificationToFirestore(toUserId, title, body, data);
        resolve(null);
        return;
      }

      // Determine appropriate channel based on notification type
      let channelId = 'default';
      if (data.type === 'friend_request' || data.type === 'friend_request_accepted') {
        channelId = 'friend_requests';
      } else if (data.type === 'game_challenge' || data.type === 'game_started' || data.type === 'game_completed' || data.type === 'game_move') {
        channelId = 'game_updates';
      }

      // Send push notification via Expo's service with timeout
      const message = {
        to: pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: data,
        priority: 'high',
        channelId: channelId,
        // Do not force a badge increment on each push; let the app manage badges
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      try {
        console.log('PushNotificationService: Sending message to Expo:', JSON.stringify(message, null, 2));
        
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        console.log('PushNotificationService: Expo response status:', response.status);
        
        const result = await response.json();
        console.log('PushNotificationService: Expo response:', JSON.stringify(result, null, 2));
        
        if (result.data && result.data[0] && result.data[0].status === 'ok') {
          console.log('PushNotificationService: Push notification sent successfully');
          // Do not duplicate successful pushes into Firestore to avoid flooding in-app notifications
          resolve(result.data[0].id);
        } else {
          console.error('PushNotificationService: Failed to send push notification:', result);
          // Fallback to Firestore notification
          this.saveNotificationToFirestore(toUserId, title, body, data).catch(error => {
            console.error('PushNotificationService: Failed to save to Firestore:', error);
          });
          resolve(null);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('PushNotificationService: Request timeout after', this.requestTimeout, 'ms');
        } else {
          console.error('PushNotificationService: Fetch error:', fetchError);
        }
        
        // Fallback to Firestore notification
        this.saveNotificationToFirestore(toUserId, title, body, data).catch(error => {
          console.error('PushNotificationService: Failed to save to Firestore:', error);
        });
        resolve(null);
      }

      this.lastNotificationTime = Date.now();
    } catch (error) {
      console.error('PushNotificationService: Error sending push notification:', error);
      // Fallback to Firestore notification
      this.saveNotificationToFirestore(toUserId, title, body, data).catch(error => {
        console.error('PushNotificationService: Failed to save to Firestore:', error);
      });
      resolve(null);
    }
  }

  /**
   * Save notification to Firestore for in-app display
   */
  async saveNotificationToFirestore(toUserId, title, body, data = {}) {
    try {
      const notificationId = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await setDoc(doc(db, 'notifications', notificationId), {
      toUserId,
        toUid: toUserId, // compatibility with existing queries
        title,
        body,
        data,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'in_app'
      });
      return notificationId;
    } catch (error) {
      console.error('PushNotificationService: Failed to save notification to Firestore:', error);
      return null;
    }
  }

  /**
   * Send game challenge notification
   */
  async sendGameChallengeNotification(toUserId, challengerName, wordLength) {
    const title = 'WhatWord';
    const body = 'You have a new game challenge!';
    
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
    const title = 'WhatWord';
    const body = 'You have a new friend request!';
    
    return this.sendPushNotification(toUserId, title, body, {
      type: 'friend_request',
      senderName,
      timestamp: new Date().toISOString(),
      action: 'view_friend_request'
    });
  }

  /**
   * Send game move notification
   */
  async sendGameMoveNotification(toUserId, playerName, gameId) {
    const title = '🎯 Your Turn!';
    const body = `${playerName} made a move in your game`;
    
    return this.sendPushNotification(toUserId, title, body, {
      type: 'game_move',
      playerName,
      gameId,
      timestamp: new Date().toISOString(),
      action: 'view_game'
    });
  }

  /**
   * Send game started notification
   */
  async sendGameStartedNotification(toUserId, playerName, wordLength) {
    const title = 'WhatWord';
    const body = 'Your game has started!';
    
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
    const title = 'WhatWord';
    const body = 'Your game is over! View results now.';
    
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
      console.log('PushNotificationService: Notification received:', notification);
    });

    // Listener for when user taps on notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('PushNotificationService: Notification response:', response);
      const data = response.notification.request.content.data;
      
      // Use InteractionManager to ensure safe navigation
      InteractionManager.runAfterInteractions(() => {
        try {
          // Handle different notification types
          if (data.type === 'challenge') {
            this.handleChallengeNotification(data);
          } else if (data.type === 'friend_request') {
            this.handleFriendRequestNotification(data);
          } else if (data.type === 'game_move' || data.type === 'game_completed') {
            this.handleGameNotification(data);
          } else {
            console.log('PushNotificationService: Unknown notification type:', data.type);
          }
        } catch (error) {
          console.error('PushNotificationService: Error handling notification response:', error);
        }
      });
    });
  }

  /**
   * Handle challenge notification tap
   */
  handleChallengeNotification(data) {
    console.log('PushNotificationService: Handling challenge notification:', data);
    
    // Use setTimeout to ensure navigation happens after current execution
    setTimeout(() => {
      try {
        // This would typically use navigation service
        // For now, we'll just log - navigation should be handled by the app's navigation system
        console.log('PushNotificationService: Should navigate to PendingChallenges');
      } catch (error) {
        console.error('PushNotificationService: Error handling challenge notification:', error);
      }
    }, 100);
  }

  /**
   * Handle friend request notification tap
   */
  handleFriendRequestNotification(data) {
    console.log('PushNotificationService: Handling friend request notification:', data);
    
    // Use setTimeout to ensure navigation happens after current execution
    setTimeout(() => {
      try {
        // This would typically use navigation service
        // For now, we'll just log - navigation should be handled by the app's navigation system
        console.log('PushNotificationService: Should navigate to FriendRequests');
      } catch (error) {
        console.error('PushNotificationService: Error handling friend request notification:', error);
      }
    }, 100);
  }

  /**
   * Handle game notification tap
   */
  handleGameNotification(data) {
    console.log('PushNotificationService: Handling game notification:', data);
    
    // Use setTimeout to ensure navigation happens after current execution
    setTimeout(() => {
      try {
        // This would typically use navigation service
        // For now, we'll just log - navigation should be handled by the app's navigation system
        console.log('PushNotificationService: Should navigate to Game with gameId:', data.gameId);
      } catch (error) {
        console.error('PushNotificationService: Error handling game notification:', error);
      }
    }, 100);
  }

  /**
   * Clean up listeners and clear queue
   */
  cleanup() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
      this.notificationListener = null;
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
      this.responseListener = null;
    }
    
    // Clear notification queue
    this.notificationQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Test function to debug push notifications
   */
  async testPushNotification(userId) {
    console.log('PushNotificationService: Testing push notification for user:', userId);
    
    // Test getting our own token
    const ourToken = this.expoPushToken;
    console.log('PushNotificationService: Our push token:', ourToken);
    
    // Test getting user's token
    const userToken = await this.getUserPushToken(userId);
    console.log('PushNotificationService: User push token:', userToken);
    
    // Test sending a notification to ourselves
    if (ourToken) {
      console.log('PushNotificationService: Sending test notification to ourselves...');
      return await this.sendPushNotification(userId, 'Test Notification', 'This is a test notification', { type: 'test' });
    } else {
      console.log('PushNotificationService: No push token available for testing');
      return null;
    }
  }

  /**
   * Clear notification queue
   */
  clearNotificationQueue() {
    console.log('PushNotificationService: Clearing notification queue');
    this.notificationQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Get queue status for debugging
   */
  getQueueStatus() {
    return {
      queueLength: this.notificationQueue.length,
      isProcessing: this.isProcessingQueue,
      lastNotificationTime: this.lastNotificationTime,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Test push notification (non-blocking)
   */
  async sendTestNotification() {
    if (!this.expoPushToken) {
      console.log('PushNotificationService: No push token available for test');
      return false;
    }

    try {
      // Use the non-blocking send method
      const result = await this.sendPushNotification(
        'test_user', // This would be the current user's ID in real usage
        '🧪 Test Notification',
        'This is a test push notification from WhatWord!',
        { type: 'test' }
      );
      
      console.log('PushNotificationService: Test notification queued:', result);
      return true;
    } catch (error) {
      console.error('PushNotificationService: Test notification failed:', error);
      return false;
    }
  }

}

// Export singleton instance
const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
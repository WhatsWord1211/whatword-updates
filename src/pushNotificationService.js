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
      // Use modern notification handler properties
      shouldShowBanner: true,
      shouldShowList: true,
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
      
      // Set current user ID if provided
      if (userId) {
        this.currentUserId = userId;
        console.log('PushNotificationService: Current user ID set:', userId);
      }
      
      // Register for push notifications
      const token = await this.registerForPushNotificationsAsync();
      if (token) {
        this.expoPushToken = token;
        this.isInitialized = true;
        console.log('PushNotificationService: Expo push token obtained:', token);
        
        // Save token to Firestore if we have a user ID
        if (this.currentUserId) {
          await this.savePushTokenToFirestore(this.currentUserId, token);
        }
        
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
      console.log('🔍 === PUSH NOTIFICATION REGISTRATION DEBUG ===');
      console.log('Platform:', Platform.OS);
      console.log('Is Device:', Device.isDevice);
      console.log('Device Name:', Device.deviceName);
      console.log('Device Type:', Device.deviceType);
      
      if (Platform.OS === 'android') {
        console.log('📱 Setting up Android notification channels...');
        console.log('✅ Android notification channels created');
      }
      
      console.log('📱 Physical device detected, proceeding with token generation...');
      
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
        
        console.log('PushNotificationService: Permission request result:', status);
        
        finalStatus = status;
        
        if (status === 'granted') {
          console.log('PushNotificationService: ✅ Notification permissions granted');
        } else if (status === 'denied') {
          console.log('PushNotificationService: ❌ Notification permissions denied');
        } else {
          console.log('PushNotificationService: ⚠️ Notification permissions undetermined');
        }
      } else {
        console.log('PushNotificationService: ✅ Notification permissions already granted');
        console.log('PushNotificationService: ✅ Notification permissions granted, proceeding with token generation');
      }
      
      if (finalStatus !== 'granted') {
        console.log('PushNotificationService: Cannot proceed without notification permissions');
        return null;
      }
      
      try {
        // Check if we're running in Expo Go (which has push notification limitations)
        const isExpoGo = Constants.appOwnership === 'expo';
        console.log('PushNotificationService: App ownership:', Constants.appOwnership);
        console.log('PushNotificationService: Is Expo Go:', isExpoGo);
        
        if (isExpoGo) {
          console.log('PushNotificationService: ⚠️ Running in Expo Go - push notifications may not work properly');
          console.log('PushNotificationService: ⚠️ Consider using a development build for full push notification support');
          // Still try to get token, but it may fail
        }
        
        // Expo push notifications don't require FCM keys - Expo handles FCM integration automatically
        console.log('PushNotificationService: Using Expo push service (no FCM keys required)');
        
        // Get Expo project ID from app.json
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? 
                         Constants.easConfig?.projectId ?? 
                         'b189d504-5441-4ee4-977f-2ad58d77659d';
        
        console.log('🎫 Generating Expo push token with projectId:', projectId);
        console.log('PushNotificationService: Using Expo push service with projectId');
        
        // Generate Expo push token with projectId (required for managed projects)
        token = (await Notifications.getExpoPushTokenAsync({
          projectId: projectId
        })).data;
        console.log('PushNotificationService: Got Expo push token:', token);
      } catch (error) {
        console.error('PushNotificationService: Failed to get Expo push token:', error);
        console.error('Error details:', error);
        
        // Check if this is a configuration error
        if (error.message && error.message.includes('Firebase API key')) {
          console.log('PushNotificationService: ❌ Firebase API key error detected');
          console.log('PushNotificationService: This suggests the google-services.json file may be missing or invalid');
          console.log('PushNotificationService: Check that google-services.json is in ./firebase/ directory');
        }
        
        if (error.message && error.message.includes('FCM')) {
          console.log('PushNotificationService: ❌ FCM error detected');
          console.log('PushNotificationService: This is unexpected - Expo handles FCM integration automatically');
        }
        
        if (error.message && error.message.includes('projectId')) {
          console.log('PushNotificationService: ❌ ProjectId error detected');
          console.log('PushNotificationService: Check that projectId is correctly set in app.json extra.eas.projectId');
        }
        
        console.log('PushNotificationService: No push token obtained');
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
      console.log('PushNotificationService: Getting push token for user:', userId);
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const expoPushToken = userData.expoPushToken;
        const pushToken = userData.pushToken;
        const pushNotificationsEnabled = userData.pushNotificationsEnabled;
        
        console.log('PushNotificationService: User data found:', {
          hasExpoPushToken: !!expoPushToken,
          hasPushToken: !!pushToken,
          pushNotificationsEnabled: pushNotificationsEnabled,
          expoPushTokenLength: expoPushToken ? expoPushToken.length : 0,
          pushTokenLength: pushToken ? pushToken.length : 0
        });
        
        const token = expoPushToken || pushToken || null;
        if (token) {
          console.log('PushNotificationService: ✅ Found push token for user:', userId);
        } else {
          console.log('PushNotificationService: ❌ No push token in user document for user:', userId);
        }
        
        return token;
      } else {
        console.log('PushNotificationService: ❌ User document does not exist for user:', userId);
        return null;
      }
    } catch (error) {
      console.error('PushNotificationService: ❌ Failed to get user push token:', error);
      return null;
    }
  }

  /**
   * Refresh push token for current user
   */
  async refreshTokenForCurrentUser() {
    if (!this.currentUserId) {
      console.log('PushNotificationService: No current user ID set for token refresh');
      return null;
    }
    
    try {
      console.log('PushNotificationService: Refreshing token for current user:', this.currentUserId);
      const newToken = await this.registerForPushNotificationsAsync();
      
      if (newToken) {
        console.log('PushNotificationService: New token obtained, saving to Firestore');
        await this.savePushTokenToFirestore(this.currentUserId, newToken);
        this.expoPushToken = newToken;
        return newToken;
      }
      
      return null;
    } catch (error) {
      console.error('PushNotificationService: Failed to refresh token for current user:', error);
      return null;
    }
  }

  /**
   * Send push notification using Expo's push notification service (non-blocking)
   */
  async sendPushNotification(toUserId, title, body, data = {}) {
    console.log('PushNotificationService: sendPushNotification called:', { toUserId, title, body, data });
    
    // Auto-initialize if not already initialized
    if (!this.isInitialized && !this.isInitializing) {
      console.log('PushNotificationService: Not initialized, attempting to initialize...');
      try {
        await this.initialize();
      } catch (error) {
        console.error('PushNotificationService: Auto-initialization failed:', error);
      }
    }
    
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
        console.log('PushNotificationService: ❌ No push token found for user:', toUserId);
        console.log('PushNotificationService: This means the user either:');
        console.log('PushNotificationService: 1. Has not granted notification permissions');
        console.log('PushNotificationService: 2. Has not initialized push notifications');
        console.log('PushNotificationService: 3. Has an invalid/expired token');
        console.log('PushNotificationService: 4. Push token was not saved to Firestore');
        
        // Check if this is the current user and try to refresh their token
        if (toUserId === this.currentUserId) {
          console.log('PushNotificationService: Attempting to refresh token for current user');
          try {
            await this.refreshTokenForCurrentUser();
          } catch (refreshError) {
            console.error('PushNotificationService: Failed to refresh token:', refreshError);
          }
        }
        
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

      // Use Expo's push service (FREE - no Firebase API key required)
      console.log('PushNotificationService: Using Expo push service (FREE - no Firebase dependency)');
      
      try {
        const message = {
          to: pushToken,
          sound: 'default',
          title: title,
          body: body,
          data: data,
          channelId: channelId,
        };

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        const result = await response.json();
        
        if (result.data && result.data.status === 'ok') {
          console.log('PushNotificationService: Push notification sent successfully via Expo');
          resolve(result.data.id);
        } else {
          throw new Error(`Expo push failed: ${JSON.stringify(result)}`);
        }
        
      } catch (expoError) {
        console.error('PushNotificationService: ❌ Failed to send push notification');
        console.error('PushNotificationService: Error details:', expoError.message || 'No details available');
        // Fallback to Firestore notification
        await this.saveNotificationToFirestore(toUserId, title, body, data);
        console.log('PushNotificationService: Falling back to Firestore notification');
        resolve('firestore_notification');
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

  /**
   * Test push notification to current user
   */
  async sendTestNotificationToSelf(userId) {
    try {
      console.log('PushNotificationService: Sending test notification to self...');
      
      // Get our own push token
      const ourToken = this.expoPushToken;
      if (!ourToken) {
        console.log('PushNotificationService: No push token available for self-test');
        return false;
      }

      // Send directly to ourselves using Expo's API
      const message = {
        to: ourToken,
        sound: 'default',
        title: '🧪 Test Notification',
        body: 'This is a test push notification from WhatWord!',
        data: { type: 'test', userId },
        priority: 'high',
        channelId: 'default',
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();
      console.log('PushNotificationService: Self-test result:', result);
      
      if (result.data && result.data[0] && result.data[0].status === 'ok') {
        console.log('PushNotificationService: ✅ Self-test notification sent successfully');
        return true;
      } else {
        console.error('PushNotificationService: ❌ Self-test notification failed:', result);
        return false;
      }
    } catch (error) {
      console.error('PushNotificationService: Self-test notification error:', error);
      return false;
    }
  }

}

// Export singleton instance
const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
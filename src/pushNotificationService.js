import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert, InteractionManager } from 'react-native';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Note: Notification handler is set up in notificationService.js to avoid conflicts
// This service focuses on token management and sending notifications

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
    this.tokenRefreshListener = null;
    
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
        
        // Set up token refresh listener
        this.setupTokenRefreshListener();
        
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

    console.log('🔍 === PUSH NOTIFICATION REGISTRATION DEBUG ===');
    console.log('Platform:', Platform.OS);
    console.log('Is Device:', Device.isDevice);
    console.log('Device Name:', Device.deviceName);
    console.log('Device Type:', Device.deviceType);

    if (Platform.OS === 'android') {
      console.log('📱 Setting up Android notification channels...');
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
      console.log('✅ Android notification channels created');
    }

    if (Device.isDevice) {
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
      }
      
      if (finalStatus !== 'granted') {
        console.log('PushNotificationService: ❌ Cannot proceed without notification permissions');
        console.log('PushNotificationService: Permission status:', finalStatus);
        return null;
      }
      
      console.log('PushNotificationService: ✅ Notification permissions granted, proceeding with token generation');
      
      try {
        // Dynamic project ID lookup with comprehensive fallbacks
        const getProjectId = () => {
          // Primary: EAS project ID from expo config
          if (Constants.expoConfig?.extra?.eas?.projectId) {
            console.log('PushNotificationService: Using EAS project ID from expoConfig.extra.eas');
            return Constants.expoConfig.extra.eas.projectId;
          }
          
          // Secondary: EAS project ID from eas config
          if (Constants.easConfig?.projectId) {
            console.log('PushNotificationService: Using EAS project ID from easConfig');
            return Constants.easConfig.projectId;
          }
          
          // Tertiary: Project ID from expo config extra
          if (Constants.expoConfig?.extra?.projectId) {
            console.log('PushNotificationService: Using project ID from expoConfig.extra');
            return Constants.expoConfig.extra.projectId;
          }
          
          // Fallback: Hardcoded (should be replaced with actual project ID)
          console.warn('PushNotificationService: Using fallback project ID - this may cause push notification failures');
          return 'b189d504-5441-4ee4-977f-2ad58d77659d';
        };
        
        const projectId = getProjectId();
        console.log('PushNotificationService: Resolved projectId:', projectId);
        
        if (!projectId || projectId === 'b189d504-5441-4ee4-977f-2ad58d77659d') {
          console.error('PushNotificationService: ⚠️ Using fallback project ID - push notifications may not work!');
          console.error('PushNotificationService: Please verify your EAS project ID in app.json');
        }
        
        console.log('🎫 Generating Expo push token...');
        token = (await Notifications.getExpoPushTokenAsync({
          projectId,
        })).data;
        console.log('PushNotificationService: Got Expo push token:', token);
        console.log('PushNotificationService: Project ID used:', projectId);
        console.log('✅ Push token generated successfully');
      } catch (error) {
        console.error('PushNotificationService: Failed to get Expo push token:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          stack: error.stack
        });
        return null;
      }
    } else {
      console.log('PushNotificationService: Must use physical device for Push Notifications');
      console.log('❌ Simulator/emulator detected - push notifications not available');
      return null;
    }

    console.log('🎉 Push notification registration completed successfully');
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
      console.log('PushNotificationService: Saving push token to Firestore for user:', userId);
      console.log('PushNotificationService: Token to save:', token);
      
      await setDoc(doc(db, 'users', userId), {
        expoPushToken: token,
        pushToken: token, // Also save as pushToken for compatibility
        pushTokenUpdatedAt: new Date().toISOString(),
        pushNotificationsEnabled: true,
        lastTokenRefresh: new Date().toISOString(),
      }, { merge: true });
      
      console.log('PushNotificationService: ✅ Successfully saved push token to Firestore');
      return true;
    } catch (error) {
      console.error('PushNotificationService: ❌ Failed to save push token:', error);
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
        // Ensure notifications show even when app is closed
        _displayInForeground: true,
        _displayInBackground: true,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      try {
        console.log('PushNotificationService: Sending message to Expo:', JSON.stringify(message, null, 2));
      console.log('PushNotificationService: Target user ID:', toUserId);
      console.log('PushNotificationService: Push token length:', pushToken ? pushToken.length : 'null');
        
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
        
        // Monitor the response for errors and success
        this.monitorPushResult(result, toUserId, data.type || 'general');
        
        if (result.data && result.data[0] && result.data[0].status === 'ok') {
          console.log('PushNotificationService: ✅ Push notification sent successfully');
          console.log('PushNotificationService: Notification ID:', result.data[0].id);
          // Do not duplicate successful pushes into Firestore to avoid flooding in-app notifications
          resolve(result.data[0].id);
        } else {
          console.error('PushNotificationService: ❌ Failed to send push notification');
          console.error('PushNotificationService: Response data:', JSON.stringify(result, null, 2));
          console.error('PushNotificationService: Error details:', result.data?.[0]?.details || 'No details available');
          
          // Fallback to Firestore notification
          console.log('PushNotificationService: Falling back to Firestore notification');
          this.saveNotificationToFirestore(toUserId, title, body, data).catch(error => {
            console.error('PushNotificationService: Failed to save to Firestore:', error);
          });
          resolve(null);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        this.logError('Failed to send push notification', fetchError, {
          toUserId,
          notificationType: data.type || 'general',
          token: pushToken,
          message: JSON.stringify(message, null, 2)
        });
        
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
   * Set up token refresh listener for Expo push tokens
   */
  setupTokenRefreshListener() {
    try {
      // Listen for token changes
      this.tokenRefreshListener = Notifications.addPushTokenListener(async (token) => {
        console.log('PushNotificationService: Token refreshed:', token.data);
        this.expoPushToken = token.data;
        this.lastTokenRefresh = Date.now();
        
        // Save new token to Firestore if we have a current user
        if (this.currentUserId) {
          await this.savePushTokenToFirestore(this.currentUserId, token.data);
        }
      });
      
      console.log('PushNotificationService: Token refresh listener set up');
    } catch (error) {
      console.error('PushNotificationService: Failed to set up token refresh listener:', error);
    }
  }

  /**
   * Clean up token refresh listener
   */
  cleanupTokenRefreshListener() {
    if (this.tokenRefreshListener) {
      try {
        Notifications.removeNotificationSubscription(this.tokenRefreshListener);
        this.tokenRefreshListener = null;
        console.log('PushNotificationService: Token refresh listener cleaned up');
      } catch (error) {
        console.error('PushNotificationService: Failed to clean up token refresh listener:', error);
      }
    }
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
    
    // Clean up token refresh listener
    this.cleanupTokenRefreshListener();
    
    // Clear notification queue
    this.notificationQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Enhanced error logging with stack traces
   * @param {string} context - Context where error occurred
   * @param {Error} error - The error object
   * @param {Object} additionalInfo - Additional context information
   */
  logError(context, error, additionalInfo = {}) {
    console.error(`PushNotificationService: ${context}`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Monitor push notification send results
   * @param {Object} response - Expo push response
   * @param {string} recipientId - Recipient user ID
   * @param {string} notificationType - Type of notification sent
   */
  monitorPushResult(response, recipientId, notificationType) {
    const { data, errors } = response;
    
    if (errors && errors.length > 0) {
      console.error('PushNotificationService: Push notification errors:', {
        recipientId,
        notificationType,
        errors: errors.map(err => ({
          code: err.code,
          message: err.message,
          details: err.details
        })),
        timestamp: new Date().toISOString()
      });
    }
    
    if (data && data.length > 0) {
      console.log('PushNotificationService: Push notification results:', {
        recipientId,
        notificationType,
        results: data.map(result => ({
          status: result.status,
          message: result.message,
          details: result.details
        })),
        timestamp: new Date().toISOString()
      });
    }
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
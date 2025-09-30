import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMessaging, getToken, onMessage, onTokenRefresh, onBackgroundMessage } from 'firebase/messaging';
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { playSound } from './soundsUtil';
import pushNotificationService from './pushNotificationService';

// Configure notification behavior for both foreground and background
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log('NotificationService: Handling notification:', notification);
    
    // Always show notification regardless of app state
    // This is critical for background notifications to work
    return {
      // iOS-specific fields
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // Android-specific fields
      priority: 'high',
      // Force notification to show even when app is closed
      _displayInForeground: true,
      _displayInBackground: true,
    };
  },
});

// Background message handler for FCM
if (Platform.OS === 'android') {
  // This will be called when the app is in the background
  try {
    onBackgroundMessage(getMessaging(), async (remoteMessage) => {
      console.log('NotificationService: Background message received:', remoteMessage);
      // Handle background notification here
      // Note: This only works on Android when the app is in background
      
      // Play sound for background notifications
      try {
        await playSound('chime');
      } catch (error) {
        console.warn('NotificationService: Failed to play background notification sound:', error);
      }
    });
  } catch (error) {
    console.warn('NotificationService: Failed to set up background message handler:', error);
  }
}

class NotificationService {
  constructor() {
    this.messaging = null;
    this.currentToken = null;
    this.permissionStatus = null;
    this.onTokenRefreshUnsubscribe = null;
    this.currentUserId = null;
    this.tokenRefreshListener = null;
    
    // Notification reception state
    this.foregroundListener = null;
    this.notificationResponseListener = null;
    this.appStateListener = null;
    this.lastNotification = null;
    
    // Permission retry logic
    this.permissionRetryCount = 0;
    this.maxPermissionRetries = 3;
    this.permissionRetryDelay = 2000; // 2 seconds
    
    // Local notification settings
    this.notificationSettings = {
      sound: true,
      vibration: true,
      badge: true,
      priority: 'high'
    };
  }

  /**
   * Initialize the notification service
   * @param {string} userId - Optional user ID for token management
   */
  async initialize(userId = null) {
    try {
      // Initialize Firebase messaging
      try {
        this.messaging = getMessaging();
        console.log('NotificationService: Firebase messaging initialized');
      } catch (error) {
        console.warn('NotificationService: Failed to initialize Firebase messaging:', error);
        this.messaging = null;
      }
      
      // Check current permission status
      const { status } = await Notifications.getPermissionsAsync();
      this.permissionStatus = status;
      
      // Set up notification reception listeners
      this.setupNotificationListeners();
      
      // Set current user if provided
      if (userId) {
        this.setCurrentUser(userId);
      }
      
      // Get current token if permissions are granted
      if (this.permissionStatus === 'granted') {
        const token = await this.getFCMToken();
        if (token && userId) {
          await this.saveTokenToFirestore(userId, token);
        }
      }
      
      // Set up token refresh listener
      this.setupTokenRefreshListener();
      
      return true;
    } catch (error) {
      console.error('NotificationService: Initialization failed:', error);
      return false;
    }
  }

  /**
   * Set the current user ID for token management
   * @param {string} userId - The current user's ID
   */
  setCurrentUser(userId) {
    this.currentUserId = userId;
    
    // If we already have a token, save it for this user
    if (this.currentToken && userId) {
      this.saveTokenToFirestore(userId, this.currentToken);
    }
  }

  /**
   * Set up token refresh listener to automatically update Firestore
   */
  setupTokenRefreshListener() {
    if (!this.messaging) {
      console.warn('NotificationService: Firebase messaging not available, skipping token refresh listener');
      return;
    }
    
    try {
      this.onTokenRefreshUnsubscribe = onTokenRefresh(this.messaging, async (token) => {
        console.log('NotificationService: FCM token refreshed:', token);
        
        // Update current token
        this.currentToken = token;
        
        // Save new token to Firestore if user ID is available
        if (this.currentUserId) {
          await this.saveTokenToFirestore(this.currentUserId, token);
        }
      });
      console.log('NotificationService: Token refresh listener set up');
    } catch (error) {
      console.error('NotificationService: Failed to set up token refresh listener:', error);
    }
  }

  /**
   * Save FCM token to user's Firestore profile
   * @param {string} userId - The user's ID
   * @param {string} token - The FCM token to save
   * @returns {Promise<boolean>} Success status
   */
  async saveTokenToFirestore(userId, token) {
    try {
      if (!userId || !token) {
        console.warn('NotificationService: Cannot save token - missing userId or token');
        return false;
      }

      // Check if user document exists
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        // Update existing user document
        await updateDoc(userDocRef, {
          pushToken: token,
          lastTokenUpdate: new Date().toISOString(),
          platform: Platform.OS,
          deviceId: Device.deviceName || 'unknown',
          appVersion: Device.osVersion || 'unknown'
        });
      } else {
        // Create new user document with token
        await setDoc(userDocRef, {
          pushToken: token,
          lastTokenUpdate: new Date().toISOString(),
          platform: Platform.OS,
          deviceId: Device.deviceName || 'unknown',
          appVersion: Device.osVersion || 'unknown',
          createdAt: new Date().toISOString()
        });
      }
      
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to save token to Firestore:', error);
      return false;
    }
  }

  /**
   * Get and save FCM token for current user
   * @param {string} userId - The user's ID
   * @returns {Promise<string|null>} The FCM token or null if failed
   */
  async getAndSaveToken(userId) {
    try {
      const token = await this.getFCMToken();
      if (token) {
        this.currentToken = token;
        await this.saveTokenToFirestore(userId, token);
        return token;
      }
      return null;
    } catch (error) {
      console.error('NotificationService: Failed to get and save token:', error);
      return null;
    }
  }

  /**
   * Validate FCM token format
   * @param {string} token - The token to validate
   * @returns {boolean} Whether the token is valid
   */
  isValidToken(token) {
    if (!token || typeof token !== 'string') return false;
    
    // FCM tokens are typically 140+ characters and contain alphanumeric characters
    // This is a basic validation - you might want to adjust based on your needs
    return token.length >= 140 && /^[a-zA-Z0-9:_-]+$/.test(token);
  }

  /**
   * Check current notification permission status
   * @returns {Promise<string>} Permission status: 'granted', 'denied', 'undetermined', or 'blocked'
   */
  async checkPermissionStatus() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      this.permissionStatus = status;
      return status;
    } catch (error) {
      console.error('NotificationService: Error checking permission status:', error);
      return 'undetermined';
    }
  }

  /**
   * Request notification permissions with platform-specific handling
   * @param {boolean} showExplanation - Whether to show explanation dialog before requesting
   * @returns {Promise<string>} Permission status after request
   */
  async requestPermission(showExplanation = false) {
    try {
      if (Platform.OS === 'ios') {
        return await this.requestIOSPermission(showExplanation);
      } else {
        return await this.requestAndroidPermission(showExplanation);
      }
    } catch (error) {
      console.error('NotificationService: Permission request failed:', error);
      return 'denied';
    }
  }

  /**
   * Request iOS notification permissions with proper prompts
   * @param {boolean} showExplanation - Whether to show explanation dialog
   * @returns {Promise<string>} Permission status
   */
  async requestIOSPermission(showExplanation = false) {
    try {
      // Check existing permission status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      
      if (existingStatus === 'granted') {
        return 'granted';
      }

      if (existingStatus === 'denied') {
        
        if (showExplanation) {
          // Show explanation and guide user to Settings
          Alert.alert(
            'Notifications Disabled',
            'To receive friend requests and game challenges, please enable notifications in Settings > Notifications > WhatWord',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => this.openIOSSettings() }
            ]
          );
        }
        return 'denied';
      }

      // Show explanation dialog if requested
      if (showExplanation) {
        const shouldRequest = await this.showIOSPermissionExplanation();
        if (!shouldRequest) {
          return 'denied';
        }
      }

      // Request permissions with all options enabled
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,        // Show alert banners
          allowBadge: true,        // Show app badge
          allowSound: true,        // Play notification sounds
          allowAnnouncements: true, // Allow Siri to announce notifications
          allowCriticalAlerts: false, // Don't request critical alerts (requires special approval)
          provideAppNotificationSettings: true, // Show notification settings in app
        },
      });

      if (status === 'granted') {
        // Register for remote notifications (required for FCM on iOS)
        await Notifications.registerForRemoteNotificationsAsync();
      } else {
      }

      this.permissionStatus = status;
      return status;
    } catch (error) {
      console.error('NotificationService: iOS permission request failed:', error);
      return 'denied';
    }
  }

  /**
   * Request Android notification permissions
   * @param {boolean} showExplanation - Whether to show explanation dialog
   * @returns {Promise<string>} Permission status
   */
  async requestAndroidPermission(showExplanation = false) {
    try {
      // Check existing permission status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      
      if (existingStatus === 'granted') {
        return 'granted';
      }

      if (existingStatus === 'denied') {
        
        if (showExplanation) {
          // Show explanation and guide user to Settings
          Alert.alert(
            'Notifications Disabled',
            'To receive friend requests and game challenges, please enable notifications in Settings > Apps > WhatWord > Notifications',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => this.openAndroidSettings() }
            ]
          );
        }
        return 'denied';
      }

      // Show explanation dialog if requested
      if (showExplanation) {
        const shouldRequest = await this.showAndroidPermissionExplanation();
        if (!shouldRequest) {
          return 'denied';
        }
      }

      // Request permissions (Android 13+ requires POST_NOTIFICATIONS permission)
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status === 'granted') {
      } else {
      }

      this.permissionStatus = status;
      return status;
    } catch (error) {
      console.error('NotificationService: Android permission request failed:', error);
      return 'denied';
    }
  }

  /**
   * Show iOS permission explanation dialog
   * @returns {Promise<boolean>} Whether user wants to proceed with permission request
   */
  async showIOSPermissionExplanation() {
    return new Promise((resolve) => {
      Alert.alert(
        'Enable Notifications',
        'WhatWord needs notifications to:\n\n• Alert you about friend requests\n• Notify you of game challenges\n• Keep you updated on game progress\n• Send you important game updates',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve(false)
          },
          {
            text: 'Enable',
            onPress: () => resolve(true)
          }
        ]
      );
    });
  }

  /**
   * Show Android permission explanation dialog
   * @returns {Promise<boolean>} Whether user wants to proceed with permission request
   */
  async showAndroidPermissionExplanation() {
    return new Promise((resolve) => {
      Alert.alert(
        'Enable Notifications',
        'WhatWord needs notifications to:\n\n• Alert you about friend requests\n• Notify you of game challenges\n• Keep you updated on game progress\n• Send you important game updates',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve(false)
          },
          {
            text: 'Enable',
            onPress: () => resolve(true)
          }
        ]
      );
    });
  }

  /**
   * Open iOS Settings app
   */
  async openIOSSettings() {
    try {
      // Try to open app settings
      const canOpen = await Linking.canOpenURL('app-settings:');
      if (canOpen) {
        await Linking.openURL('app-settings:');
      } else {
        // Fallback to general settings
        await Linking.openURL('App-Prefs:root=NOTIFICATIONS_ID');
      }
    } catch (error) {
      console.error('NotificationService: Failed to open iOS settings:', error);
      // Show manual instructions
      Alert.alert(
        'Open Settings Manually',
        'Please go to:\nSettings > Notifications > WhatWord\n\nThen enable notifications for the app.',
        [{ text: 'OK' }]
      );
    }
  }

  /**
   * Open Android Settings app
   */
  async openAndroidSettings() {
    try {
      // Try to open app-specific settings
      const packageName = 'com.anonymous.WhatWord';
      const canOpen = await Linking.canOpenURL(`package:${packageName}`);
      if (canOpen) {
        await Linking.openURL(`package:${packageName}`);
      } else {
        // Fallback to general app settings
        await Linking.openURL('android-app://com.android.settings/.ApplicationPkgName');
      }
    } catch (error) {
      console.error('NotificationService: Failed to open Android settings:', error);
      // Show manual instructions
      Alert.alert(
        'Open Settings Manually',
        'Please go to:\nSettings > Apps > WhatWord > Notifications\n\nThen enable notifications for the app.',
        [{ text: 'OK' }]
      );
    }
  }

  /**
   * Check if notifications are currently enabled
   * @returns {Promise<boolean>} Whether notifications are enabled
   */
  async areNotificationsEnabled() {
    try {
      const status = await this.checkPermissionStatus();
      return status === 'granted';
    } catch (error) {
      console.error('NotificationService: Error checking notification status:', error);
      return false;
    }
  }

  /**
   * Get detailed permission information
   * @returns {Promise<Object>} Permission details
   */
  async getPermissionDetails() {
    try {
      const status = await this.checkPermissionStatus();
      const canAskAgain = await Notifications.canAskForPermissionsAsync();
      
      return {
        status,
        canAskAgain,
        platform: Platform.OS,
        deviceName: Device.deviceName || 'unknown',
        isDevice: Device.isDevice,
        brand: Device.brand,
        modelName: Device.modelName,
        osVersion: Device.osVersion,
        osBuildId: Device.osBuildId,
        deviceType: Device.deviceType,
        totalMemory: Device.totalMemory,
        supportedCpuArchitectures: Device.supportedCpuArchitectures,
      };
    } catch (error) {
      console.error('NotificationService: Error getting permission details:', error);
      return {
        status: 'unknown',
        canAskAgain: false,
        platform: Platform.OS,
        error: error.message
      };
    }
  }

  /**
   * Request permission with comprehensive explanation and fallback
   * @param {boolean} forceRequest - Whether to force permission request even if previously denied
   * @returns {Promise<string>} Final permission status
   */
  async requestPermissionWithFallback(forceRequest = false) {
    try {
      const currentStatus = await this.checkPermissionStatus();
      
      // If already granted, return immediately
      if (currentStatus === 'granted') {
        return 'granted';
      }

      // If permission was denied and we're not forcing, show explanation
      if (currentStatus === 'denied' && !forceRequest) {
        const shouldRetry = await this.showPermissionRetryDialog();
        if (shouldRetry) {
          return await this.requestPermission(true);
        }
        return 'denied';
      }

      // Request permission with explanation
      const finalStatus = await this.requestPermission(true);
      
      // If still denied, show settings guidance
      if (finalStatus === 'denied') {
        await this.showSettingsGuidance();
      }

      return finalStatus;
    } catch (error) {
      console.error('NotificationService: Permission request with fallback failed:', error);
      return 'denied';
    }
  }

  /**
   * Show dialog asking if user wants to retry permission request
   * @returns {Promise<boolean>} Whether user wants to retry
   */
  async showPermissionRetryDialog() {
    return new Promise((resolve) => {
      Alert.alert(
        'Permission Required',
        'Notifications are essential for the full WhatWord experience. Would you like to try again?',
        [
          {
            text: 'No Thanks',
            style: 'cancel',
            onPress: () => resolve(false)
          },
          {
            text: 'Try Again',
            onPress: () => resolve(true)
          }
        ]
      );
    });
  }

  /**
   * Show guidance for enabling notifications in device settings
   */
  async showSettingsGuidance() {
    const platform = Platform.OS;
    const title = 'Enable Notifications';
    let message = '';
    let settingsButton = '';

    if (platform === 'ios') {
      message = 'To enable notifications:\n\n1. Go to Settings > Notifications > WhatWord\n2. Turn on "Allow Notifications"\n3. Enable "Sounds", "Badges", and "Banners"';
      settingsButton = 'Open Settings';
    } else {
      message = 'To enable notifications:\n\n1. Go to Settings > Apps > WhatWord > Notifications\n2. Turn on "Show notifications"\n3. Enable "Sound" and "Vibration"';
      settingsButton = 'Open Settings';
    }

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: settingsButton, onPress: () => this.openDeviceSettings() }
      ]
    );
  }

  /**
   * Open device settings for the app
   */
  async openDeviceSettings() {
    try {
      if (Platform.OS === 'ios') {
        await this.openIOSSettings();
      } else {
        await this.openAndroidSettings();
      }
    } catch (error) {
      console.error('NotificationService: Failed to open device settings:', error);
    }
  }

  async getFCMToken() {
    try {
      if (!this.messaging) {
        console.warn('NotificationService: Firebase messaging not available');
        return null;
      }
      
      const token = await getToken(this.messaging, {
        vapidKey: 'BN_CPeFYRM3c6IuuBz-l8xdJGiN2C8G5vb9rdH8f20apmzFz5_PcTOB3A11FfZ8lzYOezFR_llCNGFQj1_ycg8E'
      });
      
      console.log('NotificationService: FCM token obtained:', token ? 'Success' : 'Failed');
      return token;
    } catch (error) {
      console.error('NotificationService: Failed to get FCM token:', error);
      return null;
    }
  }

  /**
   * Set up all notification reception listeners
   */
  setupNotificationListeners() {
    // Clean up existing listeners first to prevent duplicates
    this.cleanup();

    // Foreground message listener (when app is open and active)
    if (this.messaging) {
      try {
        this.foregroundListener = onMessage(this.messaging, (remoteMessage) => {
          console.log('NotificationService: Foreground message received:', remoteMessage);
          this.handleForegroundNotification(remoteMessage);
        });
        console.log('NotificationService: Foreground message listener set up');
      } catch (error) {
        console.error('NotificationService: Failed to set up foreground message listener:', error);
      }
    } else {
      console.warn('NotificationService: Firebase messaging not available, skipping foreground listener');
    }

    // Notification response listener (when user taps notification)
    this.notificationResponseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      this.handleNotificationResponse(response);
    });

    // App state change listener
    this.setupAppStateListener();
  }

  /**
   * Set up app state change listener to handle background/foreground transitions
   */
  setupAppStateListener() {
    // Note: This would typically use AppState from react-native
    // For now, we'll handle it through the existing listeners
  }

  /**
   * Handle notification received while app is in foreground
   * @param {Object} remoteMessage - The FCM message object
   */
  handleForegroundNotification(remoteMessage) {
    try {
      this.lastNotification = remoteMessage;
      
      // Extract notification data
      const { notification, data } = remoteMessage;
      const title = notification?.title || 'New Notification';
      const body = notification?.body || 'You have a new message';
      
      // Show local notification to user
      this.showLocalNotification({
        title,
        body,
        data: data || {},
        sound: this.notificationSettings.sound,
        priority: this.notificationSettings.priority
      });
      
      // Emit event for UI updates (if using event system)
      this.emitNotificationEvent('foreground', remoteMessage);
      
    } catch (error) {
      console.error('NotificationService: Error handling foreground notification:', error);
    }
  }

  /**
   * Handle notification response (user tap)
   * @param {Object} response - The notification response object
   */
  handleNotificationResponse(response) {
    try {
      const { notification, actionIdentifier } = response;
      const data = notification.request.content.data;
      
      
      // Handle different action types
      if (actionIdentifier === 'default') {
        // Default tap action
        this.handleDefaultNotificationAction(data);
      } else if (actionIdentifier === 'reply') {
        // Reply action (if implemented)
        this.handleReplyAction(data);
      }
      
      // Emit event for UI updates
      this.emitNotificationEvent('response', { response, data });
      
    } catch (error) {
      console.error('NotificationService: Error handling notification response:', error);
    }
  }

  /**
   * Handle default notification action (tap)
   * @param {Object} data - Notification data
   */
  handleDefaultNotificationAction(data) {
    try {
      // Handle different notification types based on data
      if (data.type === 'game_invite') {
        this.handleGameInviteNotification(data);
      } else if (data.type === 'friend_request') {
        this.handleFriendRequestNotification(data);
      } else if (data.type === 'game_result') {
        this.handleGameResultNotification(data);
      } else {
        // Generic notification handling
        this.handleGenericNotification(data);
      }
    } catch (error) {
      console.error('NotificationService: Error handling default action:', error);
    }
  }

  /**
   * Handle game invite notification
   * @param {Object} data - Game invite data
   */
  handleGameInviteNotification(data) {
    // Navigate to game screen or show game invite modal
    // This would typically use navigation or state management
  }

  /**
   * Handle friend request notification
   * @param {Object} data - Friend request data
   */
  handleFriendRequestNotification(data) {
    // Navigate to friends screen or show friend request modal
  }

  /**
   * Handle game result notification
   * @param {Object} data - Game result data
   */
  handleGameResultNotification(data) {
    // Show game result modal or navigate to results screen
  }

  /**
   * Handle generic notification
   * @param {Object} data - Generic notification data
   */
  handleGenericNotification(data) {
    // Handle generic notifications
  }

  /**
   * Handle reply action (if implemented)
   * @param {Object} data - Notification data
   */
  handleReplyAction(data) {
    // Handle reply functionality
  }

  /**
   * Show local notification
   * @param {Object} options - Notification options
   */
  async showLocalNotification(options) {
    try {
      const {
        title,
        body,
        data = {},
        sound = true,
        priority = 'default',
        badge = null,
        categoryIdentifier = null
      } = options;

      const notificationContent = {
        title,
        body,
        data,
        sound,
        priority,
        // Avoid passing undefined/null badge to iOS; only include if it's a valid number
        ...(typeof badge === 'number' ? { badge } : {}),
        // Only include categoryIdentifier if it's a valid string
        ...(categoryIdentifier && typeof categoryIdentifier === 'string' ? { categoryIdentifier } : {})
      };

      // Add platform-specific options
      if (Platform.OS === 'android') {
        notificationContent.android = {
          priority: priority === 'high' ? 'max' : 'default',
          sound: sound,
          vibrate: this.notificationSettings.vibration ? [0, 250, 250, 250] : undefined,
          channelId: 'default',
          sticky: false,
          autoCancel: true
        };
      } else if (Platform.OS === 'ios') {
        notificationContent.ios = {
          sound: sound,
          // Only include badge if number
          ...(typeof badge === 'number' ? { badge } : {}),
          // Only include categoryIdentifier if it's a valid string
          ...(categoryIdentifier && typeof categoryIdentifier === 'string' ? { categoryIdentifier } : {}),
          threadIdentifier: 'default'
        };
      }

      await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null // Show immediately
      });

    } catch (error) {
      console.error('NotificationService: Error showing local notification:', error);
    }
  }

  /**
   * Schedule a delayed notification
   * @param {Object} options - Notification options
   * @param {Object} trigger - Trigger options (seconds, date, etc.)
   */
  async scheduleNotification(options, trigger) {
    try {
      const notificationContent = {
        title: options.title,
        body: options.body,
        data: options.data || {},
        sound: options.sound !== false,
        priority: options.priority || 'default'
      };

      if (Platform.OS === 'android') {
        notificationContent.android = {
          priority: options.priority === 'high' ? 'max' : 'default',
          sound: options.sound !== false,
          vibrate: this.notificationSettings.vibration ? [0, 250, 250, 250] : undefined,
          channelId: 'default'
        };
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger
      });

      return notificationId;
    } catch (error) {
      console.error('NotificationService: Error scheduling notification:', error);
      return null;
    }
  }

  /**
   * Cancel a scheduled notification
   * @param {string} notificationId - The notification ID to cancel
   */
  async cancelNotification(notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      return true;
    } catch (error) {
      console.error('NotificationService: Error cancelling notification:', error);
      return false;
    }
  }

  /**
   * Dismiss a notification permanently from device notification center
   * @param {string} notificationId - The notification ID to dismiss
   */
  async dismissNotificationPermanently(notificationId) {
    try {
      // Mark as read in Firestore
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
        readAt: new Date().toISOString(),
        dismissed: true,
        dismissedAt: new Date().toISOString()
      });
      
      // Dismiss from device notification center (if available)
      if (Notifications.dismissNotificationAsync) {
        await Notifications.dismissNotificationAsync(notificationId);
      }
      
      console.log('NotificationService: Permanently dismissed notification:', notificationId);
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to permanently dismiss notification:', error);
      return false;
    }
  }

  /**
   * Clear all notifications from device notification center
   */
  async clearAllDeviceNotifications() {
    try {
      await Notifications.dismissAllNotificationsAsync();
      console.log('NotificationService: Cleared all device notifications');
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to clear all device notifications:', error);
      return false;
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return true;
    } catch (error) {
      console.error('NotificationService: Error cancelling all notifications:', error);
      return false;
    }
  }


  /**
   * Get all pending notifications
   */
  async getPendingNotifications() {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      return notifications;
    } catch (error) {
      console.error('NotificationService: Error getting pending notifications:', error);
      return [];
    }
  }

  /**
   * Set notification settings
   * @param {Object} settings - Notification settings
   */
  updateNotificationSettings(settings) {
    this.notificationSettings = {
      ...this.notificationSettings,
      ...settings
    };
  }

  /**
   * Get current notification settings
   */
  getNotificationSettings() {
    return { ...this.notificationSettings };
  }

  /**
   * Emit notification event (placeholder for event system)
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  emitNotificationEvent(type, data) {
    // This would typically use an event emitter or state management system
    
    // Example: You could integrate with React Navigation, Redux, or other state management
    // NavigationService.navigate('NotificationScreen', { notification: data });
    // or dispatch to Redux store
  }

  /**
   * Get the last received notification
   */
  getLastNotification() {
    return this.lastNotification;
  }

  /**
   * Clear the last notification
   */
  clearLastNotification() {
    this.lastNotification = null;
  }

  /**
   * Test notification reception
   * @param {string} userId - User ID for testing
   */
  async testNotificationReception(userId) {
    try {
      // Send a test local notification
      await this.showLocalNotification({
        title: 'Test Notification',
        body: 'This is a test notification to verify reception',
        data: {
          type: 'test',
          timestamp: new Date().toISOString(),
          userId: userId
        },
        sound: true,
        priority: 'high'
      });

      return true;
    } catch (error) {
      console.error('NotificationService: Error sending test notification:', error);
      return false;
    }
  }

  /**
   * Handle notification when app is in background
   * @param {Object} remoteMessage - The FCM message object
   */
  handleBackgroundNotification(remoteMessage) {
    try {
      
      // Store notification for when app becomes active
      this.lastNotification = remoteMessage;
      
      // Handle different notification types in background
      const { data } = remoteMessage;
      if (data?.type === 'game_invite') {
        // Update local storage or trigger app refresh
        this.handleBackgroundGameInvite(data);
      } else if (data?.type === 'friend_request') {
        this.handleBackgroundFriendRequest(data);
      }
      
      // Emit event for background processing
      this.emitNotificationEvent('background', remoteMessage);
      
    } catch (error) {
      console.error('NotificationService: Error handling background notification:', error);
    }
  }

  /**
   * Handle background game invite
   * @param {Object} data - Game invite data
   */
  async handleBackgroundGameInvite(data) {
    try {
      const raw = (await AsyncStorage.getItem('pendingGameInvites')) || '[]';
      const gameInvites = JSON.parse(raw);
      gameInvites.push({ ...data, receivedAt: new Date().toISOString() });
      await AsyncStorage.setItem('pendingGameInvites', JSON.stringify(gameInvites));
      
    } catch (error) {
      console.error('NotificationService: Error storing background game invite:', error);
    }
  }

  /**
   * Handle background friend request
   * @param {Object} data - Friend request data
   */
  async handleBackgroundFriendRequest(data) {
    try {
      const raw = (await AsyncStorage.getItem('pendingFriendRequests')) || '[]';
      const friendRequests = JSON.parse(raw);
      friendRequests.push({ ...data, receivedAt: new Date().toISOString() });
      await AsyncStorage.setItem('pendingFriendRequests', JSON.stringify(friendRequests));
      
    } catch (error) {
      console.error('NotificationService: Error storing background friend request:', error);
    }
  }

  /**
   * Get pending notifications from background
   * @returns {Object} Object containing pending notifications
   */
  async getPendingBackgroundNotifications() {
    try {
      const rawInvites = (await AsyncStorage.getItem('pendingGameInvites')) || '[]';
      const rawFriends = (await AsyncStorage.getItem('pendingFriendRequests')) || '[]';
      const gameInvites = JSON.parse(rawInvites);
      const friendRequests = JSON.parse(rawFriends);
      
      return {
        gameInvites,
        friendRequests,
        hasPending: gameInvites.length > 0 || friendRequests.length > 0
      };
    } catch (error) {
      console.error('NotificationService: Error getting pending background notifications:', error);
      return { gameInvites: [], friendRequests: [], hasPending: false };
    }
  }

  /**
   * Clear pending background notifications
   */
  async clearPendingBackgroundNotifications() {
    try {
      await AsyncStorage.removeItem('pendingGameInvites');
      await AsyncStorage.removeItem('pendingFriendRequests');
    } catch (error) {
      console.error('NotificationService: Error clearing pending background notifications:', error);
    }
  }

  /**
   * Set up notification categories for iOS
   */
  async setupNotificationCategories() {
    try {
      if (Platform.OS === 'ios') {
        // Define notification categories with actions
        const categories = [
          {
            identifier: 'game_invite',
            actions: [
              {
                identifier: 'accept',
                buttonTitle: 'Accept',
                options: { foreground: true }
              },
              {
                identifier: 'decline',
                buttonTitle: 'Decline',
                options: { foreground: true }
              }
            ]
          },
          {
            identifier: 'friend_request',
            actions: [
              {
                identifier: 'accept',
                buttonTitle: 'Accept',
                options: { foreground: true }
              },
              {
                identifier: 'decline',
                buttonTitle: 'Decline',
                options: { foreground: true }
              }
            ]
          }
        ];

        await Notifications.setNotificationCategoryAsync('game_invite', categories[0].actions);
        await Notifications.setNotificationCategoryAsync('friend_request', categories[1].actions);
        
      }
    } catch (error) {
      console.error('NotificationService: Error setting up notification categories:', error);
    }
  }

  /**
   * Handle notification action (for iOS action buttons)
   * @param {string} actionIdentifier - The action identifier
   * @param {Object} data - Notification data
   */
  async handleNotificationAction(actionIdentifier, data) {
    try {
      
      if (actionIdentifier === 'accept') {
        if (data.type === 'game_invite') {
          await this.handleGameInviteAccept(data);
        } else if (data.type === 'friend_request') {
          await this.handleFriendRequestAccept(data);
        }
      } else if (actionIdentifier === 'decline') {
        if (data.type === 'game_invite') {
          await this.handleGameInviteDecline(data);
        } else if (data.type === 'friend_request') {
          await this.handleFriendRequestDecline(data);
        }
      }
      
    } catch (error) {
      console.error('NotificationService: Error handling notification action:', error);
    }
  }

  /**
   * Handle game invite accept action
   * @param {Object} data - Game invite data
   */
  async handleGameInviteAccept(data) {
    try {
      // Implement game invite acceptance logic
      // This would typically call your game service
    } catch (error) {
      console.error('NotificationService: Error accepting game invite:', error);
    }
  }

  /**
   * Handle game invite decline action
   * @param {Object} data - Game invite data
   */
  async handleGameInviteDecline(data) {
    try {
      // Implement game invite decline logic
    } catch (error) {
      console.error('NotificationService: Error declining game invite:', error);
    }
  }

  /**
   * Handle friend request accept action
   * @param {Object} data - Friend request data
   */
  async handleFriendRequestAccept(data) {
    try {
      // Implement friend request acceptance logic
    } catch (error) {
      console.error('NotificationService: Error accepting friend request:', error);
    }
  }

  /**
   * Handle friend request decline action
   * @param {Object} data - Friend request data
   */
  async handleFriendRequestDecline(data) {
    try {
      // Implement friend request decline logic
    } catch (error) {
      console.error('NotificationService: Error declining friend request:', error);
    }
  }

  // Update user's push token in Firestore
  async updateUserToken(userId) {
    try {
      if (this.currentToken) {
        return await this.saveTokenToFirestore(userId, this.currentToken);
      }
      return false;
    } catch (error) {
      console.error('NotificationService: Failed to update user token:', error);
      return false;
    }
  }

  // Get user's push token from Firestore
  async getUserPushToken(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return userDoc.data().pushToken || null;
      }
      return null;
    } catch (error) {
      console.error('NotificationService: Failed to get user push token:', error);
      return null;
    }
  }

  // Refresh FCM token and update user profile
  async refreshAndUpdateToken(userId) {
    try {
      const newToken = await this.getFCMToken();
      if (newToken && newToken !== this.currentToken) {
        this.currentToken = newToken;
        
        // Save new token to Firestore
        if (userId) {
          await this.saveTokenToFirestore(userId, newToken);
        }
        
        return newToken;
      }
      return this.currentToken;
    } catch (error) {
      console.error('NotificationService: Failed to refresh token:', error);
      return null;
    }
  }

  // Send push notification using the new push notification service
  async sendPushNotification(toUserId, title, body, data = {}) {
    try {
      // Use the new push notification service which handles both push and Firestore
      return await pushNotificationService.sendPushNotification(toUserId, title, body, data);
    } catch (error) {
      console.error('NotificationService: Failed to send push notification:', error);
      return null;
    }
  }

  // Send friend request notification
  async sendFriendRequestNotification(toUserId, senderName) {
    return pushNotificationService.sendFriendRequestNotification(toUserId, senderName);
  }

  // Send friend request accepted notification
  async sendFriendRequestAcceptedNotification(toUserId, senderName) {
    return pushNotificationService.sendFriendRequestAcceptedNotification(toUserId, senderName);
  }

  // Send friend request declined notification
  async sendFriendRequestDeclinedNotification(toUserId, senderName) {
    return pushNotificationService.sendFriendRequestDeclinedNotification(toUserId, senderName);
  }

  // Send challenge notification
  async sendChallengeNotification(toUserId, senderName, challengeId, wordLength) {
    return pushNotificationService.sendGameChallengeNotification(toUserId, senderName, wordLength);
  }

  // Send challenge response notification
  async sendChallengeResponseNotification(toUserId, responderName, challengeId, accepted) {
    const title = accepted ? 'Challenge Accepted' : 'Challenge Declined';
    const body = accepted 
      ? `${responderName} accepted your challenge!` 
      : `${responderName} declined your challenge`;
    
    return this.sendPushNotification(
      toUserId,
      title,
      body,
      {
        type: accepted ? 'challenge_accepted' : 'challenge_declined',
        challengeId,
        responderName,
        accepted,
        timestamp: new Date().toISOString()
      }
    );
  }

  // Send game update notification
  async sendGameUpdateNotification(toUserId, gameId, message) {
    return this.sendPushNotification(
      toUserId,
      'Game Update',
      message,
      {
        type: 'game_update',
        gameId,
        timestamp: new Date().toISOString()
      }
    );
  }

  // Send game completion notification
  async sendGameCompletionNotification(toUserId, gameId, result) {
    return this.sendPushNotification(
      toUserId,
      'Game Completed',
      result,
      {
        type: 'game_completed',
        gameId,
        result,
        timestamp: new Date().toISOString()
      }
    );
  }

  // Send app update notification
  async sendAppUpdateNotification(toUserId, version = null) {
    return pushNotificationService.sendAppUpdateNotification(toUserId, version);
  }

  // Listen to user's notifications
  listenToUserNotifications(userId, callback) {
    try {
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('toUid', '==', userId),
        orderBy('timestamp', 'desc')
      );

      return onSnapshot(notificationsQuery, (snapshot) => {
        const notifications = [];
        snapshot.forEach((doc) => {
          notifications.push({ id: doc.id, ...doc.data() });
        });
        callback(notifications);
      });
    } catch (error) {
      console.error('NotificationService: Error listening to notifications:', error);
      return null;
    }
  }

  // Mark notification as read
  async markNotificationAsRead(notificationId) {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
        readAt: new Date().toISOString()
      });
      // Attempt to dismiss from device notification center as well
      try {
        await Notifications.dismissNotificationAsync(notificationId);
        console.log('NotificationService: Dismissed notification from device center:', notificationId);
      } catch (error) {
        console.error('NotificationService: Failed to dismiss notification from device:', error);
      }
      return true;
    } catch (error) {
      console.error('NotificationService: Failed to mark notification as read:', error);
      return false;
    }
  }

  // Get unread notification count
  async getUnreadNotificationCount(userId) {
    try {
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('toUid', '==', userId),
        where('read', '==', false)
      );

      const snapshot = await getDocs(notificationsQuery);
      return snapshot.size;
    } catch (error) {
      console.error('NotificationService: Failed to get unread count:', error);
      return 0;
    }
  }

  // Navigation helpers (these would integrate with your navigation system)
  navigateToChallenge(challengeId) {
    // Implement navigation to challenge screen
  }

  navigateToGame(gameId) {
    // Implement navigation to game screen
  }

  navigateToFriends() {
    // Implement navigation to friends screen
  }

  handleBackgroundChallenge(data) {
    // Handle background challenge logic
  }

  // Get current FCM token
  getCurrentToken() {
    return this.currentToken;
  }

  /**
   * Retry permission request with exponential backoff
   * @param {Function} permissionRequestFn - Function to request permissions
   * @param {Object} options - Permission request options
   * @returns {Promise<Object>} Permission result
   */
  async retryPermissionRequest(permissionRequestFn, options = {}) {
    const { showExplanation = true, forceRequest = false, silent = false } = options;
    
    for (let attempt = 1; attempt <= this.maxPermissionRetries; attempt++) {
      try {
        console.log(`NotificationService: Permission request attempt ${attempt}/${this.maxPermissionRetries}`);
        
        const result = await permissionRequestFn();
        
        if (result.status === 'granted') {
          console.log('NotificationService: ✅ Permissions granted on attempt', attempt);
          this.permissionRetryCount = 0; // Reset on success
          return result;
        }
        
        if (result.status === 'denied' && !forceRequest) {
          console.log('NotificationService: ❌ Permissions denied, not retrying');
          return result;
        }
        
        if (attempt < this.maxPermissionRetries) {
          const delay = this.permissionRetryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`NotificationService: Permission request failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        console.error(`NotificationService: Permission request attempt ${attempt} failed:`, error);
        
        if (attempt < this.maxPermissionRetries) {
          const delay = this.permissionRetryDelay * Math.pow(2, attempt - 1);
          console.log(`NotificationService: Retrying permission request in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error('NotificationService: All permission request attempts failed');
    return { status: 'denied', error: 'Max retries exceeded' };
  }

  /**
   * Utility function to handle notification permissions at app startup or user login
   * This is the main function you should call to request permissions
   * @param {Object} options - Configuration options
   * @param {boolean} options.showExplanation - Whether to show explanation dialogs
   * @param {boolean} options.forceRequest - Whether to force permission request even if previously denied
   * @param {boolean} options.silent - Whether to request silently without user interaction
   * @param {string} options.userId - User ID to save token to Firestore
   * @param {boolean} options.saveToken - Whether to automatically save token to Firestore
   * @returns {Promise<Object>} Result object with permission status and token
   */
  async handleNotificationPermissions(options = {}) {
    const {
      showExplanation = true,
      forceRequest = false,
      silent = false,
      userId = null,
      saveToken = true
    } = options;

    try {
      
      // Set current user if provided
      if (userId) {
        this.setCurrentUser(userId);
      }
      
      // Check current status
      const currentStatus = await this.checkPermissionStatus();
      
      if (currentStatus === 'granted') {
        const token = await this.getFCMToken();
        
        // Save token to Firestore if requested and user ID is available
        if (saveToken && userId && token) {
          await this.saveTokenToFirestore(userId, token);
        }
        
        return {
          success: true,
          status: 'granted',
          token,
          message: 'Notifications already enabled',
          tokenSaved: saveToken && userId && token
        };
      }

      // If silent mode, just return current status
      if (silent) {
        return {
          success: false,
          status: currentStatus,
          token: null,
          message: `Notifications ${currentStatus === 'denied' ? 'disabled' : 'not determined'}`
        };
      }

      // Request permissions based on options with retry logic
      let finalStatus;
      if (forceRequest) {
        finalStatus = await this.retryPermissionRequest(
          () => this.requestPermissionWithFallback(true),
          { showExplanation, forceRequest, silent }
        );
      } else if (showExplanation) {
        finalStatus = await this.retryPermissionRequest(
          () => this.requestPermission(true),
          { showExplanation, forceRequest, silent }
        );
      } else {
        finalStatus = await this.retryPermissionRequest(
          () => this.requestPermission(false),
          { showExplanation, forceRequest, silent }
        );
      }

      if (finalStatus === 'granted') {
        // Get FCM token
        const token = await this.getFCMToken();
        
        // Save token to Firestore if requested and user ID is available
        let tokenSaved = false;
        if (saveToken && userId && token) {
          tokenSaved = await this.saveTokenToFirestore(userId, token);
        }
        
        return {
          success: true,
          status: 'granted',
          token,
          message: 'Notifications enabled successfully',
          tokenSaved
        };
      } else {
        return {
          success: false,
          status: finalStatus,
          token: null,
          message: 'Notifications permission denied'
        };
      }
    } catch (error) {
      console.error('NotificationService: Error handling notification permissions:', error);
      return {
        success: false,
        status: 'error',
        token: null,
        message: 'Error requesting notification permissions',
        error: error.message
      };
    }
  }

  /**
   * Check if the app can request notification permissions
   * @returns {Promise<boolean>} Whether the app can ask for permissions
   */
  async canRequestPermissions() {
    try {
      return await Notifications.canAskForPermissionsAsync();
    } catch (error) {
      console.error('NotificationService: Error checking if can request permissions:', error);
      return false;
    }
  }

  /**
   * Get a user-friendly message about the current notification status
   * @returns {Promise<string>} User-friendly status message
   */
  async getNotificationStatusMessage() {
    try {
      const status = await this.checkPermissionStatus();
      const canAsk = await this.canRequestPermissions();
      
      switch (status) {
        case 'granted':
          return 'Notifications are enabled';
        case 'denied':
          if (canAsk) {
            return 'Notifications are disabled. You can enable them in settings.';
          } else {
            return 'Notifications are disabled. Please enable them in device settings.';
          }
        case 'undetermined':
          return 'Notification permissions not yet determined';
        case 'blocked':
          return 'Notifications are blocked. Please enable them in device settings.';
        default:
          return 'Notification status unknown';
      }
    } catch (error) {
      console.error('NotificationService: Error getting status message:', error);
      return 'Unable to determine notification status';
    }
  }

  /**
   * Handle user login and token management
   * This method should be called when a user logs in to ensure their token is properly managed
   * @param {string} userId - The user's ID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result object with token status
   */
  async handleUserLogin(userId, options = {}) {
    try {
      
      // Set current user
      this.setCurrentUser(userId);
      
      // Check if we already have a valid token
      if (this.currentToken && this.isValidToken(this.currentToken)) {
        await this.saveTokenToFirestore(userId, this.currentToken);
        
        return {
          success: true,
          token: this.currentToken,
          message: 'Existing token saved to Firestore',
          tokenSaved: true
        };
      }
      
      // Check permission status
      const permissionStatus = await this.checkPermissionStatus();
      
      if (permissionStatus === 'granted') {
        // Get and save new token
        const token = await this.getAndSaveToken(userId);
        if (token) {
          return {
            success: true,
            token,
            message: 'Token obtained and saved successfully',
            tokenSaved: true
          };
        } else {
          return {
            success: false,
            token: null,
            message: 'Failed to obtain FCM token',
            tokenSaved: false
          };
        }
      } else {
        // Permissions not granted, return status
        return {
          success: false,
          token: null,
          message: 'Notification permissions not granted',
          permissionStatus,
          tokenSaved: false
        };
      }
    } catch (error) {
      console.error('NotificationService: Error handling user login:', error);
      return {
        success: false,
        token: null,
        message: 'Error handling user login',
        error: error.message,
        tokenSaved: false
      };
    }
  }

  /**
   * Get comprehensive token information for debugging
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} Token information object
   */
  async getTokenInfo(userId) {
    try {
      const currentToken = this.currentToken;
      const storedToken = await this.getUserPushToken(userId);
      const permissionStatus = await this.checkPermissionStatus();
      
      return {
        currentToken,
        storedToken,
        permissionStatus,
        isValid: this.isValidToken(currentToken),
        isStored: !!storedToken,
        isCurrent: currentToken === storedToken,
        platform: Platform.OS,
        deviceId: Device.deviceName || 'unknown',
        appVersion: Device.osVersion || 'unknown'
      };
    } catch (error) {
      console.error('NotificationService: Error getting token info:', error);
      return {
        error: error.message
      };
    }
  }

  cleanup() {
    // if (this.foregroundListener) {
    //   this.foregroundListener();
    //   this.foregroundListener = null;
    // }
    
    if (this.notificationResponseListener) {
      this.notificationResponseListener.remove();
      this.notificationResponseListener = null;
    }
    
    // if (this.onTokenRefreshUnsubscribe) {
    //   this.onTokenRefreshUnsubscribe();
    //   this.onTokenRefreshUnsubscribe = null;
    // }
    
    // Clear current state
    this.currentToken = null;
    this.currentUserId = null;
    this.lastNotification = null;
    this.permissionStatus = null;
  }
}

// Export the class instead of an instance to prevent immediate initialization
export default NotificationService;

// Create a lazy-loaded singleton instance
let _instance = null;

export const getNotificationService = () => {
  if (!_instance) {
    _instance = new NotificationService();
  }
  return _instance;
};

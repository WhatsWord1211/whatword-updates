import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
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
    };
  },
});

class PushNotificationService {
  constructor() {
    this.expoPushToken = null;
    this.notificationListener = null;
    this.responseListener = null;
  }

  /**
   * Initialize push notifications and get Expo push token
   */
  async initialize() {
    try {
      // Register for push notifications
      const token = await this.registerForPushNotificationsAsync();
      if (token) {
        this.expoPushToken = token;
        console.log('PushNotificationService: Expo push token:', token);
        return token;
      }
      return null;
    } catch (error) {
      console.error('PushNotificationService: Failed to initialize:', error);
      return null;
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
        lightColor: '#8B5CF6',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
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
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) {
          throw new Error('Project ID not found');
        }
        
        token = (await Notifications.getExpoPushTokenAsync({
          projectId,
        })).data;
        console.log('PushNotificationService: Got Expo push token:', token);
      } catch (error) {
        console.error('PushNotificationService: Failed to get Expo push token:', error);
        return;
      }
    } else {
      Alert.alert('Must use physical device for Push Notifications');
    }

    return token;
  }

  /**
   * Save push token to user's Firestore document
   */
  async savePushTokenToFirestore(userId, token) {
    try {
      await setDoc(doc(db, 'users', userId), {
        expoPushToken: token,
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
        return userDoc.data().expoPushToken || null;
      }
      return null;
    } catch (error) {
      console.error('PushNotificationService: Failed to get user push token:', error);
      return null;
    }
  }

  /**
   * Send push notification using Expo's push notification service
   */
  async sendPushNotification(toUserId, title, body, data = {}) {
    try {
      // Get the recipient's push token
      const pushToken = await this.getUserPushToken(toUserId);
      
      if (!pushToken) {
        console.log('PushNotificationService: No push token found for user:', toUserId);
        // Still save to Firestore for in-app notifications
        await this.saveNotificationToFirestore(toUserId, title, body, data);
        return null;
      }

      // Determine appropriate channel based on notification type
      let channelId = 'default';
      if (data.type === 'friend_request' || data.type === 'friend_request_accepted') {
        channelId = 'friend_requests';
      } else if (data.type === 'game_challenge' || data.type === 'game_started' || data.type === 'game_completed' || data.type === 'game_move') {
        channelId = 'game_updates';
      }

      // Send push notification via Expo's service
      const message = {
        to: pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: data,
        priority: 'high',
        channelId: channelId,
        badge: 1, // Set badge count
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
      
      if (result.data && result.data[0] && result.data[0].status === 'ok') {
        console.log('PushNotificationService: Push notification sent successfully');
        // Also save to Firestore for in-app notifications
        await this.saveNotificationToFirestore(toUserId, title, body, data);
        return result.data[0].id;
      } else {
        console.error('PushNotificationService: Failed to send push notification:', result);
        // Fallback to Firestore notification
        await this.saveNotificationToFirestore(toUserId, title, body, data);
        return null;
      }
    } catch (error) {
      console.error('PushNotificationService: Error sending push notification:', error);
      // Fallback to Firestore notification
      await this.saveNotificationToFirestore(toUserId, title, body, data);
      return null;
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
   * Set up notification listeners
   */
  setupNotificationListeners() {
    // Listener for notifications received while app is running
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('PushNotificationService: Notification received:', notification);
    });

    // Listener for when user taps on notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('PushNotificationService: Notification response:', response);
      const data = response.notification.request.content.data;
      
      // Handle different notification types
      if (data.type === 'challenge') {
        // Navigate to challenges screen
        this.handleChallengeNotification(data);
      } else if (data.type === 'friend_request') {
        // Navigate to friend requests screen
        this.handleFriendRequestNotification(data);
      } else if (data.type === 'game_move' || data.type === 'game_completed') {
        // Navigate to game screen
        this.handleGameNotification(data);
      }
    });
  }

  /**
   * Handle challenge notification tap
   */
  handleChallengeNotification(data) {
    // This would typically use navigation service
    console.log('PushNotificationService: Handling challenge notification:', data);
    // NavigationService.navigate('PendingChallenges');
  }

  /**
   * Handle friend request notification tap
   */
  handleFriendRequestNotification(data) {
    // This would typically use navigation service
    console.log('PushNotificationService: Handling friend request notification:', data);
    // NavigationService.navigate('FriendRequests');
  }

  /**
   * Handle game notification tap
   */
  handleGameNotification(data) {
    // This would typically use navigation service
    console.log('PushNotificationService: Handling game notification:', data);
    // NavigationService.navigate('Game', { gameId: data.gameId });
  }

  /**
   * Clean up listeners
   */
  cleanup() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
  }

  /**
   * Test push notification
   */
  async sendTestNotification() {
    if (!this.expoPushToken) {
      console.log('PushNotificationService: No push token available for test');
      return false;
    }

    try {
      const message = {
        to: this.expoPushToken,
        sound: 'default',
        title: '🧪 Test Notification',
        body: 'This is a test push notification from WhatWord!',
        data: { type: 'test' },
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
      console.log('PushNotificationService: Test notification result:', result);
      return result.data && result.data[0] && result.data[0].status === 'ok';
    } catch (error) {
      console.error('PushNotificationService: Test notification failed:', error);
      return false;
    }
  }
}

// Export singleton instance
const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
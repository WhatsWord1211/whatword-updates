import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import notificationService from './notificationService';

// Example component showing how to use notification permissions
export default function NotificationExamples() {
  
  // Example 1: Basic permission request at app startup
  const handleBasicPermissionRequest = async () => {
    try {
      const result = await notificationService.handleNotificationPermissions({
        showExplanation: true,
        forceRequest: false,
        silent: false
      });
      
      if (result.success) {
        Alert.alert('Success', result.message);
        console.log('FCM Token:', result.token);
      } else {
        Alert.alert('Permission Denied', result.message);
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request notification permissions');
    }
  };

  // Example 2: Silent permission check (for checking status without user interaction)
  const handleSilentPermissionCheck = async () => {
    try {
      const result = await notificationService.handleNotificationPermissions({
        silent: true
      });
      
      Alert.alert('Permission Status', result.message);
      console.log('Current status:', result.status);
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  // Example 3: Force permission request (for retrying after user denied)
  const handleForcePermissionRequest = async () => {
    try {
      const result = await notificationService.handleNotificationPermissions({
        showExplanation: true,
        forceRequest: true,
        silent: false
      });
      
      if (result.success) {
        Alert.alert('Success', result.message);
      } else {
        Alert.alert('Permission Denied', result.message);
      }
    } catch (error) {
      console.error('Error forcing permission request:', error);
    }
  };

  // Example 4: Get detailed permission information
  const handleGetPermissionDetails = async () => {
    try {
      const details = await notificationService.getPermissionDetails();
      const statusMessage = await notificationService.getNotificationStatusMessage();
      
      Alert.alert(
        'Permission Details',
        `Status: ${details.status}\nPlatform: ${details.platform}\nDevice: ${details.deviceName}\nCan Ask Again: ${details.canAskAgain}\n\n${statusMessage}`
      );
    } catch (error) {
      console.error('Error getting permission details:', error);
    }
  };

  // Example 5: Check if notifications are enabled
  const handleCheckNotificationsEnabled = async () => {
    try {
      const isEnabled = await notificationService.areNotificationsEnabled();
      const canAsk = await notificationService.canRequestPermissions();
      
      Alert.alert(
        'Notification Status',
        `Notifications Enabled: ${isEnabled ? 'Yes' : 'No'}\nCan Request Permissions: ${canAsk ? 'Yes' : 'No'}`
      );
    } catch (error) {
      console.error('Error checking notification status:', error);
    }
  };

  // Example 6: Get current FCM token
  const handleGetFCMToken = async () => {
    try {
      const token = notificationService.getCurrentToken();
      if (token) {
        Alert.alert('FCM Token', token);
        console.log('Current FCM Token:', token);
      } else {
        Alert.alert('No Token', 'No FCM token available. Please request permissions first.');
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
  };

  // Example 7: Handle user login with token management
  const handleUserLogin = async () => {
    try {
      // Simulate user login with a test user ID
      const testUserId = 'test_user_123';
      
      const result = await notificationService.handleUserLogin(testUserId);
      
      if (result.success) {
        Alert.alert(
          'Login Success', 
          `Token: ${result.token ? 'Obtained' : 'None'}\nSaved to Firestore: ${result.tokenSaved ? 'Yes' : 'No'}`
        );
        console.log('Login result:', result);
      } else {
        Alert.alert('Login Issue', result.message);
      }
    } catch (error) {
      console.error('Error handling user login:', error);
      Alert.alert('Error', 'Failed to handle user login');
    }
  };

  // Example 8: Get comprehensive token information
  const handleGetTokenInfo = async () => {
    try {
      const testUserId = 'test_user_123';
      const tokenInfo = await notificationService.getTokenInfo(testUserId);
      
      if (tokenInfo.error) {
        Alert.alert('Error', tokenInfo.error);
        return;
      }
      
      const infoText = `
Platform: ${tokenInfo.platform}
Device: ${tokenInfo.deviceId}
App Version: ${tokenInfo.appVersion}
Permission Status: ${tokenInfo.permissionStatus}
Current Token: ${tokenInfo.currentToken ? 'Available' : 'None'}
Stored Token: ${tokenInfo.isStored ? 'Yes' : 'No'}
Token Valid: ${tokenInfo.isValid ? 'Yes' : 'No'}
Token Current: ${tokenInfo.isCurrent ? 'Yes' : 'No'}
      `.trim();
      
      Alert.alert('Token Information', infoText);
      console.log('Token info:', tokenInfo);
    } catch (error) {
      console.error('Error getting token info:', error);
      Alert.alert('Error', 'Failed to get token information');
    }
  };

  // Example 9: Request permissions and save token to Firestore
  const handleRequestPermissionsWithTokenSave = async () => {
    try {
      const testUserId = 'test_user_123';
      
      const result = await notificationService.handleNotificationPermissions({
        showExplanation: true,
        forceRequest: false,
        silent: false,
        userId: testUserId,
        saveToken: true
      });
      
      if (result.success) {
        Alert.alert(
          'Success', 
          `${result.message}\nToken: ${result.token ? 'Obtained' : 'None'}\nSaved to Firestore: ${result.tokenSaved ? 'Yes' : 'No'}`
        );
        console.log('Permission result with token save:', result);
      } else {
        Alert.alert('Permission Denied', result.message);
      }
    } catch (error) {
      console.error('Error requesting permissions with token save:', error);
      Alert.alert('Error', 'Failed to request permissions');
    }
  };

  // Example 10: Refresh and update token
  const handleRefreshToken = async () => {
    try {
      const testUserId = 'test_user_123';
      
      const newToken = await notificationService.refreshAndUpdateToken(testUserId);
      
      if (newToken) {
        Alert.alert('Token Refreshed', `New token: ${newToken}`);
        console.log('Token refreshed:', newToken);
      } else {
        Alert.alert('No Change', 'Token is already current');
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      Alert.alert('Error', 'Failed to refresh token');
    }
  };

  // Example 11: Test notification reception
  const handleTestNotificationReception = async () => {
    try {
      const result = await notificationService.testNotificationReception();
      Alert.alert('Test Notification Reception', result.message);
      console.log('Test result:', result);
    } catch (error) {
      console.error('Error testing notification reception:', error);
      Alert.alert('Error', 'Failed to test notification reception');
    }
  };

  // Example 12: Show a local notification
  const handleShowLocalNotification = async () => {
    try {
      await notificationService.showLocalNotification({
        title: 'Local Notification',
        body: 'This is a test local notification!',
        data: { type: 'test', timestamp: new Date().toISOString() },
        sound: true,
        priority: 'high'
      });
      Alert.alert('Success', 'Local notification sent successfully');
    } catch (error) {
      console.error('Error showing local notification:', error);
      Alert.alert('Error', 'Failed to show local notification');
    }
  };

  // Example 13: Schedule a delayed notification
  const handleScheduleNotification = async () => {
    try {
      const notificationId = await notificationService.scheduleNotification({
        title: 'Scheduled Notification',
        body: 'This notification was scheduled for 5 seconds later.',
        data: { type: 'scheduled', timestamp: new Date().toISOString() },
        sound: true,
        priority: 'default'
      }, { seconds: 5 });
      
      if (notificationId) {
        Alert.alert('Success', `Notification scheduled with ID: ${notificationId}`);
      } else {
        Alert.alert('Error', 'Failed to schedule notification');
      }
    } catch (error) {
      console.error('Error scheduling notification:', error);
      Alert.alert('Error', 'Failed to schedule notification');
    }
  };

  // Example 14: Get pending notifications
  const handleGetPendingNotifications = async () => {
    try {
      const notifications = await notificationService.getPendingNotifications();
      const message = notifications.length > 0 
        ? `Found ${notifications.length} pending notification(s)`
        : 'No pending notifications';
      Alert.alert('Pending Notifications', message);
      console.log('Pending notifications:', notifications);
    } catch (error) {
      console.error('Error getting pending notifications:', error);
      Alert.alert('Error', 'Failed to get pending notifications');
    }
  };

  // Example 15: Cancel all notifications
  const handleCancelAllNotifications = async () => {
    try {
      const result = await notificationService.cancelAllNotifications();
      if (result) {
        Alert.alert('Success', 'All notifications cancelled successfully');
      } else {
        Alert.alert('Error', 'Failed to cancel all notifications');
      }
    } catch (error) {
      console.error('Error canceling all notifications:', error);
      Alert.alert('Error', 'Failed to cancel all notifications');
    }
  };

  // Example 16: Get background notifications
  const handleGetBackgroundNotifications = async () => {
    try {
      const pendingNotifications = notificationService.getPendingBackgroundNotifications();
      const message = pendingNotifications.hasPending 
        ? `Found pending notifications:\nGame Invites: ${pendingNotifications.gameInvites.length}\nFriend Requests: ${pendingNotifications.friendRequests.length}`
        : 'No pending background notifications';
      Alert.alert('Background Notifications', message);
      console.log('Background notifications:', pendingNotifications);
    } catch (error) {
      console.error('Error getting background notifications:', error);
      Alert.alert('Error', 'Failed to get background notifications');
    }
  };

  // Example 17: Clear background notifications
  const handleClearBackgroundNotifications = async () => {
    try {
      notificationService.clearPendingBackgroundNotifications();
      Alert.alert('Success', 'Background notifications cleared successfully');
    } catch (error) {
      console.error('Error clearing background notifications:', error);
      Alert.alert('Error', 'Failed to clear background notifications');
    }
  };

  // Example 18: Update notification settings
  const handleUpdateNotificationSettings = async () => {
    try {
      notificationService.updateNotificationSettings({
        sound: true,
        vibration: true,
        badge: true,
        priority: 'high'
      });
      Alert.alert('Success', 'Notification settings updated successfully');
    } catch (error) {
      console.error('Error updating notification settings:', error);
      Alert.alert('Error', 'Failed to update notification settings');
    }
  };

  // Example 19: Get current notification settings
  const handleGetNotificationSettings = async () => {
    try {
      const settings = notificationService.getNotificationSettings();
      const message = `Sound: ${settings.sound}\nVibration: ${settings.vibration}\nBadge: ${settings.badge}\nPriority: ${settings.priority}`;
      Alert.alert('Current Notification Settings', message);
      console.log('Current notification settings:', settings);
    } catch (error) {
      console.error('Error getting notification settings:', error);
      Alert.alert('Error', 'Failed to get notification settings');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notification Permission Examples</Text>
      
      <TouchableOpacity style={styles.button} onPress={handleBasicPermissionRequest}>
        <Text style={styles.buttonText}>Request Permissions (Basic)</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleSilentPermissionCheck}>
        <Text style={styles.buttonText}>Check Permission Status (Silent)</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleForcePermissionRequest}>
        <Text style={styles.buttonText}>Force Permission Request</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleGetPermissionDetails}>
        <Text style={styles.buttonText}>Get Permission Details</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleCheckNotificationsEnabled}>
        <Text style={styles.buttonText}>Check if Enabled</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleGetFCMToken}>
        <Text style={styles.buttonText}>Get FCM Token</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleUserLogin}>
        <Text style={styles.buttonText}>Handle User Login</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleGetTokenInfo}>
        <Text style={styles.buttonText}>Get Token Info</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleRequestPermissionsWithTokenSave}>
        <Text style={styles.buttonText}>Request Permissions + Save Token</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={handleRefreshToken}>
        <Text style={styles.buttonText}>Refresh Token</Text>
      </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Reception Examples</Text>
          
          <TouchableOpacity style={styles.button} onPress={handleTestNotificationReception}>
            <Text style={styles.buttonText}>Test Notification Reception</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={handleShowLocalNotification}>
            <Text style={styles.buttonText}>Show Local Notification</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={handleScheduleNotification}>
            <Text style={styles.buttonText}>Schedule Delayed Notification</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={handleGetPendingNotifications}>
            <Text style={styles.buttonText}>Get Pending Notifications</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={handleCancelAllNotifications}>
            <Text style={styles.buttonText}>Cancel All Notifications</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={handleGetBackgroundNotifications}>
            <Text style={styles.buttonText}>Get Background Notifications</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={handleClearBackgroundNotifications}>
            <Text style={styles.buttonText}>Clear Background Notifications</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={handleUpdateNotificationSettings}>
            <Text style={styles.buttonText}>Update Notification Settings</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={handleGetNotificationSettings}>
            <Text style={styles.buttonText}>Get Notification Settings</Text>
          </TouchableOpacity>
        </View>
      
      <Text style={styles.note}>
        Note: These examples demonstrate how to use the notification permission system.
        In a real app, you would typically call these functions at app startup or user login.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 30,
    fontStyle: 'italic',
  },
  section: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#444',
  },
});

// Example usage in other components:

/*
// At app startup (e.g., in App.js or MainApplication.js)
import notificationService from './screens/notificationService';

// Initialize notification service
useEffect(() => {
  const initializeNotifications = async () => {
    await notificationService.initialize();
    
    // Request permissions with explanation
    const result = await notificationService.handleNotificationPermissions({
      showExplanation: true,
      forceRequest: false,
      silent: false
    });
    
    if (result.success) {
      console.log('Notifications enabled:', result.token);
      // Update user's push token in your backend
      await updateUserPushToken(result.token);
    } else {
      console.log('Notifications not enabled:', result.message);
    }
  };
  
  initializeNotifications();
}, []);

// At user login
const handleUserLogin = async (user) => {
  // ... other login logic ...
  
  // Handle notification permissions and token management
  const notificationResult = await notificationService.handleUserLogin(user.uid);
  
  if (notificationResult.success) {
    console.log('User login successful, token saved:', notificationResult.tokenSaved);
    // Token is automatically saved to Firestore in users/{userId}/pushToken
  } else {
    console.log('Notification setup incomplete:', notificationResult.message);
  }
};

// Check permission status before sending notifications
const sendNotification = async (userId, message) => {
  const isEnabled = await notificationService.areNotificationsEnabled();
  
  if (isEnabled) {
    // Send push notification
    await notificationService.sendPushNotification(userId, 'New Message', message);
  } else {
    // Show in-app notification or handle differently
    console.log('Notifications disabled, showing in-app notification');
  }
};

// Get user's push token from Firestore
const getUserToken = async (userId) => {
  const token = await notificationService.getUserPushToken(userId);
  return token;
};

// Refresh and update user's token
const refreshUserToken = async (userId) => {
  const newToken = await notificationService.refreshAndUpdateToken(userId);
  if (newToken) {
    console.log('Token refreshed and updated in Firestore');
  }
  return newToken;
};

// Get comprehensive token information for debugging
const debugTokenInfo = async (userId) => {
  const tokenInfo = await notificationService.getTokenInfo(userId);
  console.log('Token debug info:', tokenInfo);
  return tokenInfo;
};
*/

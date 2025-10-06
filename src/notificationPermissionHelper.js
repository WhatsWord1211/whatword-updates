import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import pushNotificationService from './pushNotificationService';

/**
 * Notification Permission Helper - Industry Standard UX
 * 
 * Best practices:
 * - Never ask for permissions immediately on app launch
 * - Show custom dialog explaining value before system prompt
 * - Request at contextually relevant moments
 * - Don't ask again if user denied (respect their choice)
 * - Provide way to enable later in Settings
 */

const PERMISSION_KEYS = {
  HAS_ASKED: 'notification_permission_asked',
  HAS_DENIED: 'notification_permission_denied',
  CONTEXT_SHOWN: 'notification_context_shown_',
};

class NotificationPermissionHelper {
  constructor() {
    this.isAsking = false;
  }

  /**
   * Check if we should show permission request
   * Don't ask if user already denied or already has permissions
   */
  async shouldAskForPermissions() {
    try {
      // Check if already granted
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        return false; // Already have permissions
      }

      // Check if user denied before
      const hasDenied = await AsyncStorage.getItem(PERMISSION_KEYS.HAS_DENIED);
      if (hasDenied === 'true') {
        return false; // User denied, don't ask again
      }

      return true;
    } catch (error) {
      console.error('NotificationPermissionHelper: Error checking if should ask:', error);
      return false;
    }
  }

  /**
   * Show custom pre-permission dialog explaining value
   * Industry standard: Explain WHY before showing system prompt
   */
  showCustomDialog(context = 'default') {
    return new Promise((resolve) => {
      const contexts = {
        friend_request: {
          title: 'Stay Connected with Friends',
          message: 'Never miss important updates from your friends!\n\n• Friends accept your requests\n• You receive new friend requests\n• Friends challenge you to games\n\nYou can always change this in Settings.',
        },
        challenge: {
          title: 'Never Miss a Game',
          message: 'Stay in the action with real-time game updates!\n\n• Friends accept your challenges\n• It\'s your turn to play\n• Games are completed\n\nYou can always change this in Settings.',
        },
        game_complete: {
          title: 'Stay in the Loop',
          message: 'Keep up with all your game activity!\n\n• Your opponents complete their turns\n• Games are finished\n• Friends want to play again\n\nYou can always change this in Settings.',
        },
        default: {
          title: 'Enable Notifications',
          message: 'Stay updated with all your WhatWord activity!\n\n• Friend requests & acceptances\n• Game challenges & completions\n• Your turn reminders\n\nYou can always change this in Settings.',
        },
      };

      const dialog = contexts[context] || contexts.default;

      Alert.alert(
        dialog.title,
        dialog.message,
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'Enable',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });
  }

  /**
   * Request notification permissions with proper flow
   * 1. Show custom dialog (explain value)
   * 2. If user agrees, show system prompt
   * 3. Handle result appropriately
   */
  async requestPermissions(context = 'default', userId = null) {
    try {
      // Prevent multiple simultaneous requests
      if (this.isAsking) {
        console.log('NotificationPermissionHelper: Already asking for permissions');
        return { granted: false, reason: 'already_asking' };
      }

      this.isAsking = true;

      // Check if we should ask
      const shouldAsk = await this.shouldAskForPermissions();
      if (!shouldAsk) {
        console.log('NotificationPermissionHelper: Should not ask (already granted or denied)');
        this.isAsking = false;
        return { granted: false, reason: 'should_not_ask' };
      }

      // Show custom dialog first (industry standard)
      const userWantsNotifications = await this.showCustomDialog(context);
      
      if (!userWantsNotifications) {
        console.log('NotificationPermissionHelper: User declined custom dialog');
        this.isAsking = false;
        return { granted: false, reason: 'user_declined_dialog' };
      }

      // User agreed to custom dialog, now show system prompt
      console.log('NotificationPermissionHelper: User agreed, showing system prompt...');
      
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

      console.log('NotificationPermissionHelper: System prompt result:', status);

      // Mark that we asked
      await AsyncStorage.setItem(PERMISSION_KEYS.HAS_ASKED, 'true');

      if (status === 'granted') {
        // Success! Initialize push notifications
        console.log('NotificationPermissionHelper: ✅ Permission granted');
        
        if (userId) {
          // Initialize push notification service
          const pushToken = await pushNotificationService.initialize(userId);
          
          if (pushToken) {
            await pushNotificationService.savePushTokenToFirestore(userId, pushToken);
            pushNotificationService.setupNotificationListeners();
            console.log('NotificationPermissionHelper: Push notifications initialized');
          }
        }

        this.isAsking = false;
        return { granted: true, status };
      } else {
        // User denied system prompt
        console.log('NotificationPermissionHelper: ❌ Permission denied');
        await AsyncStorage.setItem(PERMISSION_KEYS.HAS_DENIED, 'true');
        
        this.isAsking = false;
        return { granted: false, reason: 'denied', status };
      }
    } catch (error) {
      console.error('NotificationPermissionHelper: Error requesting permissions:', error);
      this.isAsking = false;
      return { granted: false, reason: 'error', error };
    }
  }

  /**
   * Request at contextually relevant moment
   * Tracks which contexts we've shown to avoid spam
   */
  async requestAtContext(context, userId = null) {
    try {
      // Check if we've already shown this context
      const contextKey = PERMISSION_KEYS.CONTEXT_SHOWN + context;
      const hasShownContext = await AsyncStorage.getItem(contextKey);
      
      if (hasShownContext === 'true') {
        console.log(`NotificationPermissionHelper: Already shown context "${context}"`);
        return { granted: false, reason: 'context_already_shown' };
      }

      // Mark context as shown
      await AsyncStorage.setItem(contextKey, 'true');

      // Request permissions with this context
      return await this.requestPermissions(context, userId);
    } catch (error) {
      console.error('NotificationPermissionHelper: Error in requestAtContext:', error);
      return { granted: false, reason: 'error', error };
    }
  }

  /**
   * Check current permission status
   */
  async getPermissionStatus() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status;
    } catch (error) {
      console.error('NotificationPermissionHelper: Error getting permission status:', error);
      return 'undetermined';
    }
  }

  /**
   * Reset permission state (for testing/debugging)
   */
  async resetPermissionState() {
    try {
      await AsyncStorage.multiRemove([
        PERMISSION_KEYS.HAS_ASKED,
        PERMISSION_KEYS.HAS_DENIED,
        PERMISSION_KEYS.CONTEXT_SHOWN + 'friend_request',
        PERMISSION_KEYS.CONTEXT_SHOWN + 'challenge',
        PERMISSION_KEYS.CONTEXT_SHOWN + 'game_complete',
      ]);
      console.log('NotificationPermissionHelper: Permission state reset');
    } catch (error) {
      console.error('NotificationPermissionHelper: Error resetting state:', error);
    }
  }

  /**
   * Show settings guidance if user denied
   */
  showSettingsGuidance() {
    const settingsInstructions = Platform.select({
      ios: 'Go to Settings > WhatWord > Notifications and enable them.',
      android: 'Go to Settings > Apps > WhatWord > Notifications and enable them.',
      default: 'Go to your device settings and enable notifications for WhatWord.',
    });

    Alert.alert(
      'Notifications Disabled',
      `To receive game updates and friend notifications:\n\n${settingsInstructions}\n\nYou can re-enable them anytime in your device settings.`,
      [{ text: 'OK' }]
    );
  }
}

export default new NotificationPermissionHelper();


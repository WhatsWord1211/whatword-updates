import { Alert, AppState } from 'react-native';
import { playSound } from './soundsUtil';

// Track app state to avoid showing notifications when app is active
let appState = AppState.currentState;

AppState.addEventListener('change', (nextAppState) => {
  appState = nextAppState;
});

// Simple notification system using React Native Alert
export const showNotification = (title, message, type = 'info') => {
  // Only show notifications if app is not in foreground
  if (appState === 'active') {
    // App is active, just play sound
    switch (type) {
      case 'challenge':
        playSound('chime').catch(() => {});
        break;
      case 'friendRequest':
        playSound('chime').catch(() => {});
        break;
      default:
        playSound('chime').catch(() => {});
    }
    return;
  }

  // App is in background, show alert and play sound
  switch (type) {
    case 'challenge':
      playSound('chime').catch(() => {});
      break;
    case 'friendRequest':
      playSound('chime').catch(() => {});
      break;
    default:
      playSound('chime').catch(() => {});
  }

  // Show alert
  Alert.alert(title, message, [
    {
      text: 'OK',
      style: 'default'
    }
  ]);
};

export const showChallengeNotification = (fromUsername, difficulty) => {
  showNotification(
    'New Challenge! 🎯',
    `${fromUsername} has challenged you to a ${difficulty} duel!`,
    'challenge'
  );
};

export const showFriendRequestNotification = (fromUsername) => {
  showNotification(
    'Friend Request 👥',
    `${fromUsername} wants to be your friend!`,
    'friendRequest'
  );
};

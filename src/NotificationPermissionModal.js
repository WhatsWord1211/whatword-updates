import React, { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from './ThemeContext';
import styles from './styles';

const NotificationPermissionModal = ({ 
  visible, 
  onClose, 
  onEnable, 
  context = 'default' 
}) => {
  const { updateNavigationBar } = useTheme();
  
  // Update navigation bar when modal appears/disappears
  useEffect(() => {
    if (updateNavigationBar && visible) {
      // Immediate update
      updateNavigationBar();
      // Also update after a small delay to catch any system resets
      const timeout = setTimeout(() => {
        updateNavigationBar();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [visible, updateNavigationBar]);
  const contexts = {
    friend_request: {
      title: 'Stay Connected with Friends',
      message: 'Never miss important updates from your friends!',
      benefits: [
        'Friends accept your requests',
        'You receive new friend requests', 
        'Friends challenge you to games'
      ],
    },
    challenge: {
      title: 'Never Miss a Game',
      message: 'Stay in the action with real-time game updates!',
      benefits: [
        'Friends accept your challenges',
        'It\'s your turn to play',
        'Games are completed'
      ],
    },
    game_complete: {
      title: 'Stay in the Loop',
      message: 'Keep up with all your game activity!',
      benefits: [
        'Your opponents complete their turns',
        'Games are finished',
        'Friends want to play again'
      ],
    },
    default: {
      title: 'Enable Notifications',
      message: 'Stay updated with all your WhatWord activity!',
      benefits: [
        'Friend requests & acceptances',
        'Game challenges & completions',
        'Your turn reminders'
      ],
    },
  };

  const dialog = contexts[context] || contexts.default;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.notificationPermissionPopup}>
          <Text style={styles.notificationPermissionTitle}>
            {dialog.title}
          </Text>
          <Text style={styles.notificationPermissionMessage}>
            {dialog.message}
          </Text>
          
          <View style={styles.notificationPermissionBenefits}>
            {dialog.benefits.map((benefit, index) => (
              <View key={index} style={styles.notificationPermissionBenefitItem}>
                <View style={styles.notificationPermissionBenefitDot} />
                <Text style={styles.notificationPermissionBenefitText}>
                  {benefit}
                </Text>
              </View>
            ))}
          </View>
          
          <Text style={[styles.notificationPermissionMessage, { fontSize: 12, marginBottom: 0 }]}>
            You can always change this in Settings.
          </Text>
          
          <View style={styles.notificationPermissionActions}>
            <TouchableOpacity
              style={[
                styles.notificationPermissionButton,
                styles.notificationPermissionButtonSecondary
              ]}
              onPress={onClose}
            >
              <Text style={[
                styles.notificationPermissionButtonText,
                styles.notificationPermissionButtonTextSecondary
              ]}>
                Not Now
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.notificationPermissionButton,
                styles.notificationPermissionButtonPrimary
              ]}
              onPress={onEnable}
            >
              <Text style={[
                styles.notificationPermissionButtonText,
                styles.notificationPermissionButtonTextPrimary
              ]}>
                Enable
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default NotificationPermissionModal;

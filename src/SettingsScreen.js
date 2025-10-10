import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Modal, TextInput, StatusBar, Keyboard, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { playSound } from './soundsUtil';
import settingsService from './settingsService';
import { getThemeColors } from './theme';
import styles from './styles';
import adService from './adService';
import pushNotificationService from './pushNotificationService';
import * as Notifications from 'expo-notifications';
import { auth } from './firebase';

const SettingsScreen = () => {
  const navigation = useNavigation();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [cacheSize, setCacheSize] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerType, setTimePickerType] = useState('start');
  const [tempTime, setTempTime] = useState('');
  const [adStats, setAdStats] = useState({});
  const [notificationDiagnostics, setNotificationDiagnostics] = useState(null);
  const [fixingNotifications, setFixingNotifications] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    loadSettings();
    loadCacheSize();
    loadAdStats();
    loadNotificationDiagnostics();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await settingsService.initialize();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCacheSize = async () => {
    try {
      const size = await settingsService.getCacheSize();
      setCacheSize(size);
    } catch (error) {
      console.error('Failed to load cache size:', error);
    }
  };

  const loadAdStats = async () => {
    try {
      const stats = adService.getAdStats();
      setAdStats(stats);
    } catch (error) {
      console.error('Failed to load ad stats:', error);
    }
  };

  const requestNotificationPermissions = async () => {
    try {
      console.log('SettingsScreen: Requesting notification permissions...');
      
      // Check current permission status first
      const { status: currentStatus } = await Notifications.getPermissionsAsync();
      console.log('SettingsScreen: Current permission status:', currentStatus);
      
      if (currentStatus === 'granted') {
        Alert.alert(
          '✅ Notifications Already Enabled',
          'You are already receiving push notifications for friend requests, game challenges, and updates.',
          [{ text: 'Great!' }]
        );
        return;
      }
      
      const pushToken = await pushNotificationService.initialize();
      
      if (pushToken) {
        Alert.alert(
          '✅ Notifications Enabled',
          'You will now receive push notifications for friend requests, game challenges, and updates.',
          [{ text: 'Great!' }]
        );
      } else {
        Alert.alert(
          '❌ Permission Denied',
          'Please enable notifications in your device settings to receive push notifications.\n\nGo to Settings > Apps > WhatWord > Notifications and enable them.',
          [
            { text: 'Cancel' },
            { text: 'Try Again', onPress: requestNotificationPermissions }
          ]
        );
      }
    } catch (error) {
      console.error('SettingsScreen: Failed to request notification permissions:', error);
      Alert.alert(
        'Error',
        'Failed to request notification permissions. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const updateSetting = async (key, value) => {
    try {
      const success = await settingsService.updateSetting(key, value);
      if (success) {
        setSettings(prev => ({ ...prev, [key]: value }));
        playSound('chime');
      }
    } catch (error) {
      console.error('Failed to update setting:', error);
      Alert.alert('Error', 'Failed to update setting. Please try again.');
    }
  };

  const handleThemeChange = (theme) => {
    updateSetting('theme', theme);
  };

  const handleCacheClear = async () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached game data and temporary files. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await settingsService.clearCache();
              if (success) {
                await loadCacheSize();
                Alert.alert('Success', 'Cache cleared successfully!');
                playSound('chime');
              }
            } catch (error) {
              console.error('Failed to clear cache:', error);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            }
          }
        }
      ]
    );
  };





  const handleGameDataClear = async () => {
    Alert.alert(
      'Clear Game Data',
      'This will clear all saved games and progress. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await settingsService.clearGameData();
              if (success) {
                Alert.alert('Success', 'Game data cleared successfully!');
                playSound('chime');
              }
            } catch (error) {
              console.error('Failed to clear game data:', error);
              Alert.alert('Error', 'Failed to clear game data. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleResetSettings = async () => {
    Alert.alert(
      'Reset Settings',
      'This will reset all settings to their default values. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await settingsService.resetSettings();
              if (success) {
                await loadSettings();
                Alert.alert('Success', 'Settings reset to defaults!');
                playSound('chime');
              }
            } catch (error) {
              console.error('Failed to reset settings:', error);
              Alert.alert('Error', 'Failed to reset settings. Please try again.');
            }
          }
        }
      ]
    );
  };

  const openTimePicker = (type) => {
    setTimePickerType(type);
    setTempTime(settings[type === 'start' ? 'quietHoursStart' : 'quietHoursEnd']);
    setShowTimePicker(true);
  };

  const saveTime = () => {
    const key = timePickerType === 'start' ? 'quietHoursStart' : 'quietHoursEnd';
    updateSetting(key, tempTime);
    setShowTimePicker(false);
  };

  const loadNotificationDiagnostics = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (userId) {
        const diagnostics = await pushNotificationService.getDiagnostics(userId);
        setNotificationDiagnostics(diagnostics);
      }
    } catch (error) {
      console.error('Failed to load notification diagnostics:', error);
    }
  };

  const handleFixNotifications = async () => {
    try {
      setFixingNotifications(true);
      const userId = auth.currentUser?.uid;
      
      if (!userId) {
        Alert.alert('Error', 'No user logged in');
        return;
      }

      console.log('SettingsScreen: Starting notification fix for user:', userId);
      
      const result = await pushNotificationService.forceRefreshToken(userId);
      console.log('SettingsScreen: Fix notification result:', result);
      
      // Reload diagnostics
      await loadNotificationDiagnostics();
      
      if (result.success) {
        Alert.alert(
          '✅ Notifications Fixed!',
          'Your push notification token has been registered successfully. You should now receive background notifications.\n\nToken: ' + (result.steps.find(s => s.token)?.token || 'N/A'),
          [{ text: 'Great!', onPress: () => playSound('chime').catch(() => {}) }]
        );
      } else {
        const errorSteps = result.steps?.map(s => `${s.step}: ${s.status || s.action || 'done'}`).join('\n') || '';
        Alert.alert(
          '❌ Fix Failed',
          `Could not fix notifications.\n\nError: ${result.error || 'Unknown error'}\n\nSteps:\n${errorSteps}`,
          [
            { text: 'View Details', onPress: () => setShowDiagnostics(true) },
            { text: 'OK' }
          ]
        );
      }
    } catch (error) {
      console.error('SettingsScreen: Fix notifications error:', error);
      Alert.alert('Error', 'Failed to fix notifications: ' + error.message);
    } finally {
      setFixingNotifications(false);
    }
  };

  const theme = getThemeColors(settings.theme || 'dark');

  if (loading) {
    return (
      <SafeAreaView style={[styles.screenContainer, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textPrimary }]}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screenContainer, { backgroundColor: theme.background }]}>
      {/* Show status bar on menu screens */}
      <StatusBar hidden={false} barStyle="light-content" />
  
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.settingsBackButton}
          onPress={() => {
            playSound('backspace').catch(() => {});
            navigation.goBack();
          }}
        >
          <Text style={[styles.settingsBackButtonText, { color: theme.textPrimary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Theme Settings */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Appearance</Text>
          
          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Theme</Text>
            <View style={styles.themeSelector}>
              <TouchableOpacity
                style={[
                  styles.themeOption,
                  { backgroundColor: settings.theme === 'dark' ? theme.primary : theme.surfaceLight }
                ]}
                onPress={() => handleThemeChange('dark')}
              >
                <Text style={[styles.themeOptionText, { color: settings.theme === 'dark' ? theme.textInverse : theme.textSecondary }]}>
                  🌙 Dark
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.themeOption,
                  { backgroundColor: settings.theme === 'light' ? theme.primary : theme.surfaceLight }
                ]}
                onPress={() => handleThemeChange('light')}
              >
                <Text style={[styles.themeOptionText, { color: settings.theme === 'light' ? theme.textInverse : theme.textSecondary }]}>
                  ☀️ Light
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Audio Settings */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Audio</Text>
          
          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Master Volume</Text>
            <View style={styles.volumeSlider}>
              <TouchableOpacity
                style={[styles.volumeButton, { backgroundColor: theme.primary }]}
                onPress={() => updateSetting('masterVolume', Math.max(0, settings.masterVolume - 0.1))}
              >
                <Text style={[styles.volumeButtonText, { color: theme.textInverse }]}>-</Text>
              </TouchableOpacity>
              <Text style={[styles.volumeText, { color: theme.textSecondary }]}>
                {Math.round(settings.masterVolume * 100)}%
              </Text>
              <TouchableOpacity
                style={[styles.volumeButton, { backgroundColor: theme.primary }]}
                onPress={() => updateSetting('masterVolume', Math.min(1, settings.masterVolume + 0.1))}
              >
                <Text style={[styles.volumeButtonText, { color: theme.textInverse }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Sound Effects</Text>
            <Switch
              value={settings.soundEffectsVolume > 0}
              onValueChange={(value) => updateSetting('soundEffectsVolume', value ? 1.0 : 0)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.soundEffectsVolume > 0 ? theme.textInverse : theme.textMuted}
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Vibration</Text>
            <Switch
              value={settings.vibrationEnabled}
              onValueChange={(value) => updateSetting('vibrationEnabled', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.vibrationEnabled ? theme.textInverse : theme.textMuted}
            />
          </View>
        </View>

        {/* Notification Settings */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Notifications</Text>
          
          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Push Notifications</Text>
            <Switch
              value={settings.pushNotifications}
              onValueChange={(value) => updateSetting('pushNotifications', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.pushNotifications ? theme.textInverse : theme.textMuted}
            />
          </View>

          <TouchableOpacity
            style={[styles.settingButton, { backgroundColor: theme.primary }]}
            onPress={requestNotificationPermissions}
          >
            <Text style={[styles.settingButtonText, { color: theme.textInverse }]}>
              🔔 Request Notification Permissions
            </Text>
          </TouchableOpacity>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Friend Requests</Text>
            <Switch
              value={settings.friendRequestNotifications}
              onValueChange={(value) => updateSetting('friendRequestNotifications', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.friendRequestNotifications ? theme.textInverse : theme.textMuted}
              disabled={!settings.pushNotifications}
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Game Challenges</Text>
            <Switch
              value={settings.gameChallengeNotifications}
              onValueChange={(value) => updateSetting('gameChallengeNotifications', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.gameChallengeNotifications ? theme.textInverse : theme.textMuted}
              disabled={!settings.pushNotifications}
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Achievements</Text>
            <Switch
              value={settings.achievementNotifications}
              onValueChange={(value) => updateSetting('achievementNotifications', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.achievementNotifications ? theme.textInverse : theme.textMuted}
              disabled={!settings.pushNotifications}
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Daily Reminders</Text>
            <Switch
              value={settings.reminderNotifications}
              onValueChange={(value) => updateSetting('reminderNotifications', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.reminderNotifications ? theme.textInverse : theme.textMuted}
              disabled={!settings.pushNotifications}
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Quiet Hours</Text>
            <Switch
              value={settings.quietHoursEnabled}
              onValueChange={(value) => updateSetting('quietHoursEnabled', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.quietHoursEnabled ? theme.textInverse : theme.textMuted}
              disabled={!settings.pushNotifications}
            />
          </View>

          {settings.quietHoursEnabled && (
            <>
              <View style={styles.settingItem}>
                <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Start Time</Text>
                <TouchableOpacity
                  style={[styles.timeButton, { backgroundColor: theme.surfaceLight }]}
                  onPress={() => openTimePicker('start')}
                >
                  <Text style={[styles.timeButtonText, { color: theme.textPrimary }]}>
                    {settings.quietHoursStart}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.settingItem}>
                <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>End Time</Text>
                <TouchableOpacity
                  style={[styles.timeButton, { backgroundColor: theme.surfaceLight }]}
                  onPress={() => openTimePicker('end')}
                >
                  <Text style={[styles.timeButtonText, { color: theme.textPrimary }]}>
                    {settings.quietHoursEnd}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Notification Diagnostics & Fix */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Notification Troubleshooting</Text>
          
          <View style={[styles.cacheManagementContainer, { 
            backgroundColor: theme.surfaceLight,
            borderColor: theme.border
          }]}>
            <Text style={[styles.cacheInfoLabel, { color: theme.textSecondary }]}>
              🔧 Fix Push Notifications
            </Text>
            
            <Text style={[styles.cacheDescription, { color: theme.textMuted }]}>
              If you're not receiving background notifications, tap the button below to force re-registration of your push notification token.
            </Text>
            
            {notificationDiagnostics && (
              <View style={{ marginVertical: 8 }}>
                <Text style={[styles.cacheDescription, { color: theme.textPrimary, fontWeight: 'bold' }]}>
                  Current Status:
                </Text>
                <Text style={[styles.cacheDescription, { color: theme.textMuted, fontSize: 12 }]}>
                  • Permissions: {notificationDiagnostics.permissions?.status || 'unknown'}
                </Text>
                <Text style={[styles.cacheDescription, { color: theme.textMuted, fontSize: 12 }]}>
                  • Token in Firestore: {notificationDiagnostics.firestore?.hasExpoPushToken ? '✅ Yes' : '❌ No'}
                </Text>
                <Text style={[styles.cacheDescription, { color: theme.textMuted, fontSize: 12 }]}>
                  • Service initialized: {notificationDiagnostics.service?.isInitialized ? '✅ Yes' : '❌ No'}
                </Text>
                {showDiagnostics && notificationDiagnostics.firestore?.expoPushToken && (
                  <Text style={[styles.cacheDescription, { color: theme.textMuted, fontSize: 10, marginTop: 4 }]}>
                    Token: {notificationDiagnostics.firestore.expoPushToken}
                  </Text>
                )}
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.enhancedActionButton, { 
                backgroundColor: fixingNotifications ? theme.border : theme.accent,
                borderColor: fixingNotifications ? theme.border : theme.accentDark
              }]}
              onPress={handleFixNotifications}
              disabled={fixingNotifications}
            >
              {fixingNotifications ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator color={theme.textInverse} size="small" />
                  <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse, marginLeft: 8 }]}>
                    Fixing...
                  </Text>
                </View>
              ) : (
                <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse }]}>
                  🔧 Fix Notifications Now
                </Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.settingButton, { backgroundColor: theme.surfaceLight, marginTop: 8 }]}
              onPress={() => {
                setShowDiagnostics(!showDiagnostics);
                loadNotificationDiagnostics();
              }}
            >
              <Text style={[styles.settingButtonText, { color: theme.textSecondary, fontSize: 12 }]}>
                {showDiagnostics ? '▼ Hide Details' : '► Show Details'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cache & Data Management */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Data & Storage</Text>
          
          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Cache Size</Text>
            <Text style={[styles.settingValue, { color: theme.textMuted }]}>{cacheSize} MB</Text>
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Auto-save</Text>
            <Switch
              value={settings.autoSaveEnabled}
              onValueChange={(value) => updateSetting('autoSaveEnabled', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.autoSaveEnabled ? theme.textInverse : theme.textMuted}
            />
          </View>

          <View style={[styles.cacheManagementContainer, { 
            backgroundColor: theme.surfaceLight,
            borderColor: theme.border
          }]}>
            <View style={styles.cacheInfoRow}>
              <Text style={[styles.cacheInfoLabel, { color: theme.textSecondary }]}>🗄️ Cache Size:</Text>
              <Text style={[styles.cacheInfoValue, { color: theme.textPrimary }]}>{cacheSize}</Text>
            </View>
            
            <Text style={[styles.cacheDescription, { color: theme.textMuted }]}>
              Clear temporary files and cached data to free up storage
            </Text>
            
            <TouchableOpacity
              style={[styles.enhancedActionButton, { 
                backgroundColor: theme.warning,
                borderColor: theme.warningDark
              }]}
              onPress={handleCacheClear}
            >
              <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse }]}>🗑️ Clear Cache</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.cacheManagementContainer, { 
            backgroundColor: theme.surfaceLight,
            borderColor: theme.border
          }]}>
            <Text style={[styles.cacheInfoLabel, { color: theme.textSecondary }]}>
              🎮 Game Progress
            </Text>
            
            <Text style={[styles.cacheDescription, { color: theme.textMuted }]}>
              This will permanently delete all saved games and progress. This action cannot be undone.
            </Text>
            
            <TouchableOpacity
              style={[styles.enhancedActionButton, { 
                backgroundColor: theme.error,
                borderColor: theme.errorDark
              }]}
              onPress={handleGameDataClear}
            >
              <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse }]}>⚠️ Clear Game Data</Text>
            </TouchableOpacity>
          </View>
        </View>



        {/* Privacy & Social Settings */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Privacy & Social</Text>
          
          <View style={[styles.cacheManagementContainer, { 
            backgroundColor: theme.surfaceLight,
            borderColor: theme.border
          }]}>
            <Text style={[styles.cacheInfoLabel, { color: theme.textSecondary }]}>
              🔒 Privacy Controls
            </Text>
            
            <Text style={[styles.cacheDescription, { color: theme.textMuted }]}>
              Control who can find you, send friend requests, and challenge you to games
            </Text>
            
            <TouchableOpacity
              style={[styles.enhancedActionButton, { 
                backgroundColor: theme.accent,
                borderColor: theme.accentDark
              }]}
              onPress={() => navigation.navigate('PrivacySettings')}
            >
              <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse }]}>🔒 Privacy Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Legal & Privacy Documents */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Legal & Privacy</Text>
          
          <View style={[styles.cacheManagementContainer, { 
            backgroundColor: theme.surfaceLight,
            borderColor: theme.border
          }]}>
            <Text style={[styles.cacheInfoLabel, { color: theme.textSecondary }]}>
              📋 Legal Information
            </Text>
            
            <Text style={[styles.cacheDescription, { color: theme.textMuted }]}>
              View our privacy policy, terms of service, and data collection practices
            </Text>
            
            <TouchableOpacity
              style={[styles.enhancedActionButton, { 
                backgroundColor: theme.primary,
                borderColor: theme.primaryDark
              }]}
              onPress={() => navigation.navigate('Legal')}
            >
              <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse }]}>📋 Legal Documents</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Reset Settings */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Reset Options</Text>
          
          <View style={[styles.cacheManagementContainer, { 
            backgroundColor: theme.surfaceLight,
            borderColor: theme.border
          }]}>
            <Text style={[styles.cacheInfoLabel, { color: theme.textSecondary }]}>
              ⚙️ Settings Reset
            </Text>
            
            <Text style={[styles.cacheDescription, { color: theme.textMuted }]}>
              This will reset all settings to their default values. This action cannot be undone.
            </Text>
            
            <TouchableOpacity
              style={[styles.enhancedActionButton, { 
                backgroundColor: theme.error,
                borderColor: theme.errorDark
              }]}
              onPress={handleResetSettings}
            >
              <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse }]}>⚠️ Reset All Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </TouchableWithoutFeedback>

      {/* Time Picker Modal */}
      <Modal visible={showTimePicker} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Set {timePickerType === 'start' ? 'Start' : 'End'} Time
            </Text>
            
            <TextInput
              style={[styles.timeInput, { 
                backgroundColor: theme.surfaceLight,
                color: theme.textPrimary,
                borderColor: theme.border
              }]}
              value={tempTime}
              onChangeText={setTempTime}
              placeholder="HH:MM"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.border }]}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={saveTime}
              >
                <Text style={[styles.modalButtonText, { color: theme.textInverse }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default SettingsScreen;

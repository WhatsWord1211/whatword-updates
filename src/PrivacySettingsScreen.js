import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playSound } from './soundsUtil';
import settingsService from './settingsService';
import { getThemeColors } from './theme';
import styles from './styles';

const PrivacySettingsScreen = () => {
  const navigation = useNavigation();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [showPrivacyLevelModal, setShowPrivacyLevelModal] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await settingsService.initialize();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    } finally {
      setLoading(false);
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
      console.error('Failed to update privacy setting:', error);
      Alert.alert('Error', 'Failed to update setting. Please try again.');
    }
  };

  const setPrivacyLevel = async (level) => {
    let updates = {};
    
    switch (level) {
      case 'open':
        updates = {
          profileVisibility: 'public',
          allowFriendRequests: 'everyone',
          allowGameChallenges: 'everyone',
          shareStatistics: true,
          showOnLeaderboards: true,
          allowUsernameSearch: true,
          showInFriendSuggestions: true
        };
        break;
        
      case 'balanced':
        updates = {
          profileVisibility: 'friends',
          allowFriendRequests: 'everyone', // Fixed: Allow requests from anyone to grow network
          allowGameChallenges: 'friends',
          shareStatistics: true,
          showOnLeaderboards: true,
          allowUsernameSearch: true,
          showInFriendSuggestions: true
        };
        break;
        
      case 'private':
        updates = {
          profileVisibility: 'private',
          allowFriendRequests: 'none',
          allowGameChallenges: 'none',
          shareStatistics: false,
          showOnLeaderboards: false,
          allowUsernameSearch: false,
          showInFriendSuggestions: false
        };
        break;
    }
    
    try {
      const success = await settingsService.updateSettings(updates);
      if (success) {
        setSettings(prev => ({ ...prev, ...updates }));
        setShowPrivacyLevelModal(false);
        Alert.alert('Success', `Privacy level set to ${level}!`);
        playSound('chime');
      }
    } catch (error) {
      console.error('Failed to update privacy level:', error);
      Alert.alert('Error', 'Failed to update privacy level. Please try again.');
    }
  };

  const getCurrentPrivacyLevel = () => {
    const { profileVisibility, allowFriendRequests, allowGameChallenges, shareStatistics } = settings;
    
    if (profileVisibility === 'private' && allowFriendRequests === 'none') {
      return 'private';
    } else if (profileVisibility === 'friends' && allowFriendRequests === 'friends') {
      return 'balanced';
    } else {
      return 'open';
    }
  };

  const getPrivacyLevelDescription = (level) => {
    switch (level) {
      case 'open':
        return 'Maximum social interaction. Your profile is public and discoverable by everyone.';
      case 'balanced':
        return 'Friends-only visibility. Your profile is visible to friends and friends of friends.';
      case 'private':
        return 'Maximum privacy. Your profile is hidden and only accessible to existing friends.';
      default:
        return 'Custom privacy settings.';
    }
  };

  const theme = getThemeColors(settings.theme || 'dark');

  if (loading) {
    return (
      <SafeAreaView style={[styles.screenContainer, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textPrimary }]}>Loading privacy settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentLevel = getCurrentPrivacyLevel();

  return (
    <SafeAreaView style={[styles.screenContainer, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            playSound('backspace');
            navigation.goBack();
          }}
        >
          <Text style={[styles.backButtonText, { color: theme.textPrimary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Privacy & Social</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView 
        style={[styles.scrollContent, { paddingBottom: 20 }]} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        {/* Privacy Level Presets */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Privacy Level</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
            Quick presets or customize individually
          </Text>
          
          <TouchableOpacity
            style={[styles.privacyLevelButton, { 
              backgroundColor: currentLevel === 'open' ? theme.primary : theme.surfaceLight 
            }]}
            onPress={() => setPrivacyLevel('open')}
          >
            <Text style={[styles.privacyLevelText, { 
              color: currentLevel === 'open' ? theme.textInverse : theme.textPrimary 
            }]}>
              🌐 Open
            </Text>
            <Text style={[styles.privacyLevelSubtext, { 
              color: currentLevel === 'open' ? theme.textInverse : theme.textMuted 
            }]}>
              Public profile, discoverable by everyone
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.privacyLevelButton, { 
              backgroundColor: currentLevel === 'balanced' ? theme.primary : theme.surfaceLight 
            }]}
            onPress={() => setPrivacyLevel('balanced')}
          >
            <Text style={[styles.privacyLevelText, { 
              color: currentLevel === 'balanced' ? theme.textInverse : theme.textPrimary 
            }]}>
              🤝 Balanced
            </Text>
            <Text style={[styles.privacyLevelSubtext, { 
              color: currentLevel === 'balanced' ? theme.textInverse : theme.textMuted 
            }]}>
              Friends-only profile, accept requests from anyone
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.privacyLevelButton, { 
              backgroundColor: currentLevel === 'private' ? theme.primary : theme.surfaceLight 
            }]}
            onPress={() => setPrivacyLevel('private')}
          >
            <Text style={[styles.privacyLevelText, { 
              color: currentLevel === 'private' ? theme.textInverse : theme.textPrimary 
            }]}>
              🔒 Private
            </Text>
            <Text style={[styles.privacyLevelSubtext, { 
              color: currentLevel === 'private' ? theme.textInverse : theme.textMuted 
            }]}>
              Hidden profile, invite-only friends
            </Text>
          </TouchableOpacity>
        </View>

        {/* Profile Visibility */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface, marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Profile Visibility</Text>
          
          <View style={styles.settingItemWithSelector}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Profile Visibility</Text>
            <View style={styles.privacySelector}>
              {['public', 'friends', 'private'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.privacyOption,
                    { backgroundColor: settings.profileVisibility === option ? theme.primary : theme.surfaceLight }
                  ]}
                  onPress={() => updateSetting('profileVisibility', option)}
                >
                  <Text style={[styles.privacyOptionText, { 
                    color: settings.profileVisibility === option ? theme.textInverse : theme.textSecondary 
                  }]}>
                    {option === 'public' ? '🌐 Public' : 
                     option === 'friends' ? '🤝 Friends' : '🔒 Private'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Show on Leaderboards</Text>
            <Switch
              value={settings.showOnLeaderboards !== false}
              onValueChange={(value) => updateSetting('showOnLeaderboards', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.showOnLeaderboards !== false ? theme.textInverse : theme.textMuted}
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Share Statistics</Text>
            <Switch
              value={settings.shareStatistics !== false}
              onValueChange={(value) => updateSetting('shareStatistics', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.shareStatistics !== false ? theme.textInverse : theme.textMuted}
            />
          </View>
        </View>

        {/* Friend Discovery */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface, marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Friend Discovery</Text>
          
          <View style={styles.settingItemWithSelector}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Allow Friend Requests</Text>
            <View style={styles.privacySelector}>
              {['everyone', 'friends', 'none'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.privacyOption,
                    { backgroundColor: settings.allowFriendRequests === option ? theme.primary : theme.surfaceLight }
                  ]}
                  onPress={() => updateSetting('allowFriendRequests', option)}
                >
                  <Text style={[styles.privacyOptionText, { 
                    color: settings.allowFriendRequests === option ? theme.textInverse : theme.textSecondary 
                  }]}>
                    {option === 'everyone' ? '🌐 Everyone' : 
                     option === 'friends' ? '🤝 Friends' : '❌ None'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Allow Username Search</Text>
            <Switch
              value={settings.allowUsernameSearch !== false}
              onValueChange={(value) => updateSetting('allowUsernameSearch', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.allowUsernameSearch !== false ? theme.textInverse : theme.textMuted}
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Show in Friend Suggestions</Text>
            <Switch
              value={settings.showInFriendSuggestions !== false}
              onValueChange={(value) => updateSetting('showInFriendSuggestions', value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={settings.showInFriendSuggestions !== false ? theme.textInverse : theme.textMuted}
            />
          </View>
        </View>

        {/* Game Challenges */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface, marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Game Challenges</Text>
          
          <View style={styles.settingItemWithSelector}>
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Allow Game Challenges</Text>
            <View style={styles.privacySelector}>
              {['everyone', 'friends', 'none'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.privacyOption,
                    { backgroundColor: settings.allowGameChallenges === option ? theme.primary : theme.surfaceLight }
                  ]}
                  onPress={() => updateSetting('allowGameChallenges', option)}
                >
                  <Text style={[styles.privacyOptionText, { 
                    color: settings.allowGameChallenges === option ? theme.textInverse : theme.textSecondary 
                  }]}>
                    {option === 'everyone' ? '🌐 Everyone' : 
                     option === 'friends' ? '🤝 Friends' : '❌ None'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Information Section */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface, marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Friend Discovery</Text>
          
          <View style={styles.infoContainer}>
            <Text style={[styles.infoTitle, { color: theme.textSecondary }]}>Current:</Text>
            <Text style={[styles.infoText, { color: theme.textMuted }]}>
              • Username search only{'\n'}
              • No public directory{'\n'}
              • Leaderboards: friends only
            </Text>
            
            <Text style={[styles.infoTitle, { color: theme.textSecondary, marginTop: 12 }]}>With Privacy:</Text>
            <Text style={[styles.infoText, { color: theme.textMuted }]}>
              • Control discoverability{'\n'}
              • Limit friend requests{'\n'}
              • Choose challenge privacy
            </Text>
          </View>
          
                                  <TouchableOpacity
              style={[styles.enhancedActionButton, { 
                backgroundColor: theme.primary, 
                borderColor: theme.primaryDark,
                marginTop: 16 
              }]}
              onPress={() => navigation.navigate('FriendDiscovery')}
            >
              <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse }]}>
                Enhanced Discovery
              </Text>
            </TouchableOpacity>
        </View>

        {/* Reset Privacy Settings */}
        <View style={[styles.settingsSection, { backgroundColor: theme.surface, marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Reset Options</Text>
          
                                  <TouchableOpacity
              style={[styles.enhancedActionButton, { 
                backgroundColor: theme.warning,
                borderColor: theme.warningDark
              }]}
              onPress={() => {
                Alert.alert(
                  'Reset Privacy Settings',
                  'This will reset all privacy settings to their default values (Open/Public).',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => setPrivacyLevel('open')
                    }
                  ]
                );
              }}
            >
              <Text style={[styles.enhancedActionButtonText, { color: theme.textInverse }]}>Reset to Default</Text>
            </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PrivacySettingsScreen;

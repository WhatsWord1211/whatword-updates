import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styles from './styles';
import { playSound } from './soundsUtil';
import { useTheme } from './ThemeContext';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showRankUpPopup, setShowRankUpPopup] = useState(false);
  const [rankUpData, setRankUpData] = useState({
    oldRank: '',
    newRank: '',
    difficulty: '',
    averageScore: 0
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadUserProfile(currentUser);
      }
    });

    return unsubscribe;
  }, []);

  // Monitor profile changes for rank updates
  useEffect(() => {
    if (userProfile) {
      // Check for rank changes when profile updates
      const currentRank = getRankTitleFromProfile(userProfile);
      if (currentRank !== 'Unranked') {
        // Store current rank for comparison
        const prevRank = userProfile.previousRank || 'Unranked';
        if (prevRank !== currentRank) {
          // Update the profile to store the previous rank
          updateDoc(doc(db, 'users', user?.uid), {
            previousRank: currentRank
          }).catch(console.error);
          
          // Show rank-up popup if it's an advancement (not from Unranked)
          if (prevRank !== 'Unranked') {
            checkRankChange({ ...userProfile, previousRank: prevRank }, userProfile);
          }
        }
      }
    }
  }, [userProfile, user]);

  const loadUserProfile = async (currentUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const profileData = userDoc.data();
        setUserProfile(profileData);
        setEditedProfile({
          username: profileData.username || '',
          displayName: profileData.displayName || '',
          email: profileData.email || currentUser.email || ''
        });
      } else {
        // Create profile if it doesn't exist
        const newProfile = {
          uid: currentUser.uid,
          username: currentUser.email ? currentUser.email.split('@')[0] : `Player${Math.floor(Math.random() * 10000)}`,
          displayName: currentUser.displayName || currentUser.email ? currentUser.email.split('@')[0] : 'Player',
          email: currentUser.email || '',
          createdAt: new Date(),
          lastLogin: new Date(),
          // Solo mode stats by difficulty
          easyGamesPlayed: 0,
          easyAverageScore: 0,
          regularGamesPlayed: 0,
          regularAverageScore: 0,
          hardGamesPlayed: 0,
          hardAverageScore: 0,
          totalScore: 0,
          // PvP mode stats
          pvpGamesPlayed: 0,
          pvpGamesWon: 0,
          pvpWinRate: 0,
          previousRank: 'Unranked',
          friends: [],
          isAnonymous: false,
          // Premium status
          isPremium: false,
          hardModeUnlocked: false
        };
        
        await updateDoc(doc(db, 'users', currentUser.uid), newProfile);
        setUserProfile(newProfile);
        setEditedProfile({
          username: newProfile.username,
          displayName: newProfile.displayName,
          email: newProfile.email
        });
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      if (!editedProfile.username.trim() || !editedProfile.displayName.trim()) {
        Alert.alert('Error', 'Username and display name cannot be empty');
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        username: editedProfile.username.trim(),
        displayName: editedProfile.displayName.trim(),
        email: editedProfile.email.trim()
      });

      setUserProfile(prev => ({
        ...prev,
        username: editedProfile.username.trim(),
        displayName: editedProfile.displayName.trim(),
        email: editedProfile.email.trim()
      }));

      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
      playSound('chime');
    } catch (error) {
      console.error('Failed to update profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      // Delete user data from Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        deletedAt: new Date(),
        isDeleted: true
      });

      // Clear local storage
      await AsyncStorage.clear();

      // Sign out user
      await auth.signOut();

      Alert.alert('Account Deleted', 'Your account has been deleted successfully.');
      navigation.navigate('Auth');
    } catch (error) {
      console.error('Failed to delete account:', error);
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      // Don't navigate manually - let App.js handle the auth state change
      // navigation.navigate('Auth'); // Removed this line
    } catch (error) {
      console.error('Failed to sign out:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };



  const getRankTitle = () => {
    if (!userProfile) return 'Unranked';
    
    // Get difficulty-specific averages (these should represent last 15 games)
    const easyAvg = userProfile.easyAverageScore || 0;
    const regularAvg = userProfile.regularAverageScore || 0;
    const hardAvg = userProfile.hardAverageScore || 0;
    
    // Check if player has played any games
    if (easyAvg === 0 && regularAvg === 0 && hardAvg === 0) {
      return 'Unranked';
    }
    
    // Rank progression based on performance thresholds
    if (hardAvg > 0 && hardAvg <= 8) return 'Word Master';
    if (regularAvg > 0 && regularAvg <= 8) return 'Word Expert';
    if (regularAvg > 0 && regularAvg <= 12) return 'Word Pro';
    if (easyAvg > 0 && easyAvg <= 8) return 'Word Enthusiast';
    if (easyAvg > 0 && easyAvg <= 15) return 'Word Learner';
    if (easyAvg > 0 && easyAvg <= 20) return 'Rookie';
    
    // Default fallback
    return 'Unranked';
  };

  // Function to check for rank changes and show popup
  const checkRankChange = (oldProfile, newProfile) => {
    if (!oldProfile || !newProfile) return;
    
    const oldRank = getRankTitleFromProfile(oldProfile);
    const newRank = getRankTitleFromProfile(newProfile);
    
    // Only show popup when advancing from Unranked or to a higher rank
    if (oldRank !== newRank && oldRank !== 'Rookie' && newRank !== 'Unranked') {
      // Determine which difficulty led to the rank change
      let difficulty = '';
      let averageScore = 0;
      
      if (newProfile.hardAverageScore > 0 && newProfile.hardAverageScore <= 8) {
        difficulty = 'Hard Mode (6 letters)';
        averageScore = newProfile.hardAverageScore;
      } else if (newProfile.regularAverageScore > 0 && newProfile.regularAverageScore <= 8) {
        difficulty = 'Regular Mode (5 letters)';
        averageScore = newProfile.regularAverageScore;
      } else if (newProfile.easyAverageScore > 0 && newProfile.easyAverageScore <= 15) {
        difficulty = 'Easy Mode (4 letters)';
        averageScore = newProfile.easyAverageScore;
      }
      
      setRankUpData({
        oldRank,
        newRank,
        difficulty,
        averageScore
      });
      setShowRankUpPopup(true);
      
      // Play celebration sound
      playSound('congratulations').catch(() => {});
    }
  };

  // Helper function to get rank title from profile data
  const getRankTitleFromProfile = (profile) => {
    if (!profile) return 'Unranked';
    
    const easyAvg = profile.easyAverageScore || 0;
    const regularAvg = profile.regularAverageScore || 0;
    const hardAvg = profile.hardAverageScore || 0;
    
    // Check if player has played any games
    if (easyAvg === 0 && regularAvg === 0 && hardAvg === 0) {
      return 'Unranked';
    }
    
    if (hardAvg > 0 && hardAvg <= 8) return 'Word Master';
    if (regularAvg > 0 && regularAvg <= 8) return 'Word Expert';
    if (regularAvg > 0 && regularAvg <= 12) return 'Word Pro';
    if (easyAvg > 0 && easyAvg <= 8) return 'Word Enthusiast';
    if (easyAvg > 0 && easyAvg <= 15) return 'Word Learner';
    if (easyAvg > 0 && easyAvg <= 20) return 'Rookie';
    
    return 'Unranked';
  };

  // Helper function to get level title based on games played and performance
  const getLevelTitle = () => {
    if (!userProfile) return 'Level 1 - Beginner';
    
    const totalGames = (userProfile.easyGamesPlayed || 0) + 
                      (userProfile.regularGamesPlayed || 0) + 
                      (userProfile.hardGamesPlayed || 0) + 
                      (userProfile.pvpGamesPlayed || 0);
    
    const easyAvg = userProfile.easyAverageScore || 0;
    const regularAvg = userProfile.regularAverageScore || 0;
    const hardAvg = userProfile.hardAverageScore || 0;
    
    // Level 1: Beginner (0-4 games)
    if (totalGames <= 4) return 'Level 1 - Beginner';
    
    // Level 2: Novice (5-9 games)
    if (totalGames <= 9) return 'Level 2 - Novice';
    
    // Level 3: Apprentice (10-19 games)
    if (totalGames <= 19) return 'Level 3 - Apprentice';
    
    // Level 4: Adept (20-39 games)
    if (totalGames <= 39) return 'Level 4 - Adept';
    
    // Level 5: Skilled (40-69 games)
    if (totalGames <= 69) return 'Level 5 - Skilled';
    
    // Level 6: Veteran (70-99 games)
    if (totalGames <= 99) return 'Level 6 - Veteran';
    
    // Level 7: Elite (100-149 games)
    if (totalGames <= 149) return 'Level 7 - Elite';
    
    // Level 8: Master (150-199 games)
    if (totalGames <= 199) return 'Level 8 - Master';
    
    // Level 9: Grandmaster (200-299 games)
    if (totalGames <= 299) return 'Level 9 - Grandmaster';
    
    // Level 10: Legend (300+ games)
    return 'Level 10 - Legend';
  };



  if (loading) {
    return (
      <SafeAreaView style={[styles.screenContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screenContainer, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1, width: '100%' }}>
        {/* Rank Display */}
        <View style={styles.rankDisplayContainer}>
          <View style={styles.rankBadge}>
            <Text style={[styles.rankTitle, { color: colors.textPrimary }]}>🏆 {getRankTitle()}</Text>
            <Text style={[styles.rankSubtitle, { color: colors.textSecondary }]}>Your Current Rank</Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={[styles.levelTitle, { color: colors.textPrimary }]}>⭐ {getLevelTitle()}</Text>
            <Text style={[styles.levelSubtitle, { color: colors.textSecondary }]}>Your Current Level</Text>
          </View>
        </View>



        {/* Solo Mode Stats */}
        <View style={styles.statsContainer}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🎯 Solo Mode Stats</Text>
          
          {/* Easy Mode */}
          <View style={styles.difficultySection}>
            <Text style={styles.difficultyTitle}>
              🟢 Easy <Text style={styles.scoreHighlight}>{userProfile?.easyAverageScore ? userProfile.easyAverageScore.toFixed(2) : 'N/A'}</Text> Avg Attempts
            </Text>
          </View>

          {/* Regular Mode */}
          <View style={styles.difficultySection}>
            <Text style={styles.difficultyTitle}>
              🟡 Regular <Text style={styles.scoreHighlight}>{userProfile?.regularAverageScore ? userProfile.regularAverageScore.toFixed(2) : 'N/A'}</Text> Avg Attempts
            </Text>
          </View>

          {/* Hard Mode */}
          <View style={styles.difficultySection}>
            <Text style={styles.difficultyTitle}>
              🔴 Hard <Text style={styles.scoreHighlight}>{userProfile?.hardAverageScore ? userProfile.hardAverageScore.toFixed(2) : 'N/A'}</Text> Avg Attempts
            </Text>
          </View>
        </View>

        {/* PvP Mode Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>⚔️ PvP Mode Stats</Text>
          
          {/* Easy Difficulty PvP Stats */}
          <View style={styles.difficultyStatsContainer}>
            <Text style={styles.difficultyTitle}>
              🟢 Easy <Text style={styles.scoreHighlight}>{userProfile?.easyPvpWinPercentage ? userProfile.easyPvpWinPercentage.toFixed(1) : 0}%</Text> Win Rate
            </Text>
          </View>

          {/* Regular Difficulty PvP Stats */}
          <View style={styles.difficultyStatsContainer}>
            <Text style={styles.difficultyTitle}>
              🟡 Regular <Text style={styles.scoreHighlight}>{userProfile?.regularPvpWinPercentage ? userProfile.regularPvpWinPercentage.toFixed(1) : 0}%</Text> Win Rate
            </Text>
          </View>

          {/* Hard Difficulty PvP Stats */}
          <View style={styles.difficultyStatsContainer}>
            <Text style={styles.difficultyTitle}>
              🔴 Hard <Text style={styles.scoreHighlight}>{userProfile?.hardPvpWinPercentage ? userProfile.hardPvpWinPercentage.toFixed(1) : 0}%</Text> Win Rate
            </Text>
          </View>

          {/* Overall PvP Stats (if available) */}
          {userProfile?.pvpGamesPlayed > 0 && (
            <View style={styles.difficultyStatsContainer}>
              <Text style={styles.difficultyTitle}>
                Overall PvP <Text style={styles.scoreHighlight}>{userProfile?.pvpWinRate || 0}%</Text> Win Rate
              </Text>
            </View>
          )}
        </View>

        {/* Profile Information */}
        <View style={styles.profileSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile Information</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(!isEditing)}
            >
              <Text style={styles.editButtonText}>
                {isEditing ? 'Cancel' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>

          {isEditing ? (
            <View style={styles.editForm}>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#9CA3AF"
                value={editedProfile.username}
                onChangeText={(text) => setEditedProfile(prev => ({ ...prev, username: text }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Display Name"
                placeholderTextColor="#9CA3AF"
                value={editedProfile.displayName}
                onChangeText={(text) => setEditedProfile(prev => ({ ...prev, displayName: text }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#9CA3AF"
                value={editedProfile.email}
                onChangeText={(text) => setEditedProfile(prev => ({ ...prev, email: text }))}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveProfile}
              >
                <Text style={styles.buttonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.profileInfo}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Username:</Text>
                <Text style={styles.infoValue}>{userProfile?.username || 'Not set'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Display Name:</Text>
                <Text style={styles.infoValue}>{userProfile?.displayName || 'Not set'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email:</Text>
                <Text style={styles.infoValue}>{userProfile?.email || 'Not set'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Member Since:</Text>
                <Text style={styles.infoValue}>
                  {userProfile?.createdAt ? new Date(userProfile.createdAt.toDate()).toLocaleDateString() : 'Unknown'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Settings */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <TouchableOpacity
            style={styles.button}
            onPress={async () => {
              navigation.navigate('Settings');
              try {
                await playSound('toggleTab');
              } catch (error) {
                // Ignore sound errors
              }
            }}
          >
            <Text style={styles.buttonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.button, styles.deleteButton]}
            onPress={() => setShowDeleteModal(true)}
          >
            <Text style={styles.buttonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Rank-Up Popup Modal */}
      <Modal visible={showRankUpPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.rankUpPopup, styles.modalShadow]}>
            <Text style={styles.rankUpTitle}>🎉 RANK UP! 🎉</Text>
            <Text style={styles.rankUpSubtitle}>
              {rankUpData.oldRank} → {rankUpData.newRank}
            </Text>
            <Text style={styles.rankUpMessage}>
              Congratulations! You've advanced to {rankUpData.newRank} by achieving an average of {rankUpData.averageScore.toFixed(2)} attempts in {rankUpData.difficulty}.
            </Text>
            <TouchableOpacity
              style={styles.rankUpButton}
              onPress={() => setShowRankUpPopup(false)}
            >
              <Text style={styles.rankUpButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow]}>
            <Text style={styles.header}>Delete Account</Text>
            <Text style={styles.modalText}>
              Are you sure you want to delete your account? This action cannot be undone.
            </Text>
            <Text style={styles.modalSubtext}>
              All your data, including games, friends, and progress will be permanently deleted.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.deleteButton]}
                onPress={handleDeleteAccount}
              >
                <Text style={styles.buttonText}>Delete Account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ProfileScreen;

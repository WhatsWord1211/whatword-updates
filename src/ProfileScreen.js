import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styles from './styles';
import { playSound } from './soundsUtil';
import { useTheme } from './ThemeContext';
import { checkUsernameAvailability, generateUsernameFromEmail } from './usernameValidation';
import { validateUsernameContent, validateDisplayNameContent } from './profanityFilter';

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
  const [pvpStats, setPvpStats] = useState({
    easy: { winPercentage: 0, gamesCount: 0 },
    regular: { winPercentage: 0, gamesCount: 0 },
    hard: { winPercentage: 0, gamesCount: 0 }
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

  // Load PvP stats when user changes
  useEffect(() => {
    if (user) {
      loadPvpStats(user.uid);
    }
  }, [user]);

  // Real-time profile updates
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const profileData = docSnapshot.data();
        setUserProfile(profileData);
        
        // Update edited profile if not currently editing
        if (!isEditing) {
          setEditedProfile({
            username: profileData.username || '',
            displayName: profileData.displayName || '',
            email: profileData.email || ''
          });
        }
      }
    }, (error) => {
      console.error('ProfileScreen: Real-time listener error:', error);
    });

    return () => unsubscribe();
  }, [user, isEditing]);

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

  const loadPvpStats = async (userId) => {
    try {
      // Get all PvP game stats for this user (same logic as Leaderboard)
      const pvpStatsQuery = query(
        collection(db, 'gameStats'),
        where('players', 'array-contains', userId),
        where('type', '==', 'pvp')
      );
      
      const pvpStatsSnapshot = await getDocs(pvpStatsQuery);
      const allPvpStats = pvpStatsSnapshot.docs.map(doc => doc.data());
      
      const difficulties = ['easy', 'regular', 'hard'];
      const newPvpStats = {};
      
      for (const difficulty of difficulties) {
        // Filter by difficulty (same logic as Leaderboard)
        const difficultyFiltered = allPvpStats.filter(stat => {
          if (!stat) return false;
          // Prefer wordLength if available (new format)
          if (stat.wordLength !== undefined) {
            if (difficulty === 'easy') return stat.wordLength === 4;
            if (difficulty === 'hard') return stat.wordLength === 6;
            return stat.wordLength === 5; // regular
          }
          // Fallback to difficulty string (legacy)
          if (stat.difficulty !== undefined) {
            if (difficulty === 'easy') return stat.difficulty === 'easy';
            if (difficulty === 'hard') return stat.difficulty === 'hard';
            return stat.difficulty === 'regular';
          }
          return false;
        });

        const sortedStats = difficultyFiltered
          .filter(stat => (stat.completedAt || stat.timestamp))
          .sort((a, b) => new Date(b.completedAt || b.timestamp) - new Date(a.completedAt || a.timestamp))
          .slice(0, 15);

        let wins = 0;
        const totalGames = sortedStats.length;
        for (const gameStats of sortedStats) {
          if (gameStats.winnerId === userId) {
            wins++;
          }
        }

        const winPercentage = totalGames > 0 ? (wins / totalGames) * 100 : 0;
        
        newPvpStats[difficulty] = {
          winPercentage: winPercentage,
          gamesCount: totalGames
        };
      }
      
      setPvpStats(newPvpStats);
    } catch (error) {
      console.error('ProfileScreen: Failed to load PvP stats:', error);
    }
  };

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
        const safeUsername = currentUser.email ? await generateUsernameFromEmail(currentUser.email) : `Player${Math.floor(Math.random() * 10000)}`;
        const newProfile = {
          uid: currentUser.uid,
          username: safeUsername,
          displayName: currentUser.displayName || safeUsername,
          email: currentUser.email || '',
          createdAt: new Date(),
          lastLogin: new Date(),
          // Solo mode stats by difficulty
          easyGamesCount: 0,
          easyAverageScore: 0,
          regularGamesCount: 0,
          regularAverageScore: 0,
          hardGamesCount: 0,
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

      // Check if username has changed
      const usernameChanged = userProfile.username !== editedProfile.username.trim();
      
      if (usernameChanged) {
        // Check if user is premium (only premium users can change username)
        if (!userProfile.isPremium) {
          Alert.alert(
            'Premium Required', 
            'Only premium users can change their username. Please upgrade to premium to change your username.',
            [
              { text: 'OK', style: 'default' },
              { text: 'Upgrade', style: 'default', onPress: () => {
                // TODO: Navigate to premium upgrade screen
                Alert.alert('Coming Soon', 'Premium upgrade feature will be available soon!');
              }}
            ]
          );
          return;
        }

        // Validate username content (profanity filter) - manual edit
        const usernameContentCheck = validateUsernameContent(editedProfile.username.trim());
        if (!usernameContentCheck.isValid) {
          Alert.alert('Username Error', usernameContentCheck.error);
          return;
        }

        // Validate username availability (manual edit, so limit to 15 characters)
        const usernameCheck = await checkUsernameAvailability(editedProfile.username.trim(), user.uid, true);
        
        if (!usernameCheck.isAvailable) {
          Alert.alert('Username Error', usernameCheck.error);
          return;
        }
      }

      // Validate display name content (profanity filter)
      const displayNameContentCheck = validateDisplayNameContent(editedProfile.displayName.trim());
      if (!displayNameContentCheck.isValid) {
        Alert.alert('Display Name Error', displayNameContentCheck.error);
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        username: editedProfile.username.trim(),
        displayName: editedProfile.displayName.trim(),
        email: editedProfile.email.trim() // Keep email but don't allow changes
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




  if (loading) {
    return (
      <SafeAreaView edges={['left', 'right', 'top']} style={[styles.screenContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'top']} style={[styles.screenContainer, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1, width: '100%' }}>
        {/* Rank Display */}
        <View style={styles.rankDisplayContainer}>
          <View style={styles.rankBadge}>
            <Text style={[styles.rankTitle, { color: colors.textPrimary }]}>🏆 {getRankTitle()}</Text>
            <Text style={[styles.rankSubtitle, { color: colors.textSecondary }]}>Your Current Rank</Text>
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
              🟢 Easy <Text style={styles.scoreHighlight}>{pvpStats.easy.winPercentage.toFixed(1)}%</Text> Win Rate
            </Text>
          </View>

          {/* Regular Difficulty PvP Stats */}
          <View style={styles.difficultyStatsContainer}>
            <Text style={styles.difficultyTitle}>
              🟡 Regular <Text style={styles.scoreHighlight}>{pvpStats.regular.winPercentage.toFixed(1)}%</Text> Win Rate
            </Text>
          </View>

          {/* Hard Difficulty PvP Stats */}
          <View style={styles.difficultyStatsContainer}>
            <Text style={styles.difficultyTitle}>
              🔴 Hard <Text style={styles.scoreHighlight}>{pvpStats.hard.winPercentage.toFixed(1)}%</Text> Win Rate
            </Text>
          </View>
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
                maxLength={15}
              />
              <TextInput
                style={styles.input}
                placeholder="Display Name"
                placeholderTextColor="#9CA3AF"
                value={editedProfile.displayName}
                onChangeText={(text) => setEditedProfile(prev => ({ ...prev, displayName: text }))}
                maxLength={50}
              />
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyLabel}>Email (Cannot be changed)</Text>
                <Text style={styles.readOnlyValue}>{editedProfile.email}</Text>
              </View>
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
            onPress={() => {
              navigation.navigate('Settings');
              playSound('toggleTab').catch(() => {});
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

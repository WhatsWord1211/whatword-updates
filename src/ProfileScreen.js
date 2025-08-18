import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from './firebase';
import styles from './styles';
import { playSound } from './soundsUtil';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  
  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [favoriteWord, setFavoriteWord] = useState('');
  const [gameStyle, setGameStyle] = useState('balanced');
  const [avatar, setAvatar] = useState('default');

  // Available avatars
  const avatars = [
    'default', 'wizard', 'knight', 'ninja', 'scientist', 'artist', 
    'athlete', 'chef', 'detective', 'explorer', 'musician', 'teacher'
  ];

  // Game style options
  const gameStyles = [
    { key: 'aggressive', label: 'Aggressive', description: 'Fast-paced, risk-taking player' },
    { key: 'defensive', label: 'Defensive', description: 'Careful, strategic player' },
    { key: 'balanced', label: 'Balanced', description: 'Adaptive, versatile player' },
    { key: 'analytical', label: 'Analytical', description: 'Methodical, pattern-focused player' }
  ];

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      setUser(currentUser);
      
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const profileData = userDoc.data();
        setUserProfile(profileData);
        
        // Set form fields
        setDisplayName(profileData.displayName || '');
        setUsername(profileData.username || '');
        setBio(profileData.bio || '');
        setFavoriteWord(profileData.favoriteWord || '');
        setGameStyle(profileData.gameStyle || 'balanced');
        setAvatar(profileData.avatar || 'default');
      }
    } catch (error) {
      console.error('ProfileScreen: Failed to load profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Validate fields
      if (!displayName.trim()) {
        Alert.alert('Error', 'Display name is required');
        return;
      }

      if (!username.trim()) {
        Alert.alert('Error', 'Username is required');
        return;
      }

      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName: displayName.trim()
      });

      // Update Firestore profile
      const profileUpdates = {
        displayName: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
        favoriteWord: favoriteWord.trim(),
        gameStyle,
        avatar,
        lastUpdated: new Date().toISOString()
      };

      await updateDoc(doc(db, 'users', user.uid), profileUpdates);
      
      // Update local state
      setUserProfile(prev => ({ ...prev, ...profileUpdates }));
      setIsEditing(false);
      
      await playSound('chime');
      Alert.alert('Success', 'Profile updated successfully!');
      
    } catch (error) {
      console.error('ProfileScreen: Failed to save profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset form fields to current profile values
    if (userProfile) {
      setDisplayName(userProfile.displayName || '');
      setUsername(userProfile.username || '');
      setBio(userProfile.bio || '');
      setFavoriteWord(userProfile.favoriteWord || '');
      setGameStyle(userProfile.gameStyle || 'balanced');
      setAvatar(userProfile.avatar || 'default');
    }
    setIsEditing(false);
  };

  const getStatsDisplay = () => {
    if (!userProfile) return null;

    const stats = [
      { label: 'Games Played', value: userProfile.gamesPlayed || 0 },
      { label: 'Games Won', value: userProfile.gamesWon || 0 },
      { label: 'Win Rate', value: userProfile.gamesPlayed > 0 ? `${Math.round((userProfile.gamesWon / userProfile.gamesPlayed) * 100)}%` : '0%' },
      { label: 'Best Score', value: userProfile.bestScore || 0 },
      { label: 'Total Score', value: userProfile.totalScore || 0 },
      { label: 'Friends', value: (userProfile.friends || []).length }
    ];

    return (
      <View style={styles.statsContainer}>
        <Text style={styles.sectionTitle}>Statistics</Text>
        <View style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <View key={index} style={styles.statItem}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const getAvatarIcon = (avatarName) => {
    const avatarIcons = {
      default: '👤', wizard: '🧙‍♂️', knight: '⚔️', ninja: '🥷', 
      scientist: '🔬', artist: '🎨', athlete: '🏃‍♂️', chef: '👨‍🍳',
      detective: '🕵️', explorer: '🗺️', musician: '🎵', teacher: '👨‍🏫'
    };
    return avatarIcons[avatarName] || '👤';
  };

  return (
    <SafeAreaView style={styles.screenContainer}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.header}>Player Profile</Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsEditing(!isEditing)}
          >
            <Text style={styles.editButtonText}>
              {isEditing ? 'Cancel' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => isEditing && setShowAvatarModal(true)}
            disabled={!isEditing}
          >
            <Text style={styles.avatarIcon}>{getAvatarIcon(avatar)}</Text>
            {isEditing && <Text style={styles.avatarHint}>Tap to change</Text>}
          </TouchableOpacity>
          
          <View style={styles.profileInfo}>
            <Text style={styles.displayName}>{userProfile?.displayName || 'Player'}</Text>
            <Text style={styles.username}>@{userProfile?.username || 'username'}</Text>
            {userProfile?.bio && (
              <Text style={styles.bio}>{userProfile.bio}</Text>
            )}
          </View>
        </View>

        {/* Edit Form */}
        {isEditing && (
          <View style={styles.editForm}>
            <Text style={styles.sectionTitle}>Profile Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter display name"
                placeholderTextColor="#9CA3AF"
                maxLength={30}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Enter username"
                placeholderTextColor="#9CA3AF"
                maxLength={20}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                maxLength={150}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Favorite Word</Text>
              <TextInput
                style={styles.input}
                value={favoriteWord}
                onChangeText={setFavoriteWord}
                placeholder="What's your favorite word?"
                placeholderTextColor="#9CA3AF"
                maxLength={20}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Game Style</Text>
              <View style={styles.gameStyleOptions}>
                {gameStyles.map((style) => (
                  <TouchableOpacity
                    key={style.key}
                    style={[
                      styles.gameStyleOption,
                      gameStyle === style.key && styles.gameStyleOptionSelected
                    ]}
                    onPress={() => setGameStyle(style.key)}
                  >
                    <Text style={[
                      styles.gameStyleLabel,
                      gameStyle === style.key && styles.gameStyleLabelSelected
                    ]}>
                      {style.label}
                    </Text>
                    <Text style={styles.gameStyleDescription}>
                      {style.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancelEdit}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton, loading && styles.disabledButton]}
                onPress={handleSaveProfile}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Saving...' : 'Save Profile'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Statistics */}
        {getStatsDisplay()}

        {/* Game Preferences */}
        <View style={styles.preferencesSection}>
          <Text style={styles.sectionTitle}>Game Preferences</Text>
          <View style={styles.preferenceItem}>
            <Text style={styles.preferenceLabel}>Preferred Word Length:</Text>
            <Text style={styles.preferenceValue}>
              {userProfile?.preferredWordLength || 'Any'}
            </Text>
          </View>
          <View style={styles.preferenceItem}>
            <Text style={styles.preferenceLabel}>Game Style:</Text>
            <Text style={styles.preferenceValue}>
              {gameStyles.find(s => s.key === gameStyle)?.label || 'Balanced'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Avatar Selection Modal */}
      <Modal
        visible={showAvatarModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.avatarModal}>
            <Text style={styles.modalTitle}>Choose Avatar</Text>
            <View style={styles.avatarGrid}>
              {avatars.map((avatarName) => (
                <TouchableOpacity
                  key={avatarName}
                  style={[
                    styles.avatarOption,
                    avatar === avatarName && styles.avatarOptionSelected
                  ]}
                  onPress={() => {
                    setAvatar(avatarName);
                    setShowAvatarModal(false);
                  }}
                >
                  <Text style={styles.avatarOptionIcon}>
                    {getAvatarIcon(avatarName)}
                  </Text>
                  <Text style={styles.avatarOptionName}>
                    {avatarName.charAt(0).toUpperCase() + avatarName.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.button}
              onPress={() => setShowAvatarModal(false)}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ProfileScreen;

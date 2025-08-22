import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styles from './styles';
import { playSound } from './soundsUtil';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadUserProfile(currentUser);
      }
    });

    return unsubscribe;
  }, []);

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
          gamesPlayed: 0,
          gamesWon: 0,
          bestScore: 0,
          totalScore: 0,
          friends: [],
          isAnonymous: false
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
      navigation.navigate('Auth');
    } catch (error) {
      console.error('Failed to sign out:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  const calculateWinRate = () => {
    if (!userProfile || userProfile.gamesPlayed === 0) return 0;
    return ((userProfile.gamesWon / userProfile.gamesPlayed) * 100).toFixed(1);
  };

  const getRankTitle = () => {
    if (!userProfile) return 'Rookie';
    const score = userProfile.bestScore || 0;
    if (score >= 1000) return 'Word Master';
    if (score >= 750) return 'Word Expert';
    if (score >= 500) return 'Word Pro';
    if (score >= 250) return 'Word Enthusiast';
    if (score >= 100) return 'Word Learner';
    return 'Rookie';
  };

  if (loading) {
    return (
      <View style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      {/* FAB */}
      <TouchableOpacity 
        style={styles.fabTop} 
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.fabText}>☰</Text>
      </TouchableOpacity>
      
      <ScrollView style={{ flex: 1, width: '100%' }}>
        {/* Welcome Header */}
        <View style={styles.welcomeContainer}>
          <Text style={styles.welcomeTitle}>Welcome to WhatWord! 🎉</Text>
          <Text style={styles.welcomeSubtitle}>
            Rank: {getRankTitle()} • Level {Math.floor((userProfile?.totalScore || 0) / 100) + 1}
          </Text>
        </View>

        {/* Profile Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userProfile?.gamesPlayed || 0}</Text>
              <Text style={styles.statLabel}>Games Played</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userProfile?.gamesWon || 0}</Text>
              <Text style={styles.statLabel}>Games Won</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{calculateWinRate()}%</Text>
              <Text style={styles.statLabel}>Win Rate</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userProfile?.bestScore || 0}</Text>
              <Text style={styles.statLabel}>Best Score</Text>
            </View>
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
          
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#767577', true: '#F59E0B' }}
              thumbColor={notificationsEnabled ? '#FFFFFF' : '#f4f3f4'}
            />
          </View>
          
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Sound Effects</Text>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: '#767577', true: '#F59E0B' }}
              thumbColor={soundEnabled ? '#FFFFFF' : '#f4f3f4'}
            />
          </View>
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
    </View>
  );
};

export default ProfileScreen;

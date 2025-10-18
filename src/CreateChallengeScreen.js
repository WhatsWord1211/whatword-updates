import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Modal, BackHandler, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';
import { useTheme } from './ThemeContext';
import friendRecordsService from './friendRecordsService';

const CreateChallengeScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [friends, setFriends] = useState([]);
  const [friendRecords, setFriendRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showMenuPopup, setShowMenuPopup] = useState(false);

  // Share app link function
  const shareAppLink = async () => {
    try {
      // Play sound BEFORE opening share dialog to avoid background audio issues
      console.log('CreateChallengeScreen: Playing rank sound before share');
      playSound('rank');
      
      // Small delay to ensure sound starts playing before share dialog opens
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // App Store links
      const androidUrl = "https://play.google.com/store/apps/details?id=com.whatword.app";
      const iosUrl = "https://apps.apple.com/app/whatword/id6752830019";
      
      const shareMessage = "Let's play WhatWord! - the ultimate word guessing game.\n\nGuess my word before I guess yours!\n\n📱 Download now:\n\niPhone: " + iosUrl + "\n\nAndroid: " + androidUrl;
      
      await Share.share({
        message: shareMessage,
        title: 'WhatWord - Word Game'
      });
    } catch (error) {
      console.error('Failed to share app link:', error);
      Alert.alert('Error', 'Failed to share app link. Please try again.');
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadFriends(currentUser.uid);
      }
    });

    return unsubscribe;
  }, []);

  // Prevent back button from going to word submission page - always go to main screen
  useEffect(() => {
    const backAction = () => {
      // Always navigate to main screen instead of going back
      navigation.navigate('MainTabs');
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [navigation]);

  const loadFriends = async (userId) => {
    try {
      setLoading(true);
      
      console.log('🔍 [CreateChallengeScreen] Loading friends using NEW subcollection system');
      
      // Use NEW subcollection system
      const friendsRef = collection(db, 'users', userId, 'friends');
      const friendsQuery = query(friendsRef, where('status', '==', 'accepted'));
      const friendsSnapshot = await getDocs(friendsQuery);
      
      console.log('🔍 [CreateChallengeScreen] Found', friendsSnapshot.docs.length, 'friends');

      if (friendsSnapshot.docs.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }

      // Get friend details from subcollection (already has username!)
      const friendsData = [];
      
      for (const friendDoc of friendsSnapshot.docs) {
        try {
          const friendId = friendDoc.id;
          const friendData = friendDoc.data();
          
          // Use friendUsername from subcollection, or fetch from user doc as fallback
          let username = friendData.friendUsername;
          
          if (!username) {
            console.log('🔍 [CreateChallengeScreen] No username in subcollection, fetching user doc:', friendId);
            const userDoc = await getDoc(doc(db, 'users', friendId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              username = userData.username || userData.displayName || 'Unknown Player';
            } else {
              username = 'Unknown Player';
            }
          }
          
          const friendObj = {
            uid: friendId,
            username: username
          };
          console.log('🔍 [CreateChallengeScreen] Loaded friend:', friendObj);
          friendsData.push(friendObj);
        } catch (error) {
          console.error('❌ [CreateChallengeScreen] Failed to load friend data:', error);
        }
      }

      console.log('🔍 [CreateChallengeScreen] Total friends loaded:', friendsData.length);
      setFriends(friendsData);
      
      // Load friend records for all friends
      if (friendsData.length > 0) {
        const friendIds = friendsData.map(f => f.uid);
        const records = await friendRecordsService.getBatchFriendRecords(userId, friendIds);
        setFriendRecords(records);
      }
    } catch (error) {
      console.error('Failed to load friends:', error);
      Alert.alert('Error', 'Failed to load friends list. Please try again.');
    } finally {
      setLoading(false);
    }
  };



  const challengeFriend = (friend) => {
    console.log('🔍 [CreateChallengeScreen] Challenging friend:', friend);
    
    try {
      // Validate friend object
      if (!friend || !friend.uid) {
        console.error('❌ [CreateChallengeScreen] Invalid friend object:', friend);
        Alert.alert('Error', 'Unable to challenge this friend. Please try again.');
        return;
      }
      
      if (!friend.username) {
        console.warn('⚠️ [CreateChallengeScreen] Friend missing username, using fallback');
      }
      
      const challengeData = {
        from: user.uid,
        to: friend.uid,
        fromUsername: user.displayName || user.email?.split('@')[0] || 'You',
        toUsername: friend.username || 'Opponent'
      };
      
      console.log('🔍 [CreateChallengeScreen] Challenge data:', challengeData);
      
      // Navigate to SetWordGameScreen to create the challenge
      navigation.navigate('SetWordGame', {
        challenge: challengeData,
        isAccepting: false
      });
    } catch (error) {
      console.error('❌ [CreateChallengeScreen] Navigation error:', error);
      Alert.alert('Navigation Error', 'Failed to navigate to challenge screen. Please try again.');
    }
  };





  if (loading) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { paddingTop: insets.top }]}>
      {/* Friends FAB - Positioned in top right corner */}
      <TouchableOpacity
        style={[styles.fabTopHomeScreen, { top: insets.top + 5 }]}
        onPress={() => {
          playSound('chime');
          // Navigate to MainTabs first, then to Friends tab
          navigation.navigate('MainTabs', { screen: 'Friends' });
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.fabText}>👥</Text>
      </TouchableOpacity>
      
      <ScrollView 
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ 
          paddingHorizontal: 20, 
          paddingBottom: 30,
          alignItems: 'center',
          paddingTop: 20,
          minHeight: '100%' // Ensure content fills the screen
        }}
        showsVerticalScrollIndicator={true}
        bounces={true}
        alwaysBounceVertical={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back Button */}
        <TouchableOpacity
          style={[styles.createChallengeBackButton, { alignSelf: 'flex-start', marginLeft: 0 }]}
          onPress={() => {
            playSound('backspace');
            navigation.navigate('MainTabs');
          }}
        >
          <Text style={styles.createChallengeBackButtonText}>← Back</Text>
        </TouchableOpacity>
        
        <Text style={styles.header}>Start A Game</Text>
        
        {/* Share App Link Section - Right under header */}
        <View style={styles.shareSection}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={shareAppLink}
          >
            <Text style={styles.shareButtonText}>Share App with Friends</Text>
          </TouchableOpacity>
        </View>
        
        {friends.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Friends Yet</Text>
            <Text style={styles.emptyText}>
              You need to add friends before you can challenge them to a game.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                playSound('chime');
                navigation.navigate('AddFriends');
              }}
            >
              <Text style={styles.buttonText}>Add Friends</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>

            
            <View style={styles.friendsContainer}>
              {friends.map((friend, index) => {
                const record = friendRecords[friend.uid];
                const formattedRecord = friendRecordsService.formatRecord(record);
                const hasPlayedGames = record && record.totalGames > 0;
                
                return (
                  <View key={friend.uid} style={[styles.friendItem, index === friends.length - 1 && styles.lastFriendItem]}>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendUsername}>{friend.username}</Text>
                      {hasPlayedGames ? (
                        <Text style={[styles.friendRecord, { color: colors.textSecondary }]}>
                          {formattedRecord} (W-L-T)
                        </Text>
                      ) : (
                        <Text style={[styles.friendRecord, { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' }]}>
                          No games yet
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.challengeButton}
                      onPress={() => {
                        playSound('chime');
                        challengeFriend(friend);
                      }}
                    >
                      <Text style={styles.challengeButtonText}>Challenge</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
                 )}
       </ScrollView>

       {/* Menu Popup Modal */}
       <Modal visible={showMenuPopup} transparent animationType="fade">
         <View style={styles.modalOverlay}>
           <View style={[styles.modalContainer, styles.modalShadow]}>
             <Text style={styles.header}>Game Menu</Text>
             
             <TouchableOpacity
               style={styles.button}
               onPress={() => {
                 setShowMenuPopup(false);
                 navigation.navigate('MainTabs');
               }}
             >
               <Text style={styles.buttonText}>Return to Home</Text>
             </TouchableOpacity>
             
             <TouchableOpacity
               style={styles.button}
               onPress={() => setShowMenuPopup(false)}
             >
               <Text style={styles.buttonText}>Cancel</Text>
             </TouchableOpacity>
           </View>
         </View>
       </Modal>
     </SafeAreaView>
   );
};

export default CreateChallengeScreen;

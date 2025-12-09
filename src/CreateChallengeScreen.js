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
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AnimatedMeshGradient from './AnimatedMeshGradient';

const CreateChallengeScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, updateNavigationBar } = useTheme();
  const [friends, setFriends] = useState([]);
  const [friendRecords, setFriendRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  
  // Load saved friend order from AsyncStorage
  const loadFriendOrder = async (userId) => {
    try {
      const savedOrder = await AsyncStorage.getItem(`friendOrder_${userId}`);
      return savedOrder ? JSON.parse(savedOrder) : null;
    } catch (error) {
      console.error('Failed to load friend order:', error);
      return null;
    }
  };

  // Save friend order to AsyncStorage
  const saveFriendOrder = async (userId, orderedFriends) => {
    try {
      const orderIds = orderedFriends.map(f => f.uid);
      await AsyncStorage.setItem(`friendOrder_${userId}`, JSON.stringify(orderIds));
    } catch (error) {
      console.error('Failed to save friend order:', error);
    }
  };

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

  // Update navigation bar when modals appear/disappear
  useEffect(() => {
    if (updateNavigationBar) {
      updateNavigationBar();
    }
  }, [showMenuPopup, updateNavigationBar]);

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
      
      // Load saved order and apply it
      const savedOrder = await loadFriendOrder(userId);
      if (savedOrder && savedOrder.length === friendsData.length) {
        // Create a map for quick lookup
        const friendMap = new Map(friendsData.map(f => [f.uid, f]));
        // Reorder based on saved order
        const orderedFriends = savedOrder
          .map(uid => friendMap.get(uid))
          .filter(f => f !== undefined); // Remove any friends that no longer exist
        
        // Add any new friends that weren't in the saved order
        const existingUids = new Set(savedOrder);
        const newFriends = friendsData.filter(f => !existingUids.has(f.uid));
        const finalOrder = [...orderedFriends, ...newFriends];
        
        setFriends(finalOrder);
      } else {
        setFriends(friendsData);
      }
      
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

  // Handle drag end - reorder friends and save order
  const handleDragEnd = async ({ data }) => {
    setFriends(data);
    if (user) {
      await saveFriendOrder(user.uid, data);
    }
  };

  // Render friend item with drag handle
  const renderFriendItem = ({ item, drag, isActive, index }) => {
    const record = friendRecords[item.uid];
    const formattedRecord = friendRecordsService.formatRecord(record);
    const hasPlayedGames = record && record.totalGames > 0;
    
    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
          style={[
            styles.friendItem,
            index === friends.length - 1 && styles.lastFriendItem,
            isActive && { opacity: 0.9, transform: [{ scale: 1.02 }] },
            { position: 'relative' }
          ]}
        >
          <View style={styles.friendInfo}>
            <Text style={styles.friendUsername}>{item.username}</Text>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity
              style={styles.challengeButton}
              onPress={() => {
                playSound('chime');
                challengeFriend(item);
              }}
            >
              <Text style={styles.challengeButtonText}>Challenge</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onLongPress={drag}
            style={{ position: 'absolute', right: 12, bottom: 12, padding: 8, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 32, color: '#F59E0B' }}>↕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };





  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <AnimatedMeshGradient style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }} />
        <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { backgroundColor: 'transparent', paddingTop: insets.top, zIndex: 1 }]}>
          <Text style={styles.loadingText}>Loading...</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AnimatedMeshGradient style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }} />
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { backgroundColor: 'transparent', paddingTop: insets.top, zIndex: 1 }]}>
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
      
      {/* Header Section - Fixed at top */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 }}>
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
      </View>
      
      {/* Friends List - Scrollable */}
      {friends.length === 0 ? (
        <View style={[styles.emptyContainer, { flex: 1, justifyContent: 'center', paddingHorizontal: 20 }]}>
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
        <View style={[styles.friendsContainer, { flex: 1, paddingHorizontal: 20 }]}>
          <DraggableFlatList
            data={friends}
            onDragEnd={handleDragEnd}
            keyExtractor={(item) => item.uid}
            renderItem={renderFriendItem}
            scrollEnabled={true}
            contentContainerStyle={{ paddingBottom: 30 }}
            showsVerticalScrollIndicator={true}
          />
        </View>
      )}

       {/* Menu Popup Modal */}
       <Modal visible={showMenuPopup} transparent animationType="fade" statusBarTranslucent={false}>
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
    </View>
  );
};

export default CreateChallengeScreen;

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, onSnapshot, arrayRemove, updateDoc, getDoc, collection, query, where, deleteDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const FriendsListScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFriendOptionsModal, setShowFriendOptionsModal] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);

  useEffect(() => {
    console.log('🔍 [FriendsListScreen] Setting up friends listener using NEW subcollection system');
    
    // Use NEW subcollection system - listen to accepted friendships
    const friendsRef = collection(db, 'users', auth.currentUser.uid, 'friends');
    const friendsQuery = query(friendsRef, where('status', '==', 'accepted'));
    
    const unsubscribe = onSnapshot(friendsQuery, async (snapshot) => {
      console.log('🔍 [FriendsListScreen] Friends snapshot:', snapshot.docs.length, 'friends');
      
      if (snapshot.docs.length > 0) {
        const friendsData = [];
        for (const friendDoc of snapshot.docs) {
          try {
            // Document ID is the friend's UID
            const friendUid = friendDoc.id;
            const userDoc = await getDoc(doc(db, 'users', friendUid));
            if (userDoc.exists()) {
              friendsData.push({
                uid: friendUid,
                ...userDoc.data()
              });
            }
          } catch (error) {
            console.error('Error fetching friend data:', error);
          }
        }
        setFriends(friendsData);
        setLoading(false);
      } else {
        setFriends([]);
        setLoading(false);
      }
    }, (error) => {
      console.error('❌ [FriendsListScreen] Friends listener error:', error);
      setFriends([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const challengeFriend = async (friend) => {
    console.log('🔍 Challenge button pressed for friend:', friend);
    
    // Navigate to SetWordGameScreen to set the mystery word
    navigation.navigate('SetWordGame', {
      challenge: {
        from: auth.currentUser.uid,
        to: friend.uid,
        fromUsername: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown',
        toUsername: friend.username || friend.displayName || 'Unknown'
      },
      isAccepting: false
    });
  };

  const removeFriend = async (friend) => {
    try {
      console.log('🔍 [FriendsListScreen] Removing friend using NEW subcollection system:', friend.uid);
      
      // Delete friend documents from both users' subcollections
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'friends', friend.uid));
      await deleteDoc(doc(db, 'users', friend.uid, 'friends', auth.currentUser.uid));
      
      console.log('🔍 [FriendsListScreen] Friend removed successfully');

      Alert.alert('Success', `${friend.username || friend.displayName} removed from friends list.`);
      playSound('chime');
      setShowFriendOptionsModal(false);
      setSelectedFriend(null);
    } catch (error) {
      console.error('❌ [FriendsListScreen] Failed to remove friend:', error);
      Alert.alert('Error', 'Failed to remove friend. Please try again.');
    }
  };

  const renderFriend = ({ item }) => (
    <View style={styles.friendItem}>
      <View style={styles.friendInfo}>
        <Text style={styles.friendUsername}>
          {item.username || item.displayName || 'Unknown User'}
        </Text>
        <Text style={styles.friendEmail}>
          {item.email}
        </Text>
      </View>
      <View style={styles.friendActions}>
        <TouchableOpacity
          style={[styles.button, styles.challengeButton]}
          onPress={() => challengeFriend(item)}
        >
          <Text style={styles.buttonText}>Challenge</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.removeButton]}
          onPress={() => {
            setSelectedFriend(item);
            setShowFriendOptionsModal(true);
          }}
        >
          <Text style={styles.buttonText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screenContainer, { paddingTop: insets.top }]}>
      <Text style={styles.header}>Your Friends</Text>
      
      {friends.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No friends yet</Text>
          <Text style={styles.emptySubtext}>Search for players to add them as friends!</Text>
        </View>
      ) : (
        <View style={styles.friendsContainer}>
          <Text style={styles.resultsTitle}>Friends ({friends.length})</Text>
          <FlatList
            data={friends}
            renderItem={renderFriend}
            keyExtractor={item => item.uid}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* Friend Options Modal */}
      <Modal visible={showFriendOptionsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow]}>
            <Text style={styles.header}>Remove Friend</Text>
            <Text style={styles.modalText}>
              Are you sure you want to remove {selectedFriend?.username || selectedFriend?.displayName} from your friends list?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.removeButton]}
                onPress={() => {
                  if (selectedFriend) {
                    removeFriend(selectedFriend);
                  }
                }}
              >
                <Text style={styles.buttonText}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={() => {
                  setShowFriendOptionsModal(false);
                  setSelectedFriend(null);
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Back Button */}
      <TouchableOpacity
        style={styles.textButton}
        onPress={() => {
          playSound('backspace');
          navigation.goBack();
        }}
      >
        <Text style={styles.textButtonText}>Back to Friends</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default FriendsListScreen;

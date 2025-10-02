import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, onSnapshot, arrayRemove, updateDoc, getDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const FriendsListScreen = () => {
  const navigation = useNavigation();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFriendOptionsModal, setShowFriendOptionsModal] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);

  useEffect(() => {
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const userData = docSnapshot.data();
        if (userData.friends && userData.friends.length > 0) {
          // Fetch friend details for each friend UID
          const fetchFriends = async () => {
            const friendsData = [];
            for (const friendUid of userData.friends) {
              try {
                const friendDoc = await getDoc(doc(db, 'users', friendUid));
                if (friendDoc.exists()) {
                  friendsData.push({
                    uid: friendUid,
                    ...friendDoc.data()
                  });
                }
              } catch (error) {
                console.error('Error fetching friend data:', error);
              }
            }
            setFriends(friendsData);
            setLoading(false);
          };
          fetchFriends();
        } else {
          setFriends([]);
          setLoading(false);
        }
      } else {
        setFriends([]);
        setLoading(false);
      }
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
      // Remove friend from current user's friends list
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        friends: arrayRemove(friend.uid)
      });

      // Also remove current user from friend's friends list
      await updateDoc(doc(db, 'users', friend.uid), {
        friends: arrayRemove(auth.currentUser.uid)
      });

      Alert.alert('Success', `${friend.username || friend.displayName} removed from friends list.`);
      playSound('chime');
      setShowFriendOptionsModal(false);
      setSelectedFriend(null);
    } catch (error) {
      console.error('Failed to remove friend:', error);
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
      <SafeAreaView edges={['left', 'right', 'top']} style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'top']} style={styles.screenContainer}>
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
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.textButtonText}>Back to Friends</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default FriendsListScreen;

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, arrayUnion, getDoc, setDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

// ✅ CONSISTENT SYSTEM ⚠️
// This file uses the NEW subcollection system (users/{userId}/friends/{friendId})
// All files now use the same NEW subcollection system for consistency
console.log('✅ [FriendRequestsScreen] Using NEW subcollection system - consistent with all screens');

const FriendRequestsScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔍 [FriendRequestsScreen] Setting up friend request listener');
    console.log('🔍 [FriendRequestsScreen] Current user ID:', auth.currentUser?.uid);
    
    const requestsQuery = query(
      collection(db, 'users', auth.currentUser.uid, 'friends'),
      where('status', '==', 'pending')
    );

    console.log('🔍 [FriendRequestsScreen] Querying NEW subcollection system for user:', auth.currentUser?.uid);

    const unsubscribe = onSnapshot(requestsQuery, async (snapshot) => {
      console.log('🔍 [FriendRequestsScreen] Friend request listener triggered');
      console.log('🔍 [FriendRequestsScreen] Snapshot size:', snapshot.docs.length);
      console.log('🔍 [FriendRequestsScreen] Raw snapshot docs:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      const requests = [];
      for (const requestDocSnapshot of snapshot.docs) {
        const requestData = requestDocSnapshot.data();
        console.log('🔍 [FriendRequestsScreen] Processing request from:', requestDocSnapshot.id, 'with data:', requestData);
        
        // Get the sender's user profile
        const userDocRef = await getDoc(doc(db, 'users', requestDocSnapshot.id));
        if (userDocRef.exists()) {
          const userData = userDocRef.data();
          console.log('🔍 [FriendRequestsScreen] Found user profile for:', requestDocSnapshot.id, userData);
          
          const requestItem = {
            id: requestDocSnapshot.id,
            username: userData.username,
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            status: requestData.status,
            createdAt: requestData.createdAt,
            senderUsername: requestData.senderUsername,
            from: requestDocSnapshot.id, // For compatibility with existing code
            to: auth.currentUser.uid
          };
          
          console.log('🔍 [FriendRequestsScreen] Created request item:', requestItem);
          requests.push(requestItem);
        } else {
          console.log('❌ [FriendRequestsScreen] User profile not found for:', requestDocSnapshot.id);
        }
      }
      
      console.log('🔍 [FriendRequestsScreen] Final processed requests:', requests);
      setPendingRequests(requests);
      setLoading(false);
    }, (error) => {
      console.error('❌ [FriendRequestsScreen] Friend request listener error:', error);
    });

    return () => {
      console.log('🔍 [FriendRequestsScreen] Cleaning up friend request listener');
      unsubscribe();
    };
  }, []);

  const acceptFriendRequest = async (request) => {
    try {
      console.log('🔍 [FriendRequestsScreen] Accepting friend request from:', request.id);
      
      // Update request status in current user's friends subcollection
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'friends', request.id), {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      });
      console.log('🔍 [FriendRequestsScreen] Updated request status to accepted');

      // Clear any redundant friend requests between these two users
      console.log('🔍 [FriendRequestsScreen] Clearing redundant friend requests...');
      
      // Check for redundant requests from current user to the sender
      const redundantRequestDoc = doc(db, 'users', request.id, 'friends', auth.currentUser.uid);
      const redundantRequestSnapshot = await getDoc(redundantRequestDoc);
      
      if (redundantRequestSnapshot.exists()) {
        const redundantData = redundantRequestSnapshot.data();
        if (redundantData.status === 'pending') {
          console.log('🔍 [FriendRequestsScreen] Found redundant request to clear');
          await deleteDoc(redundantRequestDoc);
          console.log('🔍 [FriendRequestsScreen] Cleared redundant request');
        }
      }

      // Create mutual friendship in sender's friends subcollection
      await setDoc(doc(db, 'users', request.id, 'friends', auth.currentUser.uid), {
        status: 'accepted',
        createdAt: request.createdAt,
        acceptedAt: new Date().toISOString(),
        senderUsername: auth.currentUser.displayName || 'Unknown',
        senderId: auth.currentUser.uid
      });
      console.log('🔍 [FriendRequestsScreen] Created mutual friendship');

      Alert.alert('Success', `You are now friends with ${request.username || request.senderUsername}!`);
      playSound('chime');
    } catch (error) {
      console.error('❌ [FriendRequestsScreen] Failed to accept friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    }
  };

  const declineFriendRequest = async (request) => {
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'friends', request.id));
      Alert.alert('Declined', 'Friend request declined.');
      playSound('backspace').catch(() => {});
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request. Please try again.');
    }
  };

  const renderRequest = ({ item }) => (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <Text style={styles.requestUsername}>
          {item.fromUsername || 'Unknown User'}
        </Text>
        <Text style={styles.requestText}>wants to be your friend</Text>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => acceptFriendRequest(item)}
        >
          <Text style={styles.buttonText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={() => declineFriendRequest(item)}
        >
          <Text style={styles.buttonText}>Decline</Text>
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
    <SafeAreaView edges={['left', 'right', 'top']} style={styles.screenContainer}>
      <Text style={styles.header}>Friend Requests</Text>
      
      {pendingRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No pending friend requests</Text>
          <Text style={styles.emptySubtext}>When someone sends you a friend request, it will appear here.</Text>
        </View>
      ) : (
        <View style={styles.requestsContainer}>
          <Text style={styles.resultsTitle}>Pending Requests ({pendingRequests.length})</Text>
          <FlatList
            data={pendingRequests}
            renderItem={renderRequest}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

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

export default FriendRequestsScreen;

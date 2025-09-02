import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const FriendRequestsScreen = () => {
  const navigation = useNavigation();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingRequests(requests);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const acceptFriendRequest = async (request) => {
    try {
      // Update request status
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'accepted',
        acceptedAt: new Date()
      });

      // Update current user's friends list
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        friends: arrayUnion(request.from)
      });

      // Also update the other user's friends list for mutual friendship
      await updateDoc(doc(db, 'users', request.from), {
        friends: arrayUnion(auth.currentUser.uid)
      });

      Alert.alert('Success', `You are now friends with ${request.fromUsername}!`);
      playSound('chime');
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    }
  };

  const declineFriendRequest = async (request) => {
    try {
      await deleteDoc(doc(db, 'friendRequests', request.id));
      Alert.alert('Declined', 'Friend request declined.');
      playSound('chime');
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
      <SafeAreaView style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screenContainer}>
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
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.textButtonText}>Back to Friends</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default FriendRequestsScreen;

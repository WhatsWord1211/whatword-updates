import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const CreateChallengeScreen = () => {
  const navigation = useNavigation();
  const [friends, setFriends] = useState([]);
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showMenuPopup, setShowMenuPopup] = useState(false);
  const [friendsHardModeStatus, setFriendsHardModeStatus] = useState({});

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadFriends(currentUser.uid);
        loadPendingChallenges(currentUser.uid);
      }
    });

    return unsubscribe;
  }, []);

  const loadFriends = async (userId) => {
    try {
      setLoading(true);
      
      // Get user's friends list
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        setFriends([]);
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      const friendsList = userData.friends || [];

      if (friendsList.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }

      // Get friend details and hard mode status
      const friendsData = [];
      const hardModeStatus = {};
      
      for (const friendId of friendsList) {
        try {
          const friendDoc = await getDoc(doc(db, 'users', friendId));
          if (friendDoc.exists()) {
            const friendData = friendDoc.data();
            friendsData.push({
              uid: friendId,
              username: friendData.username || friendData.displayName || 'Unknown Player'
            });
            
            // Check hard mode unlock status
            const isPremium = friendData.isPremium || false;
            const regularAvg = friendData.regularAverageScore || 0;
            const hasPlayedGames = (friendData.easyGamesPlayed || 0) + (friendData.regularGamesPlayed || 0) + (friendData.hardGamesPlayed || 0) > 0;
            
            hardModeStatus[friendId] = isPremium || (hasPlayedGames && regularAvg > 0 && regularAvg <= 8);
          }
        } catch (error) {
          console.error('Failed to load friend data:', error);
          hardModeStatus[friendId] = false;
        }
      }

      setFriends(friendsData);
      setFriendsHardModeStatus(hardModeStatus);
    } catch (error) {
      console.error('Failed to load friends:', error);
      Alert.alert('Error', 'Failed to load friends list. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadPendingChallenges = async (userId) => {
    try {
      // Get pending challenges for the current user
      const challengesQuery = query(
        collection(db, 'challenges'),
        where('to', '==', userId),
        where('status', '==', 'pending')
      );
      
      const snapshot = await getDocs(challengesQuery);
      const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Get challenger details for each challenge
      const challengesWithDetails = [];
      for (const challenge of challenges) {
        try {
          const challengerDoc = await getDoc(doc(db, 'users', challenge.from));
          if (challengerDoc.exists()) {
            const challengerData = challengerDoc.data();
            challengesWithDetails.push({
              ...challenge,
              challengerUsername: challengerData.username || challengerData.displayName || 'Unknown Player'
            });
          }
        } catch (error) {
          console.error('Failed to load challenger data:', error);
        }
      }
      
      setPendingChallenges(challengesWithDetails);
    } catch (error) {
      console.error('Failed to load pending challenges:', error);
    }
  };

  const challengeFriend = (friend) => {
    console.log('🔧 DEBUG: challengeFriend called with:', friend);
    console.log('🔧 DEBUG: Current user:', user);
    console.log('🔧 DEBUG: Navigation object:', navigation);
    
    try {
      // Navigate to SetWordGameScreen to create the challenge
      navigation.navigate('SetWordGame', {
        challenge: {
          from: user.uid,
          to: friend.uid,
          fromUsername: user.displayName || user.email?.split('@')[0] || 'You',
          toUsername: friend.username
        },
        isAccepting: false
      });
      console.log('🔧 DEBUG: Navigation successful');
    } catch (error) {
      console.error('🔧 DEBUG: Navigation error:', error);
      Alert.alert('Navigation Error', 'Failed to navigate to challenge screen. Please try again.');
    }
  };

  const acceptChallenge = async (challenge) => {
    try {
      playSound('chime');
      // Navigate to SetWordGameScreen to accept the challenge
      navigation.navigate('SetWordGame', {
        challenge: challenge,
        isAccepting: true
      });
    } catch (error) {
      console.error('Failed to accept challenge:', error);
      Alert.alert('Error', 'Failed to accept challenge. Please try again.');
    }
  };

  const declineChallenge = async (challenge) => {
    try {
      // Update challenge status to declined
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'declined',
        declinedAt: new Date()
      });
      
      // Remove from pending challenges
      setPendingChallenges(prev => prev.filter(c => c.id !== challenge.id));
      
      playSound('chime');
      Alert.alert('Challenge Declined', 'The challenge has been declined.');
    } catch (error) {
      console.error('Failed to decline challenge:', error);
      Alert.alert('Error', 'Failed to decline challenge. Please try again.');
    }
  };



  if (loading) {
    return (
      <View style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
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
          style={[styles.backButton, { alignSelf: 'flex-start', marginLeft: 0 }]}
          onPress={() => {
            playSound('chime');
            navigation.goBack();
          }}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        
        <Text style={styles.header}>Start A Game</Text>
        
        {/* Pending Challenges Section */}
        {pendingChallenges.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Pending Challenges</Text>
            <Text style={styles.sectionSubtitle}>
              You have {pendingChallenges.length} challenge{pendingChallenges.length > 1 ? 's' : ''} to respond to
            </Text>
            {pendingChallenges.map((challenge, index) => (
              <View key={challenge.id} style={[styles.challengeItem, index === pendingChallenges.length - 1 && styles.lastChallengeItem]}>
                <View style={styles.challengeInfo}>
                  <Text style={styles.challengerUsername}>
                    Challenge from {challenge.challengerUsername}
                  </Text>
                  <Text style={styles.challengeDetails}>
                    {challenge.difficulty || 'Regular'} difficulty • {challenge.difficulty === 'easy' ? '4' : challenge.difficulty === 'hard' ? '6' : '5'} letters
                  </Text>
                  <Text style={styles.challengeTime}>
                    {new Date(challenge.createdAt?.toDate() || challenge.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.challengeActions}>
                  <TouchableOpacity
                    style={[styles.challengeButton, styles.acceptButton]}
                    onPress={() => acceptChallenge(challenge)}
                  >
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.challengeButton, styles.declineButton]}
                    onPress={() => declineChallenge(challenge)}
                  >
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
        
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
              {friends.map((friend, index) => (
                <View key={friend.uid} style={[styles.friendItem, index === friends.length - 1 && styles.lastFriendItem]}>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendUsername}>{friend.username}</Text>
                    <Text style={styles.friendHardModeStatus}>
                      {friendsHardModeStatus[friend.uid] 
                        ? '🔓 Hard Mode Available' 
                        : '🔒 Hard Mode Locked'
                      }
                    </Text>
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
              ))}
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
                 navigation.navigate('Home');
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
     </View>
   );
};

export default CreateChallengeScreen;

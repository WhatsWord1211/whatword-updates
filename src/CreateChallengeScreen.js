import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { playSound } from './soundsUtil';
import styles from './styles';

const CreateChallengeScreen = () => {
  const navigation = useNavigation();
  const [friends, setFriends] = useState([]);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showMenuPopup, setShowMenuPopup] = useState(false);


  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadFriends(currentUser.uid);
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

      // Get friend details
      const friendsData = [];
      
      for (const friendId of friendsList) {
        try {
          const friendDoc = await getDoc(doc(db, 'users', friendId));
          if (friendDoc.exists()) {
            const friendData = friendDoc.data();
            friendsData.push({
              uid: friendId,
              username: friendData.username || friendData.displayName || 'Unknown Player'
            });
          }
        } catch (error) {
          console.error('Failed to load friend data:', error);
        }
      }

      setFriends(friendsData);
    } catch (error) {
      console.error('Failed to load friends:', error);
      Alert.alert('Error', 'Failed to load friends list. Please try again.');
    } finally {
      setLoading(false);
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





  if (loading) {
    return (
      <SafeAreaView style={styles.screenContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screenContainer}>
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
     </SafeAreaView>
   );
};

export default CreateChallengeScreen;

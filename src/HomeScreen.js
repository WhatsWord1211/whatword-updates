import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styles from './styles';
import { loadSounds, playSound } from './soundsUtil';
import authService from './authService';

const HomeScreen = () => {
  const navigation = useNavigation();
  const [savedGames, setSavedGames] = useState([]);
  const [navigationReady, setNavigationReady] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showInvalidPopup, setShowInvalidPopup] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [user, setUser] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [gameInvites, setGameInvites] = useState([]);
  const [displayName, setDisplayName] = useState('Player');
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [activePvPGame, setActivePvPGame] = useState(null);
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const invitesUnsubscribeRef = useRef(null);
  const challengesUnsubscribeRef = useRef(null);
  const activeGamesUnsubscribeRef = useRef(null);

  // Load user profile and set up listeners
  const loadUserProfile = async (currentUser) => {
    try {
      console.log('HomeScreen: Loading profile for user:', currentUser.uid);
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('HomeScreen: User data from Firestore:', userData);
        
        // Try multiple sources for display name
        let displayNameToUse = 'Player';
        
        if (currentUser.displayName && currentUser.displayName.trim()) {
          displayNameToUse = currentUser.displayName.trim();
          console.log('HomeScreen: Using Firebase displayName:', displayNameToUse);
        } else if (userData.displayName && userData.displayName.trim()) {
          displayNameToUse = userData.displayName.trim();
          console.log('HomeScreen: Using Firestore displayName:', displayNameToUse);
        } else if (userData.username && userData.username.trim()) {
          displayNameToUse = userData.username.trim();
          console.log('HomeScreen: Using Firestore username:', displayNameToUse);
        } else if (currentUser.email) {
          // Use email prefix as fallback
          displayNameToUse = currentUser.email.split('@')[0];
          console.log('HomeScreen: Using email prefix as displayName:', displayNameToUse);
        }
        
        console.log('HomeScreen: Final displayName set to:', displayNameToUse);
        setDisplayName(displayNameToUse);
        
        // Set up listeners for all authenticated users
        setTimeout(() => {
          try {
            // Set up game invites listener
            const invitesQuery = query(
              collection(db, 'gameInvites'),
              where('toUid', '==', currentUser.uid),
              where('status', '==', 'pending')
            );
            const unsubscribeInvites = onSnapshot(invitesQuery, (snapshot) => {
              const invites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setGameInvites(invites);
            });
            if (invitesUnsubscribeRef.current) {
              invitesUnsubscribeRef.current();
            }
            invitesUnsubscribeRef.current = unsubscribeInvites;
            
            // Set up pending challenges listener
            const challengesQuery = query(
              collection(db, 'challenges'),
              where('receiverId', '==', currentUser.uid),
              where('status', '==', 'pending')
            );
            const unsubscribeChallenges = onSnapshot(challengesQuery, (snapshot) => {
              const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setPendingChallenges(challenges);
            });
            
            // Set up active PvP games listener
            const activeGamesQuery = query(
              collection(db, 'games'),
              where('playerId', '==', currentUser.uid),
              where('status', 'in', ['waiting', 'ready'])
            );
            const activeGamesUnsubscribe = onSnapshot(activeGamesQuery, (snapshot) => {
              const activeGames = [];
              snapshot.forEach((doc) => {
                const gameData = doc.data();
                if (gameData.status === 'ready') {
                  activeGames.push({ id: doc.id, ...gameData });
                }
              });
              setActivePvPGame(activeGames.length > 0 ? activeGames[0] : null);
            });
            
            // Store the unsubscribe functions for cleanup
            if (invitesUnsubscribeRef.current) {
              invitesUnsubscribeRef.current();
            }
            invitesUnsubscribeRef.current = unsubscribeInvites;
            
            // Store other unsubscribe functions
            if (challengesUnsubscribeRef.current) {
              challengesUnsubscribeRef.current();
            }
            challengesUnsubscribeRef.current = unsubscribeChallenges;
            
            if (activeGamesUnsubscribeRef.current) {
              activeGamesUnsubscribeRef.current();
            }
            activeGamesUnsubscribeRef.current = activeGamesUnsubscribe;
          } catch (error) {
            console.error('HomeScreen: Failed to set up listeners:', error);
          }
        }, 100); // Small delay to ensure UI is responsive
        
      } else {
        console.log('HomeScreen: No user document found, creating one...');
        // Create user profile if it doesn't exist
        const username = currentUser.email ? currentUser.email.split('@')[0] : `Player${Math.floor(Math.random() * 10000)}`;
        await setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          username: username,
          displayName: username,
          email: currentUser.email,
          createdAt: new Date(),
          lastLogin: new Date(),
          gamesPlayed: 0,
          gamesWon: 0,
          bestScore: 0,
          totalScore: 0,
          friends: [],
          isAnonymous: false
        });
        setDisplayName(username);
      }
    } catch (error) {
      console.error('HomeScreen: Failed to load user profile:', error);
      // Fallback to email prefix if available
      if (currentUser.email) {
        const emailName = currentUser.email.split('@')[0];
        setDisplayName(emailName);
        console.log('HomeScreen: Fallback to email prefix:', emailName);
      } else {
        setDisplayName('Player');
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    const authenticate = async () => {
      try {
        // Check if user is already signed in - this should be instant
        const currentUser = auth.currentUser;
        if (currentUser) {
          if (mounted) {
            setUser(currentUser);
            setIsAuthenticating(false);
            
            // Load profile and other data in background
            Promise.all([
              loadUserProfile(currentUser),
              loadSounds(),
              checkFirstLaunch(),
              loadSavedGames()
            ]).catch(console.error);
          }
          return;
        }

        // Set up auth state listener
        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
          if (mounted) {
            if (currentUser) {
              setUser(currentUser);
              setIsAuthenticating(false);
              
              // Load profile and other data in background
              Promise.all([
                loadUserProfile(currentUser),
                loadSounds(),
                checkFirstLaunch(),
                loadSavedGames()
              ]).catch(console.error);
            } else {
              // No user authenticated - this shouldn't happen in the new flow
              setIsAuthenticating(false);
            }
          }
        });

        return unsubscribeAuth;
      } catch (error) {
        console.error('HomeScreen: Authentication failed:', error);
        if (mounted) {
          setIsAuthenticating(false);
        }
      }
    };

    // Start authentication immediately
    authenticate();

    return () => {
      mounted = false;
      if (invitesUnsubscribeRef.current) {
        invitesUnsubscribeRef.current();
      }
      if (challengesUnsubscribeRef.current) {
        challengesUnsubscribeRef.current();
      }
      if (activeGamesUnsubscribeRef.current) {
        activeGamesUnsubscribeRef.current();
      }
    };
  }, []);

  const checkFirstLaunch = async () => {
    try {
      const hasLaunched = await AsyncStorage.getItem('hasLaunched');
      if (!hasLaunched) {
        setIsFirstLaunch(true);
        await AsyncStorage.setItem('hasLaunched', 'true');
      }
    } catch (error) {
      console.error('HomeScreen: Failed to check first launch:', error);
    }
  };

  const loadSavedGames = async () => {
    try {
      const savedGamesData = await AsyncStorage.getItem('savedGames');
      if (savedGamesData) {
        const games = JSON.parse(savedGamesData);
        setSavedGames(games);
      }
    } catch (error) {
      console.error('HomeScreen: Failed to load saved games:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setDisplayName('Player');
      setSavedGames([]);
      setGameInvites([]);
      setActivePvPGame(null);
      setPendingChallenges([]);
    } catch (error) {
      console.error('HomeScreen: Sign out failed:', error);
    }
  };

  const handleRefreshProfile = async () => {
    try {
      if (user) {
        console.log('HomeScreen: Refreshing user profile...');
        await loadUserProfile(user);
        console.log('HomeScreen: Profile refresh completed');
      }
    } catch (error) {
      console.error('HomeScreen: Failed to refresh profile:', error);
    }
  };

  const handleButtonPress = (screen, params) => {
    try {
      navigation.navigate(screen, params);
      playSound('chime');
    } catch (error) {
      console.error('HomeScreen: Navigation failed', error);
    }
  };

  const acceptGameInvite = async (invite) => {
    try {
      // Navigate to Friends screen to handle the invite
      navigation.navigate('Friends');
      await playSound('chime');
    } catch (error) {
      console.error('HomeScreen: Failed to accept game invite:', error);
      Alert.alert('Error', 'Failed to accept game invite. Please try again.');
    }
  };

  const renderGameItem = ({ item }) => (
    <TouchableOpacity
      style={styles.savedGameButton}
      onPress={() => {
        if (item.gameMode === 'solo') {
          navigation.navigate('Game', {
            gameMode: 'solo',
            wordLength: item.wordLength,
            soloWord: item.targetWord,
            guesses: item.guesses,
            inputWord: item.inputWord,
            alphabet: item.alphabet,
            targetWord: item.targetWord,
            gameState: item.gameState,
            hintCount: item.hintCount
          });
        } else if (item.gameMode === 'pvp') {
          // For PvP games, navigate to the game directly
          navigation.navigate('Game', {
            gameMode: 'pvp',
            gameId: item.gameId,
            playerId: user.uid,
            showDifficulty: false,
            gameState: 'playing',
            isCreator: item.isCreator,
            wordLength: item.wordLength
          });
        }
      }}
    >
      <Text style={styles.buttonText}>
        {item.gameMode === 'solo'
          ? `Solo (${item.wordLength} letters, Last Played: ${new Date(item.timestamp).toLocaleDateString()})`
          : `PvP Game (${item.wordLength} letters, Last Played: ${new Date(item.timestamp).toLocaleDateString()})`}
      </Text>
    </TouchableOpacity>
  );

  const renderInvite = ({ item }) => (
    <View style={styles.friendItem}>
      <Text style={styles.friendText}>Game Invite from {item.fromUid}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => acceptGameInvite(item)}
      >
        <Text style={styles.buttonText}>View</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screenContainer}>
      {/* Fixed Header Image - Outside ScrollView */}
      <Image
        source={require('../assets/images/WhatWord-header.png')}
        style={[styles.imageHeader, { marginTop: 5, marginBottom: 10 }]}
        resizeMode="contain"
      />
      
      {/* Scrollable Content */}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 20, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.header, { marginBottom: 10 }]}>Welcome, {displayName}</Text>
        
        {/* PvP Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            playSound('chime');
            navigation.navigate('Friends');
          }}
        >
          <Text style={styles.buttonText}>Play A Friend</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.button}
          onPress={() => handleButtonPress('Game', { gameMode: 'solo', showDifficulty: true })}
        >
          <Text style={styles.buttonText}>Play Solo</Text>
        </TouchableOpacity>
        
        {/* Active PvP Game */}
        {activePvPGame && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#10B981' }]}
            onPress={() => {
              console.log('HomeScreen: Return to Game button pressed', { gameId: activePvPGame.id });
              navigation.navigate('Game', {
                gameMode: 'pvp',
                gameId: activePvPGame.id,
                showDifficulty: false,
                gameState: activePvPGame.status === 'ready' ? 'playing' : 'waiting',
                isCreator: true,
                wordLength: activePvPGame.wordLength
              });
            }}
          >
            <Text style={styles.buttonText}>Return to Game ({activePvPGame.status === 'ready' ? 'Ready' : 'Waiting'})</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.button, savedGames.length === 0 && styles.disabledButton]}
          onPress={() => handleButtonPress('Game', { gameMode: 'resume' })}
          disabled={savedGames.length === 0}
        >
          <Text style={styles.buttonText}>Resume</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.button}
          onPress={() => handleButtonPress('HowToPlay')}
        >
          <Text style={styles.buttonText}>How To Play</Text>
        </TouchableOpacity>
        
        {/* Profile Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            playSound('chime');
            navigation.navigate('Profile');
          }}
        >
          <Text style={styles.buttonText}>Profile</Text>
        </TouchableOpacity>

        {/* Game Invites */}
        {gameInvites.length > 0 && (
          <>
            <Text style={styles.header}>Game Invites</Text>
            <FlatList
              data={gameInvites}
              renderItem={renderInvite}
              keyExtractor={item => item.id}
              style={{ width: "100%", maxHeight: 200 }}
            />
          </>
        )}


      </ScrollView>
      
      <TouchableOpacity
        style={[styles.fabTop, { top: 50, right: 20, zIndex: 1000 }]}
        onPress={() => {
          console.log('🔧 DEV MODE: FAB button tapped!');
          setShowMenuModal(true);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.fabText}>☰</Text>
      </TouchableOpacity>
      
      <Modal visible={showMenuModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow]}>
            <Text style={styles.header}>Menu</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={handleSignOut}
            >
              <Text style={styles.buttonText}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={handleRefreshProfile}
            >
              <Text style={styles.buttonText}>Refresh Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                handleButtonPress('Settings');
                setShowMenuModal(false);
              }}
            >
              <Text style={styles.buttonText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => setShowMenuModal(false)}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showResumeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.modalShadow]}>
            <Text style={styles.header}>Resume Game</Text>
            <FlatList
              data={savedGames}
              renderItem={renderGameItem}
              keyExtractor={(item) => item.gameId || `solo_${item.timestamp}`}
              style={{ maxHeight: 300 }}
            />
            <TouchableOpacity style={styles.button} onPress={() => setShowResumeModal(false)}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      <Modal visible={showInvalidPopup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.invalidGuessPopup, styles.modalShadow]}>
            <Text style={styles.header}>Error</Text>
            <Text style={styles.invalidGuessMessage}>An error occurred. Please try again.</Text>
            <TouchableOpacity
              style={styles.invalidGuessButtonContainer}
              onPress={() => setShowInvalidPopup(false)}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {isAuthenticating && !user && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Authenticating...</Text>
        </View>
        )}
    </View>
  );
};

export default HomeScreen;
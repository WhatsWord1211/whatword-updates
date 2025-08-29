// AuthScreen with clean authentication flow - no guest mode
// NOTE: Facebook and Google sign-in buttons are temporarily hidden for production
// They will be re-enabled once OAuth is properly configured and tested
// UPDATE: Main screen bypassed - goes directly to email form since it's the only sign-in option
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, SafeAreaView, Image } from "react-native";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithCredential, GoogleAuthProvider } from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// Configure WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();

const AuthScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(true); // Auto-show email form since it's the only option

  // Google OAuth configuration
  const googleConfig = {
    clientId: Constants.expoConfig.extra.googleClientId,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: AuthSession.makeRedirectUri({
      scheme: 'com.whatword.app'
    }),
  };

  const [request, response, promptAsync] = AuthSession.useAuthRequest(googleConfig);

  // Handle Google OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      handleGoogleSignInSuccess(authentication.accessToken);
    }
  }, [response]);

  const handleGoogleSignIn = async () => {
    try {
      console.log('🔧 DEV MODE: Starting Google OAuth...');
      await promptAsync();
    } catch (error) {
      console.error('🔧 DEV MODE: Google OAuth prompt error:', error);
      Alert.alert("Google Sign-In Error", "Failed to start Google sign-in process.");
    }
  };

  const handleGoogleSignInSuccess = async (accessToken) => {
    try {
      setLoading(true);
      console.log('🔧 DEV MODE: Google OAuth successful, getting user info...');
      
      // Get user info from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await userInfoResponse.json();
      
      console.log('🔧 DEV MODE: Google user info:', userInfo);
      
      // Create Firebase credential using the access token
      const credential = GoogleAuthProvider.credential(null, accessToken);
      const result = await signInWithCredential(auth, credential);
      
      console.log('🔧 DEV MODE: Firebase sign-in successful:', result.user.uid);
      
      // Check if user profile exists
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        // Update existing profile
        await updateDoc(userDocRef, {
          lastLogin: new Date(),
          email: result.user.email,
          displayName: result.user.displayName || userInfo.name || result.user.email.split('@')[0]
        });
        console.log('🔧 DEV MODE: Profile updated successfully');
      } else {
        // Create new profile
        await setDoc(userDocRef, {
          uid: result.user.uid,
          username: userInfo.name || result.user.email.split('@')[0],
          displayName: userInfo.name || result.user.email.split('@')[0],
          email: result.user.email,
          createdAt: new Date(),
          lastLogin: new Date(),
          gamesPlayed: 0,
          gamesWon: 0,
          bestScore: 0,
          totalScore: 0,
          friends: [],
          isAnonymous: false,
        });
        console.log('🔧 DEV MODE: Profile created successfully');
      }
      
      Alert.alert("Success!", "Signed in with Google successfully!");
      console.log('🔧 DEV MODE: Google sign-in completed, user should be redirected automatically');
      
    } catch (error) {
      console.error('🔧 DEV MODE: Google sign-in error:', error);
      Alert.alert("Google Sign-In Error", error.message || "An error occurred during Google sign-in.");
    } finally {
      setLoading(false);
    }
  };



  const handleFacebookSignIn = async () => {
    Alert.alert(
      "Coming Soon", 
      "Facebook sign-in will be available soon! For now, please use Google or email sign-in.",
      [{ text: "OK" }]
    );
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      console.log('🔧 DEV MODE: Starting email auth...');
      console.log('🔧 DEV MODE: Auth instance:', auth);
      console.log('🔧 DEV MODE: DB instance:', db);
      
      let result;

      if (isLogin) {
        console.log('🔧 DEV MODE: Attempting sign in...');
        result = await signInWithEmailAndPassword(auth, email, password);
        console.log('🔧 DEV MODE: Sign in successful:', result.user.uid);
        
        // Ensure user profile exists and is updated on sign in
        const userDocRef = doc(db, 'users', result.user.uid);
        console.log('🔧 DEV MODE: User doc ref created:', userDocRef.path);
        
        console.log('🔧 DEV MODE: Attempting to get user doc...');
        const userDoc = await getDoc(userDocRef);
        console.log('🔧 DEV MODE: User doc retrieved:', userDoc.exists());
        
        if (userDoc.exists()) {
          // Update existing profile with last login time
          console.log('🔧 DEV MODE: Updating existing profile...');
          await updateDoc(userDocRef, {
            lastLogin: new Date(),
            email: email
          });
          console.log('🔧 DEV MODE: Profile updated successfully');
        } else {
          // Create profile if it doesn't exist
          console.log('🔧 DEV MODE: Creating new profile...');
          await setDoc(userDocRef, {
            uid: result.user.uid,
            username: email.split('@')[0],
            displayName: email.split('@')[0],
            email: email,
            createdAt: new Date(),
            lastLogin: new Date(),
            gamesPlayed: 0,
            gamesWon: 0,
            bestScore: 0,
            totalScore: 0,
            friends: [],
            isAnonymous: false
          });
          console.log('🔧 DEV MODE: Profile created successfully');
        }
        

        console.log('🔧 DEV MODE: Sign in completed, user should be redirected automatically');
        console.log('🔧 DEV MODE: Current auth user:', auth.currentUser);
        
        // Add a small delay to ensure App.js state update propagates
        setTimeout(() => {
          console.log('🔧 DEV MODE: Delayed check - auth user:', auth.currentUser);
        }, 1000);
      } else {
        // Create new account
        console.log('🔧 DEV MODE: Creating new account...');
        result = await createUserWithEmailAndPassword(auth, email, password);
        console.log('🔧 DEV MODE: Account created:', result.user.uid);
        
        // Create user profile in Firestore
        console.log('🔧 DEV MODE: Creating user profile...');
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          username: email.split('@')[0],
          displayName: email.split('@')[0],
          email: email,
          createdAt: new Date(),
          lastLogin: new Date(),
          // Solo mode stats by difficulty
          easyGamesPlayed: 0,
          easyAverageScore: 0,
          regularGamesPlayed: 0,
          regularAverageScore: 0,
          hardGamesPlayed: 0,
          hardAverageScore: 0,
          totalScore: 0,
          // PvP mode stats
          pvpGamesPlayed: 0,
          pvpGamesWon: 0,
          pvpWinRate: 0,
          previousRank: 'Unranked',
          friends: [],
          isAnonymous: false,
          // Premium status
          isPremium: false,
          hardModeUnlocked: false
        });
        console.log('🔧 DEV MODE: Profile created successfully');
        
        Alert.alert("Success!", "Account created successfully! You can now customize your profile.");
        console.log('🔧 DEV MODE: Account creation completed, user should be redirected automatically');
        console.log('🔧 DEV MODE: Current auth user:', auth.currentUser);
        
        // Add a small delay to ensure App.js state update propagates
        setTimeout(() => {
          console.log('🔧 DEV MODE: Delayed check - auth user:', auth.currentUser);
        }, 1000);
      }
    } catch (error) {
      console.error('🔧 DEV MODE: Auth error:', error);
      console.error('🔧 DEV MODE: Error code:', error.code);
      console.error('🔧 DEV MODE: Error message:', error.message);
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTermsPress = () => {
    Alert.alert(
      "Terms & Privacy", 
      "Terms of Service and Privacy Policy will be available soon.",
      [{ text: "OK" }]
    );
  };



  if (showEmailForm) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.welcomeTextEmail}>Welcome To</Text>
        
          <Image
            source={require('../assets/images/WhatWord-header.png')}
            style={styles.headerImageEmail}
            resizeMode="contain"
          />
        
        <Text style={styles.subtitle}>
          {isLogin ? "" : "Create your account"}
        </Text>
        
        <Text style={styles.gameDescription}>
          Solve your friend's word before they solve yours
        </Text>
          
          <View style={styles.formEmail}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            
            <TouchableOpacity 
              style={[styles.button, loading && styles.disabledButton]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Loading..." : (isLogin ? "Sign In" : "Create Account")}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.textButton}
              onPress={() => setIsLogin(!isLogin)}
            >
              <Text style={styles.textButtonText}>
                {isLogin ? "Need an account? Create Account" : "Have an account? Sign In"}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Terms and Conditions */}
          <TouchableOpacity 
            style={styles.termsContainer}
            onPress={handleTermsPress}
          >
            <Text style={styles.termsText}>
              By continuing, you agree to the{" "}
              <Text style={styles.termsLink}>terms</Text>
              {" "}and{" "}
              <Text style={styles.termsLink}>privacy policy</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Main screen temporarily bypassed since only email sign-in is available
  // This will be re-enabled when social sign-in options are added back
  /*
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.welcomeText}>Welcome To</Text>
        
        <Image
          source={require('../assets/images/WhatWord-header.png')}
          style={styles.headerImage}
          resizeMode="contain"
        />
        
        <Text style={styles.subtitle}>Sign in with your email to start playing with friends!</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.socialButton, styles.emailButton]}
            onPress={() => setShowEmailForm(true)}
          >
            <Text style={styles.emailButtonText}>✉️ Sign in with Email</Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          style={styles.termsContainer}
          onPress={handleTermsPress}
        >
          <Text style={styles.termsText}>
            By continuing, you agree to the{" "}
            <Text style={styles.termsLink}>terms</Text>
            {" "}and{" "}
            <Text style={styles.termsLink}>privacy policy</Text>
          </Text>
        </TouchableOpacity>
        
        <View style={styles.socialNoteContainer}>
          <Text style={styles.socialNoteText}>
            🔒 Social sign-in options (Google, Facebook) will be available soon!
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
  */
  
  // Since we only have email sign-in, go directly to email form
  return null;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1F2937",
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },
  headerImage: {
    width: "100%",
    height: 120,
    marginTop: 20,
    maxWidth: 350,
  },
  headerImageEmail: {
    width: "100%",
    height: 120,
    marginTop: -10,
    marginBottom: 15,
    maxWidth: 350,
  },
  welcomeText: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#E5E7EB",
    marginBottom: 20,
    textAlign: "center",
  },
  welcomeTextEmail: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#E5E7EB",
    marginBottom: 10,
    marginTop: 30,
    textAlign: "center",
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#F59E0B",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: "#E5E7EB",
    marginBottom: 20,
    textAlign: "center",
  },
  gameDescription: {
    fontSize: 20, // Increased from 16 to 20 for better visibility
    color: "#E5E7EB", // Changed from #9CA3AF to #E5E7EB for better contrast
    marginBottom: 30,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 26, // Increased line height to match larger font
    fontWeight: "500", // Added medium weight for better readability
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 300,
    marginBottom: 40,
  },
  socialButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
  },
  facebookButton: {
    backgroundColor: "#1877F2",
    borderColor: "#1877F2",
  },
  facebookButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  googleButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DB4437",
  },
  googleButtonText: {
    color: "#DB4437",
    fontSize: 16,
    fontWeight: "600",
  },
  emailButton: {
    backgroundColor: "#F59E0B",
    borderColor: "#F59E0B",
  },
  emailButtonText: {
    color: "#1F2937",
    fontSize: 16,
    fontWeight: "600",
  },
  form: {
    width: "100%",
    maxWidth: 300,
    marginBottom: 30,
  },
  formEmail: {
    width: "100%",
    maxWidth: 300,
    marginBottom: 30,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    color: "#E5E7EB",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  button: {
    backgroundColor: "#F59E0B",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 15,
  },
  buttonText: {
    color: "#1F2937",
    fontSize: 16,
    fontWeight: "600",
  },
  textButton: {
    alignItems: "center",
  },
  textButtonText: {
    color: "#F59E0B",
    fontSize: 14,
  },
  backButton: {
    alignItems: "center",
    marginBottom: 20,
  },
  backButtonEmail: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 10,
  },
  backButtonText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  termsContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  termsText: {
    color: "#9CA3AF",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  termsLink: {
    color: "#F59E0B",
    textDecorationLine: "underline",
  },
  socialNoteContainer: {
    alignItems: "center",
    marginTop: 15,
    paddingHorizontal: 20,
  },
  socialNoteText: {
    color: "#9CA3AF",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
    fontStyle: "italic",
  },
  testButton: {
    backgroundColor: "#6B7280",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  testButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default AuthScreen;

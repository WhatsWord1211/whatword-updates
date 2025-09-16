// AuthScreen with improved user experience flow
// - Defaults to "Create Account" for new users (better conversion)
// - "Sign In" option easily accessible for returning users
// - Firebase automatically handles "remember me" functionality
// - No guest mode - clean authentication flow
// NOTE: Facebook and Google sign-in buttons are temporarily hidden for production
// They will be re-enabled once OAuth is properly configured and tested
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, SafeAreaView, Image, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useNavigation } from '@react-navigation/native';

import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithCredential, GoogleAuthProvider, sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from './ThemeContext';

// Configure WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();

const AuthScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(false); // Default to Create Account for new users
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(true); // Auto-show email form since it's the only option
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      await promptAsync();
    } catch (error) {
      console.error('Google OAuth prompt error:', error);
      Alert.alert("Google Sign-In Error", "Failed to start Google sign-in process.");
    }
  };

  const handleGoogleSignInSuccess = async (accessToken) => {
    try {
      setLoading(true);
      
      // Get user info from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await userInfoResponse.json();
      
      // Create Firebase credential using the access token
      const credential = GoogleAuthProvider.credential(null, accessToken);
      const result = await signInWithCredential(auth, credential);
      
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
      }
      
      Alert.alert("Success!", "Signed in with Google successfully!");
      
    } catch (error) {
      console.error('Google sign-in error:', error);
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

  const handlePasswordReset = async () => {
    if (!email) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert(
        "Password Reset Sent", 
        "Check your email for instructions to reset your password.",
        [
          {
            text: "OK",
            onPress: () => {
              setShowPasswordReset(false);
              setEmail("");
            }
          }
        ]
      );
    } catch (error) {
      console.error("AuthScreen: Password reset error:", error);
      let errorMessage = "An error occurred. Please try again.";
      
      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email address.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Please enter a valid email address.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many requests. Please try again later.";
      }
      
      Alert.alert("Password Reset Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    // Check password confirmation for new accounts
    if (!isLogin && password !== confirmPassword) {
      Alert.alert("Password Mismatch", "Passwords do not match. Please make sure both password fields are identical.");
      return;
    }

    // Check password length for new accounts
    if (!isLogin && password.length < 6) {
      Alert.alert("Password Too Short", "Password must be at least 6 characters long.");
      return;
    }

    // Check terms agreement for new accounts
    if (!isLogin && !agreeToTerms) {
      Alert.alert("Terms Agreement Required", "You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }

    try {
      setLoading(true);
      let result;

      if (isLogin) {
        result = await signInWithEmailAndPassword(auth, email, password);
        
        // Ensure user profile exists and is updated on sign in
        const userDocRef = doc(db, 'users', result.user.uid);
        
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          // Update existing profile with last login time
          await updateDoc(userDocRef, {
            lastLogin: new Date(),
            email: email
          });
        } else {
          // Create profile if it doesn't exist
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
        }
      } else {
        // Create new account
        result = await createUserWithEmailAndPassword(auth, email, password);
        
        // Create user profile in Firestore
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
        
        Alert.alert("Success!", "Account created successfully! You can now customize your profile.");
      }
    } catch (error) {
      console.error('Auth error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };





  if (showEmailForm) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView 
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>
                  <Text style={[styles.welcomeTextEmail, { color: colors.textPrimary }]}>Welcome To</Text>
        
        <Image
          source={require('../assets/images/WhatWord-header.png')}
          style={styles.headerImageEmail}
          resizeMode="contain"
        />
      
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {isLogin ? "" : ""}
      </Text>
      
      <Text style={[styles.gameDescription, { color: colors.textSecondary }]}>
        Solve your friend's word before they solve yours
      </Text>
          
          <View style={styles.formEmail}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, styles.passwordInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={[styles.passwordToggleText, { color: colors.textMuted }]}>
                  {showPassword ? '🙈' : '👁️'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* Confirm Password Field - Only show for new accounts */}
            {!isLogin && (
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="Confirm Password"
                  placeholderTextColor={colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Text style={[styles.passwordToggleText, { color: colors.textMuted }]}>
                    {showConfirmPassword ? '🙈' : '👁️'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Terms Agreement Checkbox - Only show for new accounts */}
            {!isLogin && (
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={[
                    styles.checkbox, 
                    { borderColor: colors.primary },
                    agreeToTerms && { backgroundColor: colors.primary }
                  ]}
                  onPress={() => setAgreeToTerms(!agreeToTerms)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {agreeToTerms && <Text style={[styles.checkmark, { color: colors.textInverse }]}>✓</Text>}
                </TouchableOpacity>
                <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>
                  I agree to the{" "}
                  <Text style={[styles.termsLink, { color: colors.primary }]} onPress={() => navigation.navigate('Legal', { section: 'terms' })}>Terms of Service</Text>
                  {" "}and{" "}
                  <Text style={[styles.termsLink, { color: colors.primary }]} onPress={() => navigation.navigate('Legal', { section: 'privacy' })}>Privacy Policy</Text>
                </Text>
              </View>
            )}
            
            <TouchableOpacity 
              style={[styles.button, loading && styles.disabledButton]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Loading..." : (isLogin ? "Sign In" : "Create Account")}
              </Text>
            </TouchableOpacity>
            
            {isLogin && (
              <TouchableOpacity 
                style={styles.textButton}
                onPress={() => setShowPasswordReset(true)}
              >
                <Text style={[styles.textButtonText, { color: '#8B5CF6', textDecorationLine: 'underline' }]}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={styles.textButton}
              onPress={() => {
                setIsLogin(!isLogin);
                // Clear form fields when switching modes
                setEmail("");
                setPassword("");
                setConfirmPassword("");
                setShowPassword(false);
                setShowConfirmPassword(false);
                setAgreeToTerms(false);
              }}
            >
              <Text style={styles.textButtonText}>
                {isLogin ? "New to WhatWord? " : "Already have an account? "}
                {isLogin && (
                  <Text style={[styles.textButtonText, { color: '#8B5CF6' }]}>Create Account</Text>
                )}
                {!isLogin && (
                  <Text style={[styles.textButtonText, { color: '#8B5CF6' }]}>Sign In</Text>
                )}
              </Text>
            </TouchableOpacity>
          </View>
          

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        
        {/* Password Reset Modal */}
        {showPasswordReset && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modal, { backgroundColor: '#1F2937' }]}>
              <Text style={[styles.modalTitle, { color: '#FFFFFF' }]}>Reset Password</Text>
              <Text style={[styles.modalText, { color: '#FFFFFF' }]}>
                Enter your email address and we'll send you instructions to reset your password.
              </Text>
              
              <TextInput
                style={[styles.input, { 
                  backgroundColor: '#F9FAFB', 
                  color: '#1F2937',
                  borderColor: '#D1D5DB' 
                }]}
                placeholder="Email"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={[styles.modalButton, { backgroundColor: '#E5E7EB' }]}
                  onPress={() => {
                    setShowPasswordReset(false);
                    setEmail("");
                  }}
                >
                  <Text style={[styles.modalButtonText, { color: '#1F2937' }]}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonPrimary, { backgroundColor: colors.primary }]}
                  onPress={handlePasswordReset}
                  disabled={loading}
                >
                  <Text style={[styles.modalButtonText, { color: 'white' }]}>
                    {loading ? "Sending..." : "Reset Password"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Main screen temporarily bypassed since only email sign-in is available
  // This will be re-enabled when social sign-in options are added back
  /*
  return (
    <SafeAreaView style={[styles.container, { paddingBottom: 40 }]}>
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
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    padding: 20,
    paddingTop: 40,
    minHeight: '100%',
  },
  headerImage: {
    width: "100%",
    height: 120,
    marginTop: 20,
    maxWidth: 350,
  },
  headerImageEmail: {
    width: "100%",
    height: 100,
    marginTop: -10,
    marginBottom: -5,
    maxWidth: 300,
  },
  welcomeText: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#E5E7EB",
    marginBottom: 20,
    textAlign: "center",
  },
  welcomeTextEmail: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#E5E7EB",
    marginBottom: 10,
    marginTop: 20,
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
    fontSize: 18, // Reduced for better fit on smaller screens
    color: "#E5E7EB", // Changed from #9CA3AF to #E5E7EB for better contrast
    marginBottom: 20,
    marginTop: -10,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 24, // Adjusted line height
    fontWeight: "500", // Added medium weight for better readability
  },
  welcomeBackText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 15,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 300,
    marginBottom: 20,
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
    marginBottom: 20,
  },
  formEmail: {
    width: "100%",
    maxWidth: 300,
    marginBottom: 20,
    marginTop: 5,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 15,
    marginBottom: 16,
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
    marginBottom: 10,
    marginTop: 8,
  },
  buttonText: {
    color: "#1F2937",
    fontSize: 16,
    fontWeight: "600",
  },
  textButton: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 10,
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
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 0,
    paddingHorizontal: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#F59E0B',
    borderRadius: 4,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    padding: 2,
  },
  checkboxChecked: {
    backgroundColor: '#F59E0B',
  },
  checkmark: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    color: '#E5E7EB',
    fontSize: 14,
    flex: 1,
    lineHeight: 18,
  },
  passwordContainer: {
    position: 'relative',
    marginBottom: 0,
  },
  passwordInput: {
    paddingRight: 50, // Make room for the toggle button
  },
  passwordToggle: {
    position: 'absolute',
    right: 15,
    top: 15,
    padding: 5,
  },
  passwordToggleText: {
    fontSize: 18,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 24,
    margin: 20,
    minWidth: 300,
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 0.4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    flex: 0.6,
    backgroundColor: '#8B5CF6',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AuthScreen;

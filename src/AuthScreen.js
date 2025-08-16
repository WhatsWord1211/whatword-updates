import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  Alert, 
  ScrollView, 
  SafeAreaView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from './firebase';
import authService from './authService';
import styles from './styles';
import { playSound } from './soundsUtil';

const AuthScreen = () => {
  const navigation = useNavigation();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleEmailSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await authService.signInWithEmail(email.trim(), password);
      await playSound('chime');
      navigation.navigate('Home');
    } catch (error) {
      console.error('AuthScreen: Email sign in failed:', error);
      let errorMessage = 'Sign in failed. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please sign up first.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      }
      
      Alert.alert('Sign In Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    if (!email.trim() || !password.trim() || !username.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    if (username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters long');
      return;
    }

    setIsLoading(true);
    try {
      await authService.signUpWithEmail(email.trim(), password, username.trim());
      await playSound('chime');
      Alert.alert('Success', 'Account created successfully!', [
        { text: 'OK', onPress: () => navigation.navigate('Home') }
      ]);
    } catch (error) {
      console.error('AuthScreen: Email sign up failed:', error);
      let errorMessage = 'Sign up failed. Please try again.';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please choose a stronger password.';
      } else if (error.message.includes('Username is already taken')) {
        errorMessage = error.message;
      }
      
      Alert.alert('Sign Up Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      // Google Sign-In not yet implemented in Expo
      Alert.alert(
        'Coming Soon', 
        'Google Sign-In will be available soon! For now, please use email/password or anonymous sign-in.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('AuthScreen: Google sign in failed:', error);
      Alert.alert('Google Sign In Error', 'Google sign in is not yet available.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    try {
      await authService.signInWithApple();
      await playSound('chime');
      navigation.navigate('Home');
    } catch (error) {
      console.error('AuthScreen: Apple sign in failed:', error);
      Alert.alert('Apple Sign In Error', 'Apple sign in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setIsLoading(true);
    try {
      await authService.signInAnonymously();
      await playSound('chime');
      navigation.navigate('Home');
    } catch (error) {
      console.error('AuthScreen: Anonymous sign in failed:', error);
      Alert.alert('Anonymous Sign In Error', 'Anonymous sign in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address first');
      return;
    }

    try {
      await authService.resetPassword(email.trim());
      Alert.alert('Password Reset', 'Password reset email sent! Check your inbox.');
    } catch (error) {
      console.error('AuthScreen: Password reset failed:', error);
      Alert.alert('Error', 'Failed to send password reset email. Please try again.');
    }
  };

  const renderSignInForm = () => (
    <View style={styles.authForm}>
      <Text style={styles.authTitle}>Welcome Back!</Text>
      <Text style={styles.authSubtitle}>Sign in to continue playing</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      
      <View style={styles.passwordContainer}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Text style={styles.eyeButtonText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity
        style={styles.forgotPasswordButton}
        onPress={handleForgotPassword}
      >
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.button, styles.primaryButton]}
        onPress={handleEmailSignIn}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>
          {isLoading ? 'Signing In...' : 'Sign In'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSignUpForm = () => (
    <View style={styles.authForm}>
      <Text style={styles.authTitle}>Create Account</Text>
      <Text style={styles.authSubtitle}>Join the word game community</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      
      <View style={styles.passwordContainer}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Text style={styles.eyeButtonText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.passwordContainer}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowConfirmPassword(!showConfirmPassword)}
        >
          <Text style={styles.eyeButtonText}>{showConfirmPassword ? '👁️' : '👁️‍🗨️'}</Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity
        style={[styles.button, styles.primaryButton]}
        onPress={handleEmailSignUp}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>
          {isLoading ? 'Creating Account...' : 'Create Account'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.screenContainer}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={styles.authContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.authHeader}>
            <Text style={styles.appTitle}>WhatWord</Text>
            <Text style={styles.appSubtitle}>Challenge your friends to word games!</Text>
          </View>

          {/* Auth Forms */}
          {isSignUp ? renderSignUpForm() : renderSignInForm()}

          {/* Toggle between Sign In/Sign Up */}
          <View style={styles.authToggle}>
            <Text style={styles.authToggleText}>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
            </Text>
            <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
              <Text style={styles.authToggleButton}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Sign In Buttons */}
          <View style={styles.socialButtons}>
            <TouchableOpacity
              style={[styles.button, styles.googleButton]}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.appleButton]}
              onPress={handleAppleSignIn}
              disabled={isLoading}
            >
              <Text style={styles.appleButtonText}>Continue with Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Anonymous Sign In */}
          <View style={styles.anonymousSection}>
            <Text style={styles.anonymousText}>Just want to play solo?</Text>
            <TouchableOpacity
              style={[styles.button, styles.anonymousButton]}
              onPress={handleAnonymousSignIn}
              disabled={isLoading}
            >
              <Text style={styles.anonymousButtonText}>Play as Guest</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default AuthScreen;

// AuthScreen with full authentication functionality
import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, SafeAreaView } from "react-native";
import { signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAnonymousSignIn = async () => {
    try {
      setLoading(true);
      const result = await signInAnonymously(auth);
      
      // Create user profile in Firestore
      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        username: `Player${Math.floor(Math.random() * 10000)}`,
        email: null,
        createdAt: new Date(),
        gamesPlayed: 0,
        gamesWon: 0,
        bestScore: 0,
        totalScore: 0,
        friends: [],
        isAnonymous: true
      });
      
      Alert.alert("Success!", "Signed in anonymously");
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      let result;

      if (isLogin) {
        result = await signInWithEmailAndPassword(auth, email, password);
        Alert.alert("Success!", "Signed in successfully");
      } else {
        result = await createUserWithEmailAndPassword(auth, email, password);
        
        // Create user profile in Firestore
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          username: email.split('@')[0],
          email: email,
          createdAt: new Date(),
          gamesPlayed: 0,
          gamesWon: 0,
          bestScore: 0,
          totalScore: 0,
          friends: [],
          isAnonymous: false
        });
        
        Alert.alert("Success!", "Account created successfully");
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>WhatWord</Text>
        <Text style={styles.subtitle}>Word Guessing Game</Text>
        
        <View style={styles.form}>
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
              {loading ? "Loading..." : (isLogin ? "Sign In" : "Sign Up")}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.textButton}
            onPress={() => setIsLogin(!isLogin)}
          >
            <Text style={styles.textButtonText}>
              {isLogin ? "Need an account? Sign Up" : "Have an account? Sign In"}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>
        
        <TouchableOpacity 
          style={[styles.anonymousButton, loading && styles.disabledButton]}
          onPress={handleAnonymousSignIn}
          disabled={loading}
        >
          <Text style={styles.anonymousButtonText}>
            {loading ? "Loading..." : "Play as Guest"}
          </Text>
        </TouchableOpacity>
        
        <Text style={styles.firebaseStatus}>
          Firebase: {auth ? "Connected ✅" : "Not Connected ❌"}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1F2937",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
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
    marginBottom: 40,
    textAlign: "center",
  },
  form: {
    width: "100%",
    maxWidth: 300,
    marginBottom: 30,
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
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 30,
    width: "100%",
    maxWidth: 300,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#4B5563",
  },
  dividerText: {
    color: "#9CA3AF",
    marginHorizontal: 15,
    fontSize: 14,
  },
  anonymousButton: {
    backgroundColor: "#374151",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 30,
  },
  anonymousButtonText: {
    color: "#E5E7EB",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
  firebaseStatus: {
    color: "#9CA3AF",
    fontSize: 12,
    textAlign: "center",
  },
});

export default AuthScreen;

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import styles from './styles';

const LegalScreen = ({ route }) => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [activeSection, setActiveSection] = useState(route?.params?.section || 'privacy');

  const openExternalLink = (url) => {
    Linking.openURL(url).catch(err => console.error('Failed to open URL:', err));
  };

  const renderPrivacyPolicy = () => (
    <View style={[styles.settingsSection, { backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Privacy Policy</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
        Last Updated: August 29, 2025
      </Text>
      
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        WhatWord ("the App") is developed and published by John Wilder. This Privacy Policy explains how we collect, use, and protect your information when you use WhatWord.
      </Text>

      <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Information We Collect:</Text>
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        • Authentication & Profile Data (User ID, email, username){'\n'}
        • Game Performance & Statistics{'\n'}
        • Game Data (progress, history, solutions){'\n'}
        • Social & Friend Data{'\n'}
        • App Usage & Preferences{'\n'}
        • Device & Technical Data{'\n'}
        • Advertising & Analytics Data (via Google AdMob)
      </Text>

      <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Your Rights:</Text>
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        • Access your personal data{'\n'}
        • Request corrections or updates{'\n'}
        • Request account deletion{'\n'}
        • Opt out of personalized ads
      </Text>

      <TouchableOpacity
        style={[styles.enhancedActionButton, { backgroundColor: colors.primary, borderColor: colors.primaryDark }]}
        onPress={() => openExternalLink('mailto:wilderbssmstr@gmail.com?subject=Privacy%20Policy%20Question')}
      >
        <Text style={[styles.enhancedActionButtonText, { color: colors.textInverse }]}>📧 Contact Us About Privacy</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTermsOfService = () => (
    <View style={[styles.settingsSection, { backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Terms of Service</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
        Last Updated: August 29, 2025
      </Text>
      
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        Welcome to WhatWord! By downloading or using the App, you agree to these Terms of Service. Please read them carefully.
      </Text>

      <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Eligibility & Accounts:</Text>
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        • Must be at least 13 years old{'\n'}
        • Parental permission required if under 18{'\n'}
        • Account security is your responsibility{'\n'}
        • You're responsible for all account activity
      </Text>

      <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Acceptable Use:</Text>
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        • No harassment, cheating, or hacking{'\n'}
        • No offensive or illegal content{'\n'}
        • Violations may result in account termination{'\n'}
        • Play fairly and respect other players
      </Text>

      <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Game Features:</Text>
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        • Solo play, PvP challenges, statistics tracking{'\n'}
        • Social connections and friend features{'\n'}
        • Features may change at our discretion{'\n'}
        • Service provided "as is" without guarantees
      </Text>

      <TouchableOpacity
        style={[styles.enhancedActionButton, { backgroundColor: colors.primary, borderColor: colors.primaryDark }]}
        onPress={() => openExternalLink('mailto:wilderbssmstr@gmail.com?subject=Terms%20of%20Service%20Question')}
      >
        <Text style={[styles.enhancedActionButtonText, { color: colors.textInverse }]}>📋 Contact Us About Terms</Text>
      </TouchableOpacity>
    </View>
  );

  const renderDataCollection = () => (
    <View style={[styles.settingsSection, { backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Data Collection Notice</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
        Summary of our data practices
      </Text>
      
      <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Essential Data (Required):</Text>
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        • Account information for authentication{'\n'}
        • Game data for functionality{'\n'}
        • Social data for multiplayer features
      </Text>

      <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Optional Data (You Control):</Text>
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        • Privacy settings and preferences{'\n'}
        • Notification preferences{'\n'}
        • Appearance and audio settings
      </Text>

      <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>We Do NOT:</Text>
      <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
        • Sell your personal data{'\n'}
        • Share data with unauthorized parties{'\n'}
        • Collect data from children under 13
      </Text>

      <TouchableOpacity
        style={[styles.enhancedActionButton, { backgroundColor: colors.accent, borderColor: colors.accentDark }]}
        onPress={() => navigation.navigate('PrivacySettings')}
      >
        <Text style={[styles.enhancedActionButtonText, { color: colors.textInverse }]}>🔒 Manage Privacy Settings</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContactInfo = () => (
    <View style={[styles.settingsSection, { backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Contact Information</Text>
      
      <View style={styles.infoContainer}>
        <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Developer:</Text>
        <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
          John Wilder{'\n'}
          1507 Brookdale Dr.{'\n'}
          Atchison, KS 66002
        </Text>

        <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Email:</Text>
        <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
          wilderbssmstr@gmail.com
        </Text>

        <Text style={[styles.infoTitle, { color: colors.textSecondary, marginBottom: 8 }]}>Response Time:</Text>
        <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
          We aim to respond to all inquiries within 48 hours during business days.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.enhancedActionButton, { backgroundColor: colors.primary, borderColor: colors.primaryDark }]}
        onPress={() => openExternalLink('mailto:wilderbssmstr@gmail.com?subject=WhatWord%20Support')}
      >
        <Text style={[styles.enhancedActionButtonText, { color: colors.textInverse }]}>📧 Send Email</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTabButton = (sectionName, label) => (
    <TouchableOpacity
      style={[
        styles.tabLink,
        { borderBottomColor: activeSection === sectionName ? colors.primary : 'transparent' }
      ]}
      onPress={() => setActiveSection(sectionName)}
    >
      <Text 
        style={[
          styles.tabLinkText,
          { color: activeSection === sectionName ? colors.primary : colors.textSecondary }
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.screenContainer, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            playSound('backspace');
            navigation.goBack();
          }}
        >
          <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Legal & Privacy</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {renderTabButton('privacy', 'Privacy')}
        {renderTabButton('terms', 'Terms')}
        {renderTabButton('data', 'Data')}
        {renderTabButton('contact', 'Contact')}
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeSection === 'privacy' && renderPrivacyPolicy()}
        {activeSection === 'terms' && renderTermsOfService()}
        {activeSection === 'data' && renderDataCollection()}
        {activeSection === 'contact' && renderContactInfo()}

        {/* Footer */}
        <View style={[styles.settingsSection, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted, textAlign: 'center' }]}>
            These documents are legally binding. Please read them carefully.{'\n'}
            By using WhatWord, you agree to these terms and our privacy practices.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default LegalScreen;

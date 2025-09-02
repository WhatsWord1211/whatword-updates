// Theme configuration for WhatWord app
// Supports both dark and light modes with consistent color schemes

export const themes = {
  dark: {
    // Primary colors
    primary: '#F59E0B',        // Orange - main brand color
    primaryDark: '#D97706',    // Darker orange for pressed states
    primaryLight: '#FCD34D',   // Lighter orange for highlights
    
    // Background colors
    background: '#1F2937',     // Main background
    surface: '#374151',        // Card/surface background
    surfaceLight: '#4B5563',   // Lighter surface elements
    surfaceDark: '#111827',    // Darker surface elements
    
    // Text colors
    textPrimary: '#F9FAFB',    // Primary text
    textSecondary: '#E5E7EB',  // Secondary text
    textTertiary: '#D1D5DB',   // Tertiary text
    textMuted: '#9CA3AF',      // Muted/subtle text
    textInverse: '#1F2937',    // Text on primary backgrounds
    
    // Status colors
    success: '#10B981',        // Green for success
    warning: '#F59E0B',        // Orange for warnings
    error: '#EF4444',          // Red for errors
    info: '#3B82F6',           // Blue for info
    
    // Interactive elements
    border: '#4B5563',         // Border color
    borderLight: '#6B7280',    // Light border
    borderDark: '#374151',     // Dark border
    
    // Shadows and overlays
    shadow: '#000000',         // Shadow color
    overlay: 'rgba(0, 0, 0, 0.7)', // Modal overlay
    
    // Special colors
    accent: '#8B5CF6',         // Purple accent
    highlight: '#FEF3C7',      // Highlight color
  },
  
  light: {
    // Primary colors (same brand colors)
    primary: '#F59E0B',        // Orange - main brand color
    primaryDark: '#D97706',    // Darker orange for pressed states
    primaryLight: '#FCD34D',   // Lighter orange for highlights
    
    // Background colors
    background: '#FFFFFF',     // Main background
    surface: '#F9FAFB',        // Card/surface background
    surfaceLight: '#F3F4F6',   // Lighter surface elements
    surfaceDark: '#E5E7EB',    // Darker surface elements
    
    // Text colors
    textPrimary: '#111827',    // Primary text
    textSecondary: '#374151',  // Secondary text
    textTertiary: '#4B5563',   // Tertiary text
    textMuted: '#6B7280',      // Muted/subtle text
    textInverse: '#FFFFFF',    // Text on primary backgrounds
    
    // Status colors
    success: '#059669',        // Green for success
    warning: '#D97706',        // Orange for warnings
    error: '#DC2626',          // Red for errors
    info: '#2563EB',           // Blue for info
    
    // Interactive elements
    border: '#D1D5DB',         // Border color
    borderLight: '#E5E7EB',    // Light border
    borderDark: '#9CA3AF',     // Dark border
    
    // Shadows and overlays
    shadow: '#000000',         // Shadow color
    overlay: 'rgba(0, 0, 0, 0.5)', // Modal overlay
    
    // Special colors
    accent: '#7C3AED',         // Purple accent
    highlight: '#FEF3C7',      // Highlight color
  }
};

// Default theme
export const defaultTheme = 'dark';

// Theme context for React components
export const getThemeColors = (themeName = defaultTheme) => {
  return themes[themeName] || themes[defaultTheme];
};

// Helper function to get contrast color for text on primary backgrounds
export const getContrastColor = (themeName = defaultTheme) => {
  const theme = getThemeColors(themeName);
  return theme.textInverse;
};

// Helper function to get theme-aware shadow
export const getThemeShadow = (themeName = defaultTheme, elevation = 2) => {
  const theme = getThemeColors(themeName);
  const opacity = Math.min(0.1 + (elevation * 0.05), 0.3);
  
  return {
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: elevation },
    shadowOpacity: opacity,
    shadowRadius: elevation * 2,
    elevation: elevation,
  };
};


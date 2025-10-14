/**
 * Responsive Design Utilities for WhatWord
 * Provides adaptive sizing for iPhone and iPad screens
 */

import { Dimensions, Platform } from 'react-native';

// Get device dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Detects if the current device is a tablet (iPad)
 * @returns {boolean} True if device is a tablet
 */
export const isTablet = () => {
  // iPad typically has width >= 768px in portrait mode
  // Use aspect ratio as additional check (iPads are closer to square)
  const aspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
  return Platform.OS === 'ios' && SCREEN_WIDTH >= 768 && aspectRatio < 1.6;
};

/**
 * Returns responsive width based on device type
 * @param {number} phoneWidth - Width for iPhone
 * @param {number} tabletWidth - Width for iPad (optional, defaults to phoneWidth * 1.6)
 * @returns {number} Appropriate width for current device
 */
export const responsiveWidth = (phoneWidth, tabletWidth = null) => {
  if (isTablet()) {
    return tabletWidth || phoneWidth * 1.6;
  }
  return phoneWidth;
};

/**
 * Returns responsive font size based on device type
 * @param {number} phoneSize - Font size for iPhone
 * @param {number} tabletSize - Font size for iPad (optional, defaults to phoneSize * 1.2)
 * @returns {number} Appropriate font size for current device
 */
export const responsiveFontSize = (phoneSize, tabletSize = null) => {
  if (isTablet()) {
    return tabletSize || phoneSize * 1.2;
  }
  return phoneSize;
};

/**
 * Returns responsive padding/margin based on device type
 * @param {number} phoneSpacing - Spacing for iPhone
 * @param {number} tabletSpacing - Spacing for iPad (optional, defaults to phoneSpacing * 1.5)
 * @returns {number} Appropriate spacing for current device
 */
export const responsiveSpacing = (phoneSpacing, tabletSpacing = null) => {
  if (isTablet()) {
    return tabletSpacing || phoneSpacing * 1.5;
  }
  return phoneSpacing;
};

/**
 * Get content container width (limits max width for readability)
 * @returns {number} Maximum content width
 */
export const getContentWidth = () => {
  if (isTablet()) {
    // On iPad, use 60% of screen width or max 600px
    return Math.min(SCREEN_WIDTH * 0.6, 600);
  }
  // On iPhone, use 90% of screen width or max 400px
  return Math.min(SCREEN_WIDTH * 0.9, 400);
};

/**
 * Get button width based on device type
 * @returns {object} Button width constraints
 */
export const getButtonWidth = () => {
  if (isTablet()) {
    return {
      maxWidth: 500,
      minWidth: 400,
      width: '70%',
    };
  }
  return {
    maxWidth: 320,
    minWidth: 280,
    width: '90%',
  };
};

/**
 * Get modal width based on device type
 * @returns {string} Modal width percentage
 */
export const getModalWidth = () => {
  return isTablet() ? '60%' : '85%';
};

/**
 * Get grid column count based on device type and content type
 * @param {string} contentType - Type of content ('alphabet', 'avatar', etc.)
 * @returns {number} Number of columns
 */
export const getGridColumns = (contentType) => {
  const tablet = isTablet();
  
  switch (contentType) {
    case 'alphabet':
      return tablet ? 15 : 10; // More letters per row on iPad
    case 'avatar':
      return tablet ? 4 : 3; // More avatars per row on iPad
    case 'difficulty':
      return tablet ? 2 : 1; // Side-by-side difficulty buttons on iPad
    default:
      return tablet ? 2 : 1;
  }
};

export default {
  isTablet,
  responsiveWidth,
  responsiveFontSize,
  responsiveSpacing,
  getContentWidth,
  getButtonWidth,
  getModalWidth,
  getGridColumns,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
};


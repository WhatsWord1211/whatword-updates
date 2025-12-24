import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';

const AnimatedMeshGradient = ({ style }) => {
  // Get screen dimensions inside component
  const screenData = Dimensions.get('window');
  const SCREEN_WIDTH = screenData.width;
  const SCREEN_HEIGHT = screenData.height;

  // Static blob positions (no animation for better performance)
  // Using average positions from the original animation ranges
  const blob1 = useMemo(() => ({ 
    cx: SCREEN_WIDTH * 0.5, // Average of 0.2 and 0.8
    cy: SCREEN_HEIGHT * 0.2, // Average of 0.1 and 0.3
    r: SCREEN_WIDTH * 0.6 // Average of 0.48 and 0.72
  }), [SCREEN_WIDTH, SCREEN_HEIGHT]);

  const blob2 = useMemo(() => ({ 
    cx: SCREEN_WIDTH * 0.5, // Average of 0.7 and 0.3
    cy: SCREEN_HEIGHT * 0.5, // Average of 0.4 and 0.6
    r: SCREEN_WIDTH * 0.475 // Average of 0.5 and 0.45
  }), [SCREEN_WIDTH, SCREEN_HEIGHT]);

  const blob3 = useMemo(() => ({ 
    cx: SCREEN_WIDTH * 0.3, // Average of 0.1 and 0.5
    cy: SCREEN_HEIGHT * 0.8, // Average of 0.7 and 0.9
    r: SCREEN_WIDTH * 0.53625 // Average of 0.605 and 0.4675
  }), [SCREEN_WIDTH, SCREEN_HEIGHT]);

  const blob4 = useMemo(() => ({ 
    cx: SCREEN_WIDTH * 0.65, // Average of 0.9 and 0.4
    cy: SCREEN_HEIGHT * 0.5, // Average of 0.2 and 0.8
    r: SCREEN_WIDTH * 0.46125 // Average of 0.405 and 0.5175
  }), [SCREEN_WIDTH, SCREEN_HEIGHT]);

  const blob5 = useMemo(() => ({ 
    cx: SCREEN_WIDTH * 0.3, // Average of 0.5 and 0.1
    cy: SCREEN_HEIGHT * 0.35, // Average of 0.5 and 0.2
    r: SCREEN_WIDTH * 0.5375 // Average of 0.6 and 0.475
  }), [SCREEN_WIDTH, SCREEN_HEIGHT]);

  const blob6 = useMemo(() => ({ 
    cx: SCREEN_WIDTH * 0.75, // Average of 0.6 and 0.9
    cy: SCREEN_HEIGHT * 0.65, // Average of 0.8 and 0.5
    r: SCREEN_WIDTH * 0.468 // Average of 0.408 and 0.528
  }), [SCREEN_WIDTH, SCREEN_HEIGHT]);

  // Memoize the gradient definitions to prevent re-creation
  const gradientDefs = useMemo(() => (
    <Defs>
      {/* Deep navy to purple gradient */}
      <RadialGradient id="grad1" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor="#1E3A8A" stopOpacity="0.4" />
        <Stop offset="50%" stopColor="#4C1D95" stopOpacity="0.25" />
        <Stop offset="100%" stopColor="#581C87" stopOpacity="0" />
      </RadialGradient>
      
      {/* Purple to orange gradient */}
      <RadialGradient id="grad2" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor="#7C3AED" stopOpacity="0.35" />
        <Stop offset="50%" stopColor="#A855F7" stopOpacity="0.2" />
        <Stop offset="100%" stopColor="#F97316" stopOpacity="0" />
      </RadialGradient>
      
      {/* Orange to deep purple gradient */}
      <RadialGradient id="grad3" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor="#F97316" stopOpacity="0.3" />
        <Stop offset="50%" stopColor="#EA580C" stopOpacity="0.2" />
        <Stop offset="100%" stopColor="#581C87" stopOpacity="0" />
      </RadialGradient>
      
      {/* Deep purple mesh */}
      <RadialGradient id="grad4" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor="#581C87" stopOpacity="0.4" />
        <Stop offset="50%" stopColor="#7C3AED" stopOpacity="0.25" />
        <Stop offset="100%" stopColor="#1E3A8A" stopOpacity="0" />
      </RadialGradient>
      
      {/* Orange mesh */}
      <RadialGradient id="grad5" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.3" />
        <Stop offset="50%" stopColor="#F97316" stopOpacity="0.2" />
        <Stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
      </RadialGradient>
      
      {/* Purple-orange blend */}
      <RadialGradient id="grad6" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.35" />
        <Stop offset="50%" stopColor="#A855F7" stopOpacity="0.2" />
        <Stop offset="100%" stopColor="#F97316" stopOpacity="0" />
      </RadialGradient>
    </Defs>
  ), []);

  // Memoize the circles to prevent re-creation on every render
  const circles = useMemo(() => (
    <>
      <Circle
        cx={blob1.cx}
        cy={blob1.cy}
        r={blob1.r}
        fill="url(#grad1)"
      />
      <Circle
        cx={blob2.cx}
        cy={blob2.cy}
        r={blob2.r}
        fill="url(#grad2)"
      />
      <Circle
        cx={blob3.cx}
        cy={blob3.cy}
        r={blob3.r}
        fill="url(#grad3)"
      />
      <Circle
        cx={blob4.cx}
        cy={blob4.cy}
        r={blob4.r}
        fill="url(#grad4)"
      />
      <Circle
        cx={blob5.cx}
        cy={blob5.cy}
        r={blob5.r}
        fill="url(#grad5)"
      />
      <Circle
        cx={blob6.cx}
        cy={blob6.cy}
        r={blob6.r}
        fill="url(#grad6)"
      />
    </>
  ), [blob1, blob2, blob3, blob4, blob5, blob6]);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFill}>
        {gradientDefs}
        {/* Base dark background */}
        <Rect width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="#0F172A" />
        {/* Animated gradient blobs */}
        {circles}
      </Svg>
    </View>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default React.memo(AnimatedMeshGradient);

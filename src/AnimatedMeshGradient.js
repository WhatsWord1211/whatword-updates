import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';
import { useSharedValue, useDerivedValue, useAnimatedReaction, withRepeat, withTiming, interpolate, Easing, runOnJS } from 'react-native-reanimated';

const AnimatedMeshGradient = ({ style }) => {
  // Get screen dimensions inside component
  const screenData = Dimensions.get('window');
  const SCREEN_WIDTH = screenData.width;
  const SCREEN_HEIGHT = screenData.height;

  // Animation values for different gradient blobs
  const anim1 = useSharedValue(0);
  const anim2 = useSharedValue(0);
  const anim3 = useSharedValue(0);
  const anim4 = useSharedValue(0);
  const anim5 = useSharedValue(0);
  const anim6 = useSharedValue(0);

  // State to hold current blob positions (updated via animated reactions)
  const [blob1, setBlob1] = useState({ cx: SCREEN_WIDTH * 0.5, cy: SCREEN_HEIGHT * 0.2, r: SCREEN_WIDTH * 0.6 });
  const [blob2, setBlob2] = useState({ cx: SCREEN_WIDTH * 0.5, cy: SCREEN_HEIGHT * 0.5, r: SCREEN_WIDTH * 0.5 });
  const [blob3, setBlob3] = useState({ cx: SCREEN_WIDTH * 0.3, cy: SCREEN_HEIGHT * 0.8, r: SCREEN_WIDTH * 0.55 });
  const [blob4, setBlob4] = useState({ cx: SCREEN_WIDTH * 0.7, cy: SCREEN_HEIGHT * 0.5, r: SCREEN_WIDTH * 0.45 });
  const [blob5, setBlob5] = useState({ cx: SCREEN_WIDTH * 0.3, cy: SCREEN_HEIGHT * 0.35, r: SCREEN_WIDTH * 0.5 });
  const [blob6, setBlob6] = useState({ cx: SCREEN_WIDTH * 0.75, cy: SCREEN_HEIGHT * 0.65, r: SCREEN_WIDTH * 0.48 });

  useEffect(() => {
    // Create continuous, slow animations with different durations and delays
    anim1.value = withRepeat(
      withTiming(1, {
        duration: 15000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );

    anim2.value = withRepeat(
      withTiming(1, {
        duration: 20000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );

    anim3.value = withRepeat(
      withTiming(1, {
        duration: 18000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );

    anim4.value = withRepeat(
      withTiming(1, {
        duration: 22000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );

    anim5.value = withRepeat(
      withTiming(1, {
        duration: 16000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );

    anim6.value = withRepeat(
      withTiming(1, {
        duration: 19000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
  }, []);

  // Throttle function to reduce re-renders
  const lastUpdateRef = useRef({});
  const THROTTLE_MS = 50; // Update at most every 50ms (20fps for background is smooth enough)

  const updateBlob1 = useCallback((coords) => {
    const now = Date.now();
    if (!lastUpdateRef.current.blob1 || now - lastUpdateRef.current.blob1 > THROTTLE_MS) {
      setBlob1(coords);
      lastUpdateRef.current.blob1 = now;
    }
  }, []);

  const updateBlob2 = useCallback((coords) => {
    const now = Date.now();
    if (!lastUpdateRef.current.blob2 || now - lastUpdateRef.current.blob2 > THROTTLE_MS) {
      setBlob2(coords);
      lastUpdateRef.current.blob2 = now;
    }
  }, []);

  const updateBlob3 = useCallback((coords) => {
    const now = Date.now();
    if (!lastUpdateRef.current.blob3 || now - lastUpdateRef.current.blob3 > THROTTLE_MS) {
      setBlob3(coords);
      lastUpdateRef.current.blob3 = now;
    }
  }, []);

  const updateBlob4 = useCallback((coords) => {
    const now = Date.now();
    if (!lastUpdateRef.current.blob4 || now - lastUpdateRef.current.blob4 > THROTTLE_MS) {
      setBlob4(coords);
      lastUpdateRef.current.blob4 = now;
    }
  }, []);

  const updateBlob5 = useCallback((coords) => {
    const now = Date.now();
    if (!lastUpdateRef.current.blob5 || now - lastUpdateRef.current.blob5 > THROTTLE_MS) {
      setBlob5(coords);
      lastUpdateRef.current.blob5 = now;
    }
  }, []);

  const updateBlob6 = useCallback((coords) => {
    const now = Date.now();
    if (!lastUpdateRef.current.blob6 || now - lastUpdateRef.current.blob6 > THROTTLE_MS) {
      setBlob6(coords);
      lastUpdateRef.current.blob6 = now;
    }
  }, []);

  // Pre-calculate all interpolation ranges (worklets need literal numbers)
  const blob1MinX = SCREEN_WIDTH * 0.2;
  const blob1MaxX = SCREEN_WIDTH * 0.8;
  const blob1MinY = SCREEN_HEIGHT * 0.1;
  const blob1MaxY = SCREEN_HEIGHT * 0.3;
  const blob1MinR = SCREEN_WIDTH * 0.48;
  const blob1MaxR = SCREEN_WIDTH * 0.72;

  const blob2MinX = SCREEN_WIDTH * 0.7;
  const blob2MaxX = SCREEN_WIDTH * 0.3;
  const blob2MinY = SCREEN_HEIGHT * 0.4;
  const blob2MaxY = SCREEN_HEIGHT * 0.6;
  const blob2MinR = SCREEN_WIDTH * 0.5;
  const blob2MaxR = SCREEN_WIDTH * 0.45;

  const blob3MinX = SCREEN_WIDTH * 0.1;
  const blob3MaxX = SCREEN_WIDTH * 0.5;
  const blob3MinY = SCREEN_HEIGHT * 0.7;
  const blob3MaxY = SCREEN_HEIGHT * 0.9;
  const blob3MinR = SCREEN_WIDTH * 0.605;
  const blob3MaxR = SCREEN_WIDTH * 0.4675;

  const blob4MinX = SCREEN_WIDTH * 0.9;
  const blob4MaxX = SCREEN_WIDTH * 0.4;
  const blob4MinY = SCREEN_HEIGHT * 0.2;
  const blob4MaxY = SCREEN_HEIGHT * 0.8;
  const blob4MinR = SCREEN_WIDTH * 0.405;
  const blob4MaxR = SCREEN_WIDTH * 0.5175;

  const blob5MinX = SCREEN_WIDTH * 0.5;
  const blob5MaxX = SCREEN_WIDTH * 0.1;
  const blob5MinY = SCREEN_HEIGHT * 0.5;
  const blob5MaxY = SCREEN_HEIGHT * 0.2;
  const blob5MinR = SCREEN_WIDTH * 0.6;
  const blob5MaxR = SCREEN_WIDTH * 0.475;

  const blob6MinX = SCREEN_WIDTH * 0.6;
  const blob6MaxX = SCREEN_WIDTH * 0.9;
  const blob6MinY = SCREEN_HEIGHT * 0.8;
  const blob6MaxY = SCREEN_HEIGHT * 0.5;
  const blob6MinR = SCREEN_WIDTH * 0.408;
  const blob6MaxR = SCREEN_WIDTH * 0.528;

  // Derive positions from animated values and update state
  useAnimatedReaction(
    () => anim1.value,
    (value) => {
      'worklet';
      const cx = interpolate(value, [0, 1], [blob1MinX, blob1MaxX]);
      const cy = interpolate(value, [0, 1], [blob1MinY, blob1MaxY]);
      const r = interpolate(value, [0, 1], [blob1MinR, blob1MaxR]);
      runOnJS(updateBlob1)({ cx, cy, r });
    }
  );

  useAnimatedReaction(
    () => anim2.value,
    (value) => {
      'worklet';
      const cx = interpolate(value, [0, 1], [blob2MinX, blob2MaxX]);
      const cy = interpolate(value, [0, 1], [blob2MinY, blob2MaxY]);
      const r = interpolate(value, [0, 1], [blob2MinR, blob2MaxR]);
      runOnJS(updateBlob2)({ cx, cy, r });
    }
  );

  useAnimatedReaction(
    () => anim3.value,
    (value) => {
      'worklet';
      const cx = interpolate(value, [0, 1], [blob3MinX, blob3MaxX]);
      const cy = interpolate(value, [0, 1], [blob3MinY, blob3MaxY]);
      const r = interpolate(value, [0, 1], [blob3MinR, blob3MaxR]);
      runOnJS(updateBlob3)({ cx, cy, r });
    }
  );

  useAnimatedReaction(
    () => anim4.value,
    (value) => {
      'worklet';
      const cx = interpolate(value, [0, 1], [blob4MinX, blob4MaxX]);
      const cy = interpolate(value, [0, 1], [blob4MinY, blob4MaxY]);
      const r = interpolate(value, [0, 1], [blob4MinR, blob4MaxR]);
      runOnJS(updateBlob4)({ cx, cy, r });
    }
  );

  useAnimatedReaction(
    () => anim5.value,
    (value) => {
      'worklet';
      const cx = interpolate(value, [0, 1], [blob5MinX, blob5MaxX]);
      const cy = interpolate(value, [0, 1], [blob5MinY, blob5MaxY]);
      const r = interpolate(value, [0, 1], [blob5MinR, blob5MaxR]);
      runOnJS(updateBlob5)({ cx, cy, r });
    }
  );

  useAnimatedReaction(
    () => anim6.value,
    (value) => {
      'worklet';
      const cx = interpolate(value, [0, 1], [blob6MinX, blob6MaxX]);
      const cy = interpolate(value, [0, 1], [blob6MinY, blob6MaxY]);
      const r = interpolate(value, [0, 1], [blob6MinR, blob6MaxR]);
      runOnJS(updateBlob6)({ cx, cy, r });
    }
  );

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFill}>
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

        {/* Base dark background */}
        <Rect width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="#0F172A" />

        {/* Animated gradient blobs */}
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
      </Svg>
    </View>
  );
};

export default AnimatedMeshGradient;

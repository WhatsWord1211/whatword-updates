import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

const ThreeDGreenDot = ({ size = 15, style }) => {
  const radius = size / 2;
  const shadowOffset = Math.max(1, Math.round(size * 0.08));
  const shadowRadius = radius * 1.04;

  return (
    <View style={style}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="dotGradient" cx="35%" cy="30%" rx="65%" ry="65%">
            <Stop offset="0%" stopColor="#b8f3d0" stopOpacity="1" />
            <Stop offset="45%" stopColor="#34d399" stopOpacity="1" />
            <Stop offset="100%" stopColor="#0e9f6e" stopOpacity="1" />
          </RadialGradient>
        </Defs>
        {/* Soft shadow under the dot */}
        <Circle cx={radius} cy={radius + shadowOffset} r={shadowRadius} fill="#000" opacity={0.25} />
        {/* Main glossy dot */}
        <Circle cx={radius} cy={radius} r={radius} fill="url(#dotGradient)" />
        {/* Specular highlight */}
        <Circle cx={radius - radius * 0.25} cy={radius - radius * 0.25} r={radius * 0.35} fill="#ffffff" opacity={0.35} />
      </Svg>
    </View>
  );
};

export default ThreeDGreenDot;



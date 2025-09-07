import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle, G } from 'react-native-svg';

const ThreeDPurpleRing = ({ size = 15, ringWidth = 2, style }) => {
  const radius = size / 2;
  const shadowOffset = Math.max(1, Math.round(size * 0.08));
  const circumference = 2 * Math.PI * (radius - ringWidth / 2);
  const highlightLength = circumference * 0.35; // 35% arc highlight

  return (
    <View style={style}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          {/* Stroke gradient for glossy rim */}
          <LinearGradient id="ringStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#C4B5FD" />
            <Stop offset="50%" stopColor="#8B5CF6" />
            <Stop offset="100%" stopColor="#5B21B6" />
          </LinearGradient>
          {/* Highlight gradient along stroke (white → transparent) */}
          <LinearGradient id="ringHighlightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Soft drop shadow as a stroked ring below */}
        <G transform={`translate(0, ${shadowOffset})`}>
          <Circle
            cx={radius}
            cy={radius}
            r={radius - ringWidth / 2}
            stroke="#000"
            strokeOpacity={0.25}
            strokeWidth={ringWidth + 2}
            fill="none"
          />
        </G>

        {/* Main ring stroke with gradient */}
        <Circle
          cx={radius}
          cy={radius}
          r={radius - ringWidth / 2}
          stroke="url(#ringStrokeGrad)"
          strokeWidth={ringWidth}
          fill="none"
        />

        {/* Specular highlight arc on top-left quadrant */}
        <Circle
          cx={radius}
          cy={radius}
          r={radius - ringWidth / 2}
          stroke="url(#ringHighlightGrad)"
          strokeWidth={Math.max(1, ringWidth * 0.6)}
          fill="none"
          strokeDasharray={`${highlightLength}, ${circumference}`}
          strokeDashoffset={circumference * 0.15}
        />
      </Svg>
    </View>
  );
};

export default ThreeDPurpleRing;



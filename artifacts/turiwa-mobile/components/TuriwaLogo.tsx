import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export interface TuriwaLogoProps {
  size?: number;
  style?: ViewStyle;
  /** 0-1 draw-in, used by the splash. Omit for a fully drawn mark. */
  reveal?: number;
}

// The Turiwa brand mark: a growth swirl — three nested arcs whose ends step down toward
// a sprouting leaf, with a seed above it. The leaf starts inside the outer band's cap so
// the two read as one continuous sweep.
const OUTER = 'M 78.8,34.5 A 37,37 0 1 0 76.8,91.2';
const MID = 'M 68.8,38.3 A 28,28 0 1 0 78.3,76.0';
const INNER = 'M 61.9,44.2 A 19.5,19.5 0 1 0 73.3,64.7';
const LEAF = 'M 74,42 C 80,28 90,18 106,12 C 102,28 90,40 74,42 Z';

function span(reveal: number | undefined, from: number, to: number) {
  if (reveal === undefined) return undefined;
  return Math.max(0, Math.min(1, (reveal - from) / (to - from)));
}

function dash(len: number, t: number | undefined) {
  if (t === undefined) return {};
  return { strokeDasharray: len, strokeDashoffset: len * (1 - t) };
}

export function TuriwaLogo({ size = 72, style, reveal }: TuriwaLogoProps) {
  const colors = useColors();
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const outerId = `turiwaOuter-${uid}`;
  const innerId = `turiwaInner-${uid}`;
  const leafId = `turiwaLeaf-${uid}`;
  const outer = span(reveal, 0, 0.4);
  const mid = span(reveal, 0.22, 0.62);
  const inner = span(reveal, 0.42, 0.78);
  const leaf = span(reveal, 0.6, 0.94);
  const seed = span(reveal, 0.86, 1);

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id={outerId} gradientUnits="userSpaceOnUse" x1="30" y1="20" x2="76" y2="100">
            <Stop offset="0%" stopColor="#8DC63F" />
            <Stop offset="48%" stopColor={colors.secondary} />
            <Stop offset="100%" stopColor="#1573B8" />
          </LinearGradient>
          <LinearGradient id={innerId} gradientUnits="userSpaceOnUse" x1="32" y1="32" x2="74" y2="90">
            <Stop offset="0%" stopColor="#A3D65E" />
            <Stop offset="100%" stopColor="#1FA98F" />
          </LinearGradient>
          <LinearGradient id={leafId} gradientUnits="userSpaceOnUse" x1="74" y1="42" x2="106" y2="12">
            <Stop offset="0%" stopColor="#1FA98F" />
            <Stop offset="100%" stopColor="#8DC63F" />
          </LinearGradient>
        </Defs>

        <G transform="translate(-3, 7)">
          <Path d={OUTER} stroke={`url(#${outerId})`} strokeWidth="10" strokeLinecap="round" fill="none" {...dash(168, outer)} />
          <Path d={MID} stroke={`url(#${innerId})`} strokeWidth="7" strokeLinecap="round" fill="none" {...dash(133, mid)} />
          <Path d={INNER} stroke={`url(#${innerId})`} strokeWidth="5.5" strokeLinecap="round" fill="none" {...dash(97, inner)} />
          <Path d={LEAF} fill={`url(#${leafId})`} opacity={leaf === undefined ? 1 : leaf} />
          <Circle cx="110" cy="5" r="4.2" fill="#8DC63F" opacity={seed ?? 1} />
        </G>
      </Svg>
    </View>
  );
}

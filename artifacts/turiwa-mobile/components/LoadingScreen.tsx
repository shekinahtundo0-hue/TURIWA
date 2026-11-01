import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/context/ThemeContext';
import { TuriwaLogo } from '@/components/TuriwaLogo';

interface LoadingScreenProps {
  onComplete?: () => void;
  /** Real readiness (auth hydrated). The splash holds until this flips. */
  ready?: boolean;
  /** Floor so a warm cache never flashes the splash. */
  minDuration?: number;
  /** Ceiling so a stalled network cannot strand anyone on this screen. */
  maxDuration?: number;
}

const HOLD = 0.85;

function useReduceMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

export function LoadingScreen({ onComplete, ready = true, minDuration = 1400, maxDuration = 3400 }: LoadingScreenProps) {
  const colors = useColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { isPhone } = useResponsive();
  const reduced = useReduceMotion();

  const [reveal, setReveal] = useState(0);
  const [bar, setBar] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState(false);
  const [deadline, setDeadline] = useState(false);

  const barAnim = useRef(new Animated.Value(0)).current;
  const revealAnim = useRef(new Animated.Value(0)).current;
  const enterAnim = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const exitAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const completed = useRef(false);

  // Logo draw-in, mirrored into state because SVG stroke props can't use the native driver.
  useEffect(() => {
    const listener = revealAnim.addListener(({ value }) => setReveal(Math.round(value * 40) / 40));
    Animated.timing(revealAnim, {
      toValue: 1,
      duration: reduced ? 1 : 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => revealAnim.removeListener(listener);
  }, [revealAnim, reduced]);

  useEffect(() => {
    const listener = barAnim.addListener(({ value }) => setBar(Math.round(value * 100) / 100));
    Animated.timing(barAnim, {
      toValue: HOLD,
      duration: reduced ? 400 : minDuration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    return () => barAnim.removeListener(listener);
  }, [barAnim, minDuration, reduced]);

  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [enterAnim]);

  // Idle breathing: the mark drifts and the aurora swells while the app waits on the network.
  useEffect(() => {
    if (reduced) return;
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.85, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.45, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    float.start();
    glow.start();
    return () => {
      float.stop();
      glow.stop();
    };
  }, [floatAnim, glowAnim, reduced]);

  // Past the ceiling the splash lets go even if the network never answered; the
  // app underneath has its own offline state to fall back on.
  useEffect(() => {
    const timer = setTimeout(() => setDeadline(true), Math.max(maxDuration, minDuration));
    return () => clearTimeout(timer);
  }, [maxDuration, minDuration]);

  // Only finish once the network is back AND the floor duration has played out.
  useEffect(() => {
    if (finishing || done) return;
    if (!deadline && (!ready || bar < HOLD - 0.005)) return;
    setFinishing(true);
    Animated.timing(barAnim, { toValue: 1, duration: reduced ? 120 : 320, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start(({ finished }) => {
      if (finished) setDone(true);
    });
  }, [bar, barAnim, deadline, done, finishing, ready, reduced]);

  // A tab the browser opens in the background is never handed an animation frame, so the
  // handover cannot live only in an animation callback. This is a separate effect because
  // latching `finishing` above re-runs it, and its cleanup would cancel this timer.
  useEffect(() => {
    if (!finishing || done) return;
    const bail = setTimeout(() => setDone(true), reduced ? 220 : 700);
    return () => clearTimeout(bail);
  }, [done, finishing, reduced]);

  useEffect(() => {
    if (!done) return;
    const finish = () => {
      if (completed.current) return;
      completed.current = true;
      onComplete?.();
    };
    Animated.timing(exitAnim, {
      toValue: 1,
      duration: reduced ? 120 : 460,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(finish);
    const bail = setTimeout(finish, reduced ? 220 : 900);
    return () => clearTimeout(bail);
  }, [done, exitAnim, onComplete, reduced]);

  const status = !finishing ? (bar < 0.5 ? 'Preparing your circles' : 'Connecting to the network') : 'Welcome';
  const markSize = isPhone ? 92 : 112;
  const copyAlpha = Math.min(1, Math.max(0, (reveal - 0.55) / 0.45));

  // Light mode needs a tight, low-alpha bloom: a wide wash reads as a smudge on alabaster.
  const bloom = isDark ? '#1FA98F' : '#8DC63F';
  const warm = isDark ? colors.gold : colors.accent;
  const haloAlpha = isDark ? 0.26 : 0.14;
  const warmAlpha = isDark ? 0.16 : 0.1;

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scene,
          {
            opacity: exitAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ scale: exitAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
          },
        ]}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glowAnim }]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="splashHalo" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={bloom} stopOpacity={haloAlpha} />
                <Stop offset="100%" stopColor={bloom} stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="splashWarm" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={warm} stopOpacity={warmAlpha} />
                <Stop offset="100%" stopColor={warm} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx={width * 0.5} cy={height * 0.4} r={Math.min(width, height) * 0.45} fill="url(#splashHalo)" />
            <Circle cx={width * 1.02} cy={height * 1.02} r={Math.min(width, height) * 0.55} fill="url(#splashWarm)" />
          </Svg>
        </Animated.View>

        <View style={styles.stack}>
          <Animated.View
            style={{
              opacity: enterAnim,
              transform: [
                { scale: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                { translateY: floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
              ],
            }}
          >
            <TuriwaLogo size={markSize} reveal={reveal} />
          </Animated.View>

          <View style={{ opacity: copyAlpha, transform: [{ translateY: (1 - copyAlpha) * 9 }] }}>
            <Text style={[styles.wordmark, { color: colors.foreground }]}>TURIWA</Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>Together, we grow.</Text>
          </View>

          <Animated.View style={[styles.progressWrap, { opacity: enterAnim }]}>
            <View style={[styles.track, { backgroundColor: colors.border }]}>
              <Animated.View style={[styles.fillWrap, { width: bar * 184 }]}>
                <LinearGradient colors={['#8DC63F', '#1FA98F', '#1573B8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fill} />
              </Animated.View>
            </View>
            <Text style={[styles.status, { color: colors.mutedForeground }]}>{status}</Text>
          </Animated.View>
        </View>

        <Text style={[styles.footnote, { color: colors.mutedForeground, marginBottom: insets.bottom + 22 }]}>
          Ushirika · Ukuaji · Umoja
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  scene: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  stack: { alignItems: 'center' },
  wordmark: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 25,
    letterSpacing: 6.8,
    textAlign: 'center',
    marginTop: 18,
    marginLeft: 6.8,
  },
  tagline: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', marginTop: 6, letterSpacing: 0.2 },
  progressWrap: { alignItems: 'center', marginTop: 34 },
  track: { width: 184, height: 3, borderRadius: 2, overflow: 'hidden' },
  fillWrap: { height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { width: 184, height: 3, borderRadius: 2 },
  status: { fontFamily: 'Inter_500Medium', fontSize: 11, letterSpacing: 1.1, marginTop: 14, textTransform: 'uppercase' },
  footnote: { position: 'absolute', bottom: 0, alignSelf: 'center', fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase' },
});

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useTuriwa } from '@/context/TuriwaContext';
import { TuriwaMark } from '@/components/AuthUI';

export default function EntryScreen() {
  const colors = useColors();
  const { authHydrated, signedIn } = useTuriwa();
  const [splashDone, setSplashDone] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!authHydrated) return;
    const duration = signedIn ? 800 : 1800;
    Animated.timing(progress, { toValue: 1, duration, useNativeDriver: false }).start();
    const timeout = setTimeout(() => setSplashDone(true), duration + 120);
    return () => clearTimeout(timeout);
  }, [authHydrated, signedIn, progress]);

  if (authHydrated && splashDone) {
    return signedIn ? <Redirect href="/(tabs)" /> : <Redirect href="/(auth)/welcome" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glow, { backgroundColor: colors.muted }]} />
      <TuriwaMark size={94} />
      <Text style={[styles.wordmark, { color: colors.primary }]}>Turiwa</Text>
      {!signedIn ? <Text style={[styles.tagline, { color: colors.tint }]}>Ushirika. Ukuaji. Umoja.</Text> : null}
      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <Animated.View style={[styles.progressFill, { backgroundColor: colors.tint, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  glow: { position: 'absolute', width: 360, height: 360, borderRadius: 180, opacity: 0.38 },
  wordmark: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: 1.4, marginTop: 8 },
  tagline: { fontFamily: 'Inter_400Regular', fontSize: 12, letterSpacing: 0.3, marginTop: 8 },
  progressTrack: { width: 150, height: 2, borderRadius: 3, overflow: 'hidden', marginTop: 28 },
  progressFill: { height: '100%' },
});
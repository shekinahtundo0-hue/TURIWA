import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, TuriwaMark } from '@/components/AuthUI';
import { AuthDivider, GoogleSignInButton } from '@/components/GoogleSignInButton';
import { isGoogleAuthConfigured } from '@/lib/firebase';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }, isDesktop && styles.containerWide]}>
      <LinearGradient colors={[colors.muted, colors.background]} style={[styles.hero, { paddingTop: insets.top + 30 }, isDesktop && styles.heroWide]}>
        <TuriwaMark size={isDesktop ? 120 : 104} />
        <Text style={[styles.heroTitle, { color: colors.primary }]}>Together, we grow.</Text>
        <Text style={[styles.heroCopy, { color: colors.inkSoft }]}>Save with people you trust, see every contribution, and move forward as one.</Text>
      </LinearGradient>
      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomWidth: 0, paddingBottom: insets.bottom + 20 }, isDesktop && styles.sheetWide]}>
        {isDesktop ? null : <View style={[styles.handle, { backgroundColor: colors.border }]} />}
        <View style={styles.sheetColumn}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Welcome to Turiwa</Text>
          <Text style={[styles.sheetCopy, { color: colors.mutedForeground }]}>A clearer, kinder way to build together through chamas.</Text>
          <View style={styles.actions}>
            <GoogleSignInButton />
            {isGoogleAuthConfigured() ? <AuthDivider label="OR CONTINUE WITH YOUR PHONE" /> : null}
            <AuthButton label="Sign In" onPress={() => router.push('/(auth)/sign-in')} icon="arrow-right" />
            <AuthButton label="Create Account" onPress={() => router.push('/(auth)/sign-up')} outline />
          </View>
          <Pressable onPress={() => router.push('/(auth)/sign-up')} style={styles.learnMore}>
            <Text style={[styles.learnText, { color: colors.mutedForeground }]}>New to chamas? <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>See how Turiwa works →</Text></Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerWide: { flexDirection: 'row' },
  hero: { flex: 0.52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  heroWide: { flex: 1, paddingHorizontal: 56, paddingTop: 0 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.7, marginTop: 12, textAlign: 'center' },
  heroCopy: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, maxWidth: 420 },
  sheet: { flex: 0.48, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -20, paddingHorizontal: 20, paddingTop: 12 },
  sheetWide: { flex: 1, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 0, justifyContent: 'center', paddingHorizontal: 48 },
  sheetColumn: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  handle: { width: 40, height: 4, borderRadius: 4, alignSelf: 'center', marginBottom: 22 },
  sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, textAlign: 'center' },
  sheetCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  actions: { gap: 12, marginTop: 24 },
  learnMore: { alignItems: 'center', paddingTop: 20 },
  learnText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
});
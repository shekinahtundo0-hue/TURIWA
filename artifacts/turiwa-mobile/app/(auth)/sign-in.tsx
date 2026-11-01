import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthButton, AuthField, AuthHeader, AuthShell } from '@/components/AuthUI';
import { AuthDivider, GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useColors } from '@/hooks/useColors';
import { useTuriwa } from '@/context/TuriwaContext';
import { isGoogleAuthConfigured } from '@/lib/firebase';
import { circleInviteHref, normalizeCircleInviteCode } from '@/lib/circleInvite';

export default function SignInScreen() {
  const colors = useColors();
  const { signIn, nextStopAfterAuth } = useTuriwa();
  const { code: inviteParam } = useLocalSearchParams<{ code?: string }>();
  const inviteCode = normalizeCircleInviteCode(inviteParam);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (phone.replace(/\D/g, '').length < 9 || password.length < 4) {
      setError('Nenosiri si sahihi. Check your details and try again.');
      return;
    }
    try {
      await signIn(phone, password);
      router.replace(circleInviteHref(inviteCode) ?? await nextStopAfterAuth());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    }
  };
  return (
    <AuthShell>
      <AuthHeader title="Karibu tena" subtitle="Sign in to keep your circles moving forward." onBack={() => router.back()} />
      <AuthField label="Phone number" value={phone} onChangeText={setPhone} placeholder="+254 712 345 678" keyboardType="phone-pad" autoCapitalize="none" />
      <View>
        <AuthField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" secureTextEntry={!showPassword} error={error} />
        <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} hitSlop={8} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
          <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgot}>
        <Text style={[styles.link, { color: colors.tint }]}>Forgot password?</Text>
      </Pressable>
      <AuthButton label="Sign In" onPress={submit} icon="arrow-right" />
      {isGoogleAuthConfigured() ? (
        <>
          <AuthDivider label="OR" />
          <GoogleSignInButton />
        </>
      ) : null}
      <Pressable onPress={() => router.push('/(auth)/sign-up')} style={styles.footer}><Text style={[styles.footerText, { color: colors.mutedForeground }]}>Don’t have an account? <Text style={{ color: colors.tint, fontFamily: 'Inter_700Bold' }}>Sign Up</Text></Text></Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  eyeButton: { position: 'absolute', right: 15, bottom: 23 },
  forgot: { alignSelf: 'flex-end', marginTop: -3, marginBottom: 20 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  footer: { alignItems: 'center', marginTop: 'auto', paddingTop: 24 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
});

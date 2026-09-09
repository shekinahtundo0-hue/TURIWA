import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthButton, AuthField, AuthHeader, AuthShell } from '@/components/AuthUI';
import { useColors } from '@/hooks/useColors';
import { useTuriwa } from '@/context/TuriwaContext';

export default function SignInScreen() {
  const colors = useColors();
  const { signIn } = useTuriwa();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (phone.replace(/\D/g, '').length < 9 || password.length < 4) {
      setError('Nenosiri si sahihi. Check your details and try again.');
      return;
    }
    await signIn(phone, password);
    router.replace('/(tabs)');
  };
  return (
    <AuthShell>
      <AuthHeader title="Karibu tena" subtitle="Sign in to keep your circles moving forward." onBack={() => router.back()} />
      <AuthField label="Phone number" value={phone} onChangeText={setPhone} placeholder="+254 712 345 678" keyboardType="phone-pad" autoCapitalize="none" />
      <View>
        <AuthField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" secureTextEntry={!showPassword} error={error} />
        <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} hitSlop={8}>
          <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgot}>
        <Text style={[styles.link, { color: colors.tint }]}>Forgot password?</Text>
      </Pressable>
      <AuthButton label="Sign In" onPress={submit} icon="arrow-right" />
      <View style={styles.divider}><View style={[styles.line, { backgroundColor: colors.border }]} /><Text style={[styles.or, { color: colors.mutedForeground }]}>or</Text><View style={[styles.line, { backgroundColor: colors.border }]} /></View>
      <AuthButton label="Continue with M-Pesa" onPress={() => setError('M-Pesa sign in will be available when your account is connected.')} outline icon="smartphone" />
      <View style={styles.socialRow}><AuthButton label="Google" onPress={() => setError('Google sign in will be available soon.')} outline /><AuthButton label="Apple" onPress={() => setError('Apple sign in will be available soon.')} outline /></View>
      <Pressable onPress={() => router.push('/(auth)/sign-up')} style={styles.footer}><Text style={[styles.footerText, { color: colors.mutedForeground }]}>Don’t have an account? <Text style={{ color: colors.tint, fontFamily: 'Inter_700Bold' }}>Sign Up</Text></Text></Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  eyeButton: { position: 'absolute', right: 15, bottom: 23 },
  forgot: { alignSelf: 'flex-end', marginTop: -3, marginBottom: 20 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  line: { flex: 1, height: 1 },
  or: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  socialRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  footer: { alignItems: 'center', marginTop: 'auto', paddingTop: 24 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
});
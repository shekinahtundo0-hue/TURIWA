import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AuthButton, AuthField, AuthHeader, AuthShell } from '@/components/AuthUI';
import { useColors } from '@/hooks/useColors';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!sent && phone.replace(/\D/g, '').length < 9) {
      setError('Enter the phone number linked to your account.');
      return;
    }
    if (sent && (code.length !== 4 || password.length < 4)) {
      setError('Enter the 4-digit code and a new password.');
      return;
    }
    if (!sent) {
      setError('');
      setSent(true);
      return;
    }
    router.replace('/(auth)/sign-in');
  };

  return (
    <AuthShell>
      <AuthHeader title="Reset your password" subtitle={sent ? `We sent a code to ${phone}.` : 'We’ll send a reset code by SMS, never by email.'} onBack={() => router.back()} />
      {!sent ? <AuthField label="Phone number" value={phone} onChangeText={setPhone} placeholder="+254 712 345 678" keyboardType="phone-pad" /> : <><AuthField label="SMS code" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit code" keyboardType="number-pad" /><AuthField label="New password" value={password} onChangeText={setPassword} placeholder="At least 4 characters" secureTextEntry /></>}
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      <AuthButton label={sent ? 'Save new password' : 'Send reset code'} onPress={submit} icon="arrow-right" />
      {sent ? <Text style={[styles.timer, { color: colors.mutedForeground }]}>Didn’t get it? You can request another code in 30s.</Text> : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 12 },
  timer: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 18 },
});
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthButton, AuthField, AuthHeader, AuthShell } from '@/components/AuthUI';
import { useColors } from '@/hooks/useColors';
import * as api from '@/lib/api';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [undelivered, setUndelivered] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    if (phone.replace(/\D/g, '').length < 9) {
      setError('Enter the phone number linked to your account.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.requestResetCode(phone);
      setDemoCode(result.code ?? '');
      // The answer looks the same whether or not the number is registered, so this is
      // the only place a member learns a text never left the building.
      setUndelivered(result.delivered === false && !result.code);
      setSent(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset code.');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (code.length !== 6 || password.length < 8) {
      setError('Enter the 6-digit code and a new password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(phone, code, password);
      router.replace('/(auth)/sign-in');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <AuthHeader title="Reset your password" subtitle={sent ? (undelivered ? `We could not text a code to ${phone}.` : `If ${phone} has a Turiwa account, a 6-digit code is on its way.`) : 'We’ll send a reset code by SMS, never by email.'} onBack={() => router.back()} />
      {!sent ? (
        <AuthField label="Phone number" value={phone} onChangeText={setPhone} placeholder="+254 712 345 678" keyboardType="phone-pad" />
      ) : (
        <>
          <AuthField label="SMS code" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" keyboardType="number-pad" />
          <AuthField label="New password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />
          {demoCode ? (
            <View style={[styles.demoCodeCard, { backgroundColor: colors.successSoft, borderColor: colors.primary }]}>
              <Feather name="info" size={14} color={colors.primary} />
              <Text style={[styles.demoCodeText, { color: colors.primary }]}>Turiwa has no message sender connected yet, so this test code is shown here: <Text style={{ fontFamily: 'Inter_700Bold' }}>{demoCode}</Text></Text>
            </View>
          ) : null}
          {undelivered ? (
            <View style={[styles.demoCodeCard, { backgroundColor: colors.destructiveSoft, borderColor: colors.destructive }]}>
              <Feather name="alert-triangle" size={14} color={colors.destructive} />
              <Text style={[styles.demoCodeText, { color: colors.destructive }]}>No code could be texted because Turiwa has no message sender connected yet. If you know your password, sign in and change it from Profile.</Text>
            </View>
          ) : null}
        </>
      )}
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      <AuthButton label={sent ? 'Save new password' : 'Send reset code'} onPress={sent ? savePassword : requestCode} icon="arrow-right" disabled={busy} />
      {sent ? (
        <Text style={[styles.timer, { color: colors.mutedForeground }]}>
          Didn’t get it?{' '}
          <Text style={{ color: colors.tint, fontFamily: 'Inter_600SemiBold' }} onPress={requestCode}>Request another code</Text>
        </Text>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 12 },
  demoCodeCard: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4, marginBottom: 12 },
  demoCodeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  timer: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 18 },
});

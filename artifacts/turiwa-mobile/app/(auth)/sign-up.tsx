import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthButton, AuthField, AuthHeader, AuthShell, ProgressSegments } from '@/components/AuthUI';
import { useColors } from '@/hooks/useColors';
import { useTuriwa } from '@/context/TuriwaContext';
import * as api from '@/lib/api';
import { circleInviteHref, normalizeCircleInviteCode } from '@/lib/circleInvite';

const countries = ['+254', '+255', '+256'];

export default function SignUpScreen() {
  const colors = useColors();
  const { createAccount, nextStopAfterAuth } = useTuriwa();
  const { code: inviteParam } = useLocalSearchParams<{ code?: string }>();
  const inviteCode = normalizeCircleInviteCode(inviteParam);
  const [step, setStep] = useState(1);
  const [otpSent, setOtpSent] = useState(false);
  const [country, setCountry] = useState('+254');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fullPhone = `${country}${phone}`;

  const sendCode = async () => {
    if (phone.replace(/\D/g, '').length < 9) {
      setError('Enter a valid phone number to continue.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.requestSignUpCode(fullPhone);
      setDemoCode(result.code ?? '');
      setOtpSent(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Kanuni si sahihi. Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      await api.verifySignUpCode(fullPhone, otp);
      setError('');
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!name.trim() || password.length < 8) {
      setError('Add your name and a password with at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await createAccount(name, fullPhone, password);
      router.replace(circleInviteHref(inviteCode) ?? await nextStopAfterAuth());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <AuthHeader
        title="Create your Turiwa"
        subtitle="Two small steps to start growing together."
        onBack={() => {
          if (step === 2) setStep(1);
          else if (otpSent) setOtpSent(false);
          else router.back();
        }}
      />
      <ProgressSegments active={step} total={2} />
      {step === 1 ? (
        <>
          <Text style={[styles.stepLabel, { color: colors.primary }]}>STEP 1 OF 2 · YOUR PHONE</Text>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>{otpSent ? 'Check your messages' : 'Let’s start with your phone'}</Text>
          <Text style={[styles.stepCopy, { color: colors.mutedForeground }]}>{otpSent ? `We sent a 6-digit code to ${country} ${phone}.` : 'We use your number to keep your account safe and make sign in simple.'}</Text>
          {!otpSent ? (
            <View style={styles.phoneRow}>
              <Pressable onPress={() => setCountry(countries[(countries.indexOf(country) + 1) % countries.length])} style={[styles.countryButton, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.countryText, { color: colors.primary }]}>{country}</Text><Feather name="chevron-down" size={15} color={colors.primary} />
              </Pressable>
              <View style={styles.phoneInput}><AuthField testID="signup-phone" label="Phone number" value={phone} onChangeText={setPhone} placeholder="712 345 678" keyboardType="phone-pad" /></View>
            </View>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>One-time code</Text>
              <View style={styles.otpRow}>
                {[0, 1, 2, 3, 4, 5].map((index) => <View key={index} style={[styles.otpBox, { backgroundColor: colors.muted, borderColor: error ? colors.destructive : colors.border }]}><Text style={[styles.otpText, { color: colors.foreground }]}>{otp[index] ?? ''}</Text></View>)}
              </View>
              <TextInput testID="signup-otp" value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter code" keyboardType="number-pad" accessibilityLabel="One-time code" style={styles.hiddenInput} />
              {demoCode ? (
                <View style={[styles.demoCodeCard, { backgroundColor: colors.successSoft, borderColor: colors.primary }]}>
                  <Feather name="info" size={14} color={colors.primary} />
                  <Text style={[styles.demoCodeText, { color: colors.primary }]}>Turiwa has no message sender connected yet, so this test code is shown here: <Text style={{ fontFamily: 'Inter_700Bold' }}>{demoCode}</Text></Text>
                </View>
              ) : null}
              <View style={styles.otpLinks}>
                <Pressable onPress={() => { setOtpSent(false); setOtp(''); }} style={styles.otpLink}><Text style={[styles.changeText, { color: colors.tint }]}>Change number</Text></Pressable>
                <Pressable onPress={sendCode} disabled={busy} style={styles.otpLink}><Text style={[styles.changeText, { color: colors.mutedForeground }]}>Resend code</Text></Pressable>
              </View>
            </>
          )}
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.bottomAction}><AuthButton label={otpSent ? 'Verify number' : 'Send code'} onPress={otpSent ? verifyOtp : sendCode} icon="arrow-right" disabled={busy || (otpSent && otp.length !== 6)} /></View>
        </>
      ) : (
        <>
          <Text style={[styles.stepLabel, { color: colors.primary }]}>STEP 2 OF 2 · YOUR DETAILS</Text>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>Tell us a little about you</Text>
          <Text style={[styles.stepCopy, { color: colors.mutedForeground }]}>Your name helps your circle know it’s really you.</Text>
          <AuthField testID="signup-name" label="Full name" value={name} onChangeText={setName} placeholder="e.g. Sheila Wanjiku" autoCapitalize="words" />
          <AuthField testID="signup-password" label="Create a password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />
          <Text style={[styles.passwordHint, { color: colors.mutedForeground }]}>{password.length >= 8 ? '✓ Strong enough to protect your money' : 'Use 8 or more characters'}</Text>
          <View style={styles.bottomAction}><AuthButton label="Create account" onPress={finish} icon="check" disabled={busy} /></View>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  stepLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 9 },
  stepTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  stepCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 22 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  countryButton: { height: 54, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  countryText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  phoneInput: { flex: 1 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 },
  otpRow: { flexDirection: 'row', gap: 10, marginBottom: 2 },
  otpBox: { flex: 1, height: 58, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  otpText: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  hiddenInput: { height: 1, opacity: 0, marginTop: -1, marginBottom: -1 },
  demoCodeCard: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14 },
  demoCodeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  otpLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  otpLink: { paddingVertical: 4 },
  changeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8 },
  bottomAction: { marginTop: 24 },
  passwordHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: -6 },
});

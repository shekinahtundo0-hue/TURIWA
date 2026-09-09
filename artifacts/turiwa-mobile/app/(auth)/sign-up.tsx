import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthButton, AuthField, AuthHeader, AuthShell, ProgressSegments } from '@/components/AuthUI';
import { useColors } from '@/hooks/useColors';
import { useTuriwa } from '@/context/TuriwaContext';

const countries = ['+254', '+255', '+256'];

export default function SignUpScreen() {
  const colors = useColors();
  const { createAccount } = useTuriwa();
  const [step, setStep] = useState(1);
  const [otpSent, setOtpSent] = useState(false);
  const [country, setCountry] = useState('+254');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState<'English' | 'Kiswahili'>('English');
  const [error, setError] = useState('');

  const nextFromPhone = () => {
    if (phone.replace(/\D/g, '').length < 9) {
      setError('Enter a valid phone number to continue.');
      return;
    }
    setError('');
    setOtpSent(true);
  };
  const verifyOtp = () => {
    if (otp.length !== 4) {
      setError('Kanuni si sahihi. Enter the 4-digit code.');
      return;
    }
    setError('');
    setStep(2);
  };
  const finish = async () => {
    if (!name.trim() || password.length < 4) {
      setError('Add your name and a password with at least 4 characters.');
      return;
    }
    await createAccount(name, `${country}${phone}`, password);
    router.replace('/(tabs)');
  };

  return (
    <AuthShell>
      <AuthHeader title="Create your Turiwa" subtitle="Three small steps to start growing together." onBack={() => (step === 1 ? router.back() : setStep(step - 1))} />
      <ProgressSegments active={step} />
      {step === 1 ? (
        <>
          <Text style={[styles.stepLabel, { color: colors.primary }]}>STEP 1 OF 3 · YOUR PHONE</Text>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>{otpSent ? 'Check your messages' : 'Let’s start with your phone'}</Text>
          <Text style={[styles.stepCopy, { color: colors.mutedForeground }]}>{otpSent ? `We sent a 4-digit code to ${country} ${phone}.` : 'We use your number to keep your account safe and make sign in simple.'}</Text>
          {!otpSent ? (
            <View style={styles.phoneRow}>
              <Pressable onPress={() => setCountry(countries[(countries.indexOf(country) + 1) % countries.length])} style={[styles.countryButton, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.countryText, { color: colors.primary }]}>{country}</Text><Feather name="chevron-down" size={15} color={colors.primary} />
              </Pressable>
              <View style={styles.phoneInput}><AuthField label="Phone number" value={phone} onChangeText={setPhone} placeholder="712 345 678" keyboardType="phone-pad" /></View>
            </View>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>One-time code</Text>
              <View style={styles.otpRow}>
                {[0, 1, 2, 3].map((index) => <View key={index} style={[styles.otpBox, { backgroundColor: colors.muted, borderColor: error ? colors.destructive : colors.border }]}><Text style={[styles.otpText, { color: colors.foreground }]}>{otp[index] ?? ''}</Text></View>)}
              </View>
              <TextInput value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 4))} placeholder="Enter code" keyboardType="number-pad" accessibilityLabel="One-time code" style={styles.hiddenInput} />
              <Pressable onPress={() => setOtpSent(false)} style={styles.changeNumber}><Text style={[styles.changeText, { color: colors.tint }]}>Change number</Text></Pressable>
            </>
          )}
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.bottomAction}><AuthButton label={otpSent ? 'Verify number' : 'Send code'} onPress={otpSent ? verifyOtp : nextFromPhone} icon="arrow-right" disabled={otpSent && otp.length !== 4} /></View>
        </>
      ) : step === 2 ? (
        <>
          <Text style={[styles.stepLabel, { color: colors.primary }]}>STEP 2 OF 3 · YOUR DETAILS</Text>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>Tell us a little about you</Text>
          <Text style={[styles.stepCopy, { color: colors.mutedForeground }]}>Your name helps your circle know it’s really you.</Text>
          <AuthField label="Full name" value={name} onChangeText={setName} placeholder="e.g. Sheila Wanjiku" autoCapitalize="words" />
          <AuthField label="Email (optional)" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <AuthField label="Create a password" value={password} onChangeText={setPassword} placeholder="At least 4 characters" secureTextEntry />
          <Text style={[styles.passwordHint, { color: colors.mutedForeground }]}>{password.length >= 4 ? '✓ Strong enough to get started' : 'Use 4 or more characters'}</Text>
          <View style={styles.bottomAction}><AuthButton label="Continue" onPress={() => { if (name.trim() && password.length >= 4) { setError(''); setStep(3); } else setError('Add your name and a password with at least 4 characters.'); }} icon="arrow-right" /></View>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        </>
      ) : (
        <>
          <Text style={[styles.stepLabel, { color: colors.primary }]}>STEP 3 OF 3 · YOUR PROFILE</Text>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>Make Turiwa yours</Text>
          <Text style={[styles.stepCopy, { color: colors.mutedForeground }]}>You can add a photo later. Choose the language that feels most natural.</Text>
          <View style={[styles.avatar, { backgroundColor: colors.muted, borderColor: colors.border }]}><Feather name="camera" size={22} color={colors.primary} /></View>
          <Text style={[styles.avatarHint, { color: colors.mutedForeground }]}>Add a profile photo (optional)</Text>
          <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Language</Text>
          <View style={[styles.languageToggle, { backgroundColor: colors.muted }]}>{(['English', 'Kiswahili'] as const).map((item) => <Pressable key={item} onPress={() => setLanguage(item)} style={[styles.languageOption, language === item && { backgroundColor: colors.card }]}><Text style={[styles.languageText, { color: language === item ? colors.primary : colors.mutedForeground }]}>{item}</Text></Pressable>)}</View>
          <View style={styles.bottomAction}><AuthButton label="Finish and enter Turiwa" onPress={finish} icon="check" /></View>
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
  changeNumber: { alignSelf: 'flex-end', marginTop: 4 },
  changeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8 },
  bottomAction: { marginTop: 24 },
  passwordHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: -6 },
  avatar: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 8 },
  avatarHint: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 9, marginBottom: 26 },
  languageToggle: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  languageOption: { flex: 1, paddingVertical: 12, borderRadius: 9, alignItems: 'center' },
  languageText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
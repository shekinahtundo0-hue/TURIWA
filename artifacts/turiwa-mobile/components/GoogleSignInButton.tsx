import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTuriwa } from '@/context/TuriwaContext';
import { useColors } from '@/hooks/useColors';
import { isGoogleAuthConfigured } from '@/lib/firebase';
import { signInWithGoogleWeb, takeGoogleRedirectToken } from '@/lib/googleAuth';
import { isGoogleNativeAuthConfigured, useGoogleNativeAuth } from '@/lib/googleAuthNative';

type GoogleFlow = { busy: boolean; error: string; start: () => Promise<void> };

/**
 * Google sign-in button. Renders nothing when the keys for the current platform are absent
 * so a plain phone + password build never shows a dead control. The browser completes a
 * popup or a full-page redirect; a packaged app hands off to the system browser and comes
 * back through its own deep-link scheme, so the two flows differ and only the button shared.
 */
export function GoogleSignInButton() {
  if (Platform.OS !== 'web') {
    return isGoogleNativeAuthConfigured() ? <NativeGoogleSignIn /> : null;
  }
  return <WebGoogleSignIn />;
}

function WebGoogleSignIn() {
  const { signInWithGoogle, nextStopAfterAuth } = useTuriwa();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const finish = async (idToken: string) => {
    await signInWithGoogle(idToken);
    router.replace(await nextStopAfterAuth());
  };

  useEffect(() => {
    if (!isGoogleAuthConfigured()) return;
    let active = true;
    // A popup-blocked flow handed off to a full-page redirect and comes back here.
    takeGoogleRedirectToken()
      .then((token) => {
        if (!active || !token) return;
        void finish(token).catch((err) => setError(err instanceof Error ? err.message : 'Google sign-in failed.'));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (!isGoogleAuthConfigured()) return null;

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const idToken = await signInWithGoogleWeb();
      // null means the browser is navigating to Google; keep the spinner running.
      if (idToken) await finish(idToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setBusy(false);
    }
  };

  return <GoogleButton busy={busy} error={error} start={start} />;
}

function NativeGoogleSignIn() {
  const { signInWithGoogle, nextStopAfterAuth } = useTuriwa();

  const finish = useCallback(
    async (idToken: string) => {
      await signInWithGoogle(idToken);
      router.replace(await nextStopAfterAuth());
    },
    [signInWithGoogle, nextStopAfterAuth],
  );

  const flow = useGoogleNativeAuth(finish);
  return <GoogleButton {...flow} />;
}

function GoogleButton({ busy, error, start }: GoogleFlow) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <Pressable
        testID="google-sign-in"
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        onPress={start}
        disabled={busy}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed || busy ? 0.8 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
        )}
        <Text style={[styles.text, { color: colors.foreground }]}>{busy ? 'Connecting…' : 'Continue with Google'}</Text>
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

export function AuthDivider({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.divider}>
      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9 },
  button: { minHeight: 54, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  text: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 9, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: 'Inter_500Medium', fontSize: 11, letterSpacing: 0.4 },
});

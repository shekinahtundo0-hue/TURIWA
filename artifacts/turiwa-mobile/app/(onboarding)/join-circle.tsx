import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { AuthButton, AuthField, AuthHeader, AuthShell } from '@/components/AuthUI';
import { AuthDivider, GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useTuriwa } from '@/context/TuriwaContext';
import { useColors } from '@/hooks/useColors';
import { isGoogleAuthConfigured } from '@/lib/firebase';
import { isGoogleNativeAuthConfigured } from '@/lib/googleAuthNative';
import { circleInviteHref, normalizeCircleInviteCode } from '@/lib/circleInvite';

export default function JoinCircleScreen() {
  const colors = useColors();
  const { joinCircle, signedIn } = useTuriwa();
  const { code: inviteParam } = useLocalSearchParams<{ code?: string }>();
  const inviteCode = normalizeCircleInviteCode(inviteParam);
  const googleAuthAvailable =
    Platform.OS === 'web' ? isGoogleAuthConfigured() : isGoogleNativeAuthConfigured();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const autoJoinCode = useRef<string | null>(null);

  const submit = useCallback(async (value = code) => {
    if (busy) return;
    const normalized = value.replace(/\s/g, '').toLowerCase();
    if (!/^[a-f0-9]{16}$/.test(normalized)) {
      setError('Enter the 16-character invite code shared by a circle member.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await joinCircle(normalized);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join this circle. Check the code and try again.');
      setBusy(false);
    }
  }, [busy, code, joinCircle]);

  useEffect(() => {
    if (inviteCode) setCode(inviteCode);
  }, [inviteCode]);

  useEffect(() => {
    if (!signedIn || !inviteCode || autoJoinCode.current === inviteCode) return;
    autoJoinCode.current = inviteCode;
    void submit(inviteCode);
  }, [inviteCode, signedIn, submit]);

  const openAuth = (path: '/(auth)/sign-in' | '/(auth)/sign-up') => {
    router.push(inviteCode ? { pathname: path, params: { code: inviteCode } } : path);
  };

  return (
    <AuthShell>
      <AuthHeader
        title="Join a circle"
        subtitle={
          signedIn
            ? 'Enter the invite code shared by someone in the circle.'
            : inviteCode
              ? `Sign in or create an account to join with invite code ${inviteCode}.`
              : 'Sign in or create an account before joining a circle.'
        }
        onBack={() => router.back()}
      />
      {signedIn ? (
        <>
          <AuthField
            testID="join-code"
            label="Circle invite code"
            value={code}
            onChangeText={(value) => {
              setCode(value.replace(/\s/g, '').slice(0, 16));
              if (error) setError('');
            }}
            placeholder="16-character code"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={16}
            error={error}
          />
          <AuthButton
            testID="join-submit"
            label={busy ? 'Joining…' : 'Join circle'}
            onPress={() => void submit()}
            disabled={busy}
            icon="users"
          />
        </>
      ) : (
        <View style={{ gap: 12 }}>
          {googleAuthAvailable ? (
            <>
              <GoogleSignInButton />
              <AuthDivider label="OR CONTINUE WITH YOUR PHONE" />
            </>
          ) : null}
          <AuthButton label="Sign in" onPress={() => openAuth('/(auth)/sign-in')} icon="arrow-right" />
          <AuthButton label="Create account" onPress={() => openAuth('/(auth)/sign-up')} outline />
          {inviteCode ? (
            <Text style={{ color: colors.mutedForeground, textAlign: 'center', fontSize: 12 }}>
              The invite will be opened automatically after sign-in.
            </Text>
          ) : null}
        </View>
      )}
      {signedIn ? (
        <View style={{ marginTop: 12 }}>
          <AuthButton
            testID="onboarding-create"
            label="Or start a new circle instead"
            icon="plus"
            outline
            onPress={() => router.replace('/(onboarding)/create-group')}
          />
        </View>
      ) : null}
    </AuthShell>
  );
}

import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Google signs a mobile ID token for whichever OAuth client ran the sign-in, and an Android
// client is bound to this build's package name and signing certificate. Without that client
// id there is no native Google button to show, and the build stays on phone + password.
const clientIds = {
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
};

export function isGoogleNativeAuthConfigured(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean(Platform.select({ ios: clientIds.ios, android: clientIds.android, default: '' }));
}

export type NativeGoogleAuth = {
  busy: boolean;
  error: string;
  start: () => Promise<void>;
};

// The token only ever appears on `response`: for an installed app the provider runs the
// authorization-code exchange behind the scenes and republishes the result carrying
// `id_token`, while `promptAsync` resolves early with the code response.
export function useGoogleNativeAuth(onIdToken: (idToken: string) => Promise<void>): NativeGoogleAuth {
  const [, response, promptAsync] = useIdTokenAuthRequest({
    androidClientId: clientIds.android,
    iosClientId: clientIds.ios,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const delivered = useRef(false);

  useEffect(() => {
    if (response?.type !== 'success' || delivered.current) return;
    delivered.current = true;
    const idToken = String(response.params.id_token ?? '');
    if (!idToken) {
      setBusy(false);
      setError('Google did not return a sign-in token for this build.');
      return;
    }
    onIdToken(idToken)
      .then(() => setBusy(false))
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      });
  }, [response, onIdToken]);

  const start = useCallback(async () => {
    delivered.current = false;
    setError('');
    setBusy(true);
    const result = await promptAsync();
    // A successful prompt still has the code exchange ahead of it, so only the effect
    // gets to clear the spinner once a token has actually landed.
    if (result.type === 'success') return;
    setBusy(false);
    if (result.type === 'error') {
      setError(result.error?.message ?? 'Google could not complete the sign-in.');
    }
  }, [promptAsync]);

  return { busy, error, start };
}

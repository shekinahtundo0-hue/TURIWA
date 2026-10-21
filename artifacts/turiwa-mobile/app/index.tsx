import React, { useCallback, useState } from 'react';
import { Redirect } from 'expo-router';
import { useTuriwa } from '@/context/TuriwaContext';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function EntryScreen() {
  const { authHydrated, signedIn } = useTuriwa();
  const [splashDone, setSplashDone] = useState(false);
  // Stable identity: the splash's exit effect restarts whenever this changes, and this
  // screen re-renders on every store update behind it.
  const complete = useCallback(() => setSplashDone(true), []);

  // If both splash animation has completed and auth is hydrated, redirect to target
  if (authHydrated && splashDone) {
    return signedIn ? <Redirect href="/(tabs)" /> : <Redirect href="/(auth)/welcome" />;
  }

  return <LoadingScreen ready={authHydrated} onComplete={complete} />;
}
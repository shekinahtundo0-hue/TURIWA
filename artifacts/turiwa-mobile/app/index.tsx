import React, { useState } from 'react';
import { Redirect } from 'expo-router';
import { useTuriwa } from '@/context/TuriwaContext';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function EntryScreen() {
  const { authHydrated, signedIn } = useTuriwa();
  const [splashDone, setSplashDone] = useState(false);

  // If both splash animation has completed and auth is hydrated, redirect to target
  if (authHydrated && splashDone) {
    return signedIn ? <Redirect href="/(tabs)" /> : <Redirect href="/(auth)/welcome" />;
  }

  return (
    <LoadingScreen
      ready={authHydrated}
      onComplete={() => {
        setSplashDone(true);
      }}
    />
  );
}
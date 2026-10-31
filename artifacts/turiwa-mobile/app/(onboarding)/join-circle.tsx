import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AuthButton, AuthField, AuthHeader, AuthShell } from '@/components/AuthUI';
import { useTuriwa } from '@/context/TuriwaContext';

export default function JoinCircleScreen() {
  const { joinCircle } = useTuriwa();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const normalized = code.replace(/\s/g, '').toLowerCase();
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
  };

  return (
    <AuthShell>
      <AuthHeader
        title="Join a circle"
        subtitle="Enter the invite code shared by someone in the circle."
        onBack={() => router.back()}
      />
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
        onPress={submit}
        disabled={busy}
        icon="users"
      />
      <View style={{ marginTop: 12 }}>
        <AuthButton
          testID="onboarding-create"
          label="Or start a new circle instead"
          icon="plus"
          outline
          onPress={() => router.replace('/(onboarding)/create-group')}
        />
      </View>
    </AuthShell>
  );
}

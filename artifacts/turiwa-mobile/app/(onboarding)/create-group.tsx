import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthButton, AuthHeader, AuthShell } from '@/components/AuthUI';
import { GroupForm } from '@/components/GroupForm';
import { useTuriwa } from '@/context/TuriwaContext';
import { useColors } from '@/hooks/useColors';

export default function CreateGroupScreen() {
  const colors = useColors();
  const { profileName, createCircle } = useTuriwa();
  return (
    <AuthShell>
      <AuthHeader
        title="Create or join a circle"
        subtitle={`Welcome, ${profileName}. Start a group of your own, or join one with an invite code.`}
      />
      <AuthButton
        testID="onboarding-join"
        label="Join a circle with an invite code"
        icon="users"
        outline
        onPress={() => router.push('/join-circle' as Href)}
      />
      <View style={styles.orRow}>
        <View style={[styles.orLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.orText, { color: colors.mutedForeground }]}>OR START A NEW CIRCLE</Text>
        <View style={[styles.orLine, { backgroundColor: colors.border }]} />
      </View>
      <View style={[styles.stepRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.step}>
          <Text style={[styles.stepNumber, { color: colors.primary }]}>1</Text>
          <Text style={[styles.stepText, { color: colors.mutedForeground }]}>Create a group</Text>
        </View>
        <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
        <View style={styles.step}>
          <Text style={[styles.stepNumberMuted, { color: colors.mutedForeground }]}>2</Text>
          <Text style={[styles.stepText, { color: colors.mutedForeground }]}>Invite members</Text>
        </View>
      </View>
      <GroupForm
        onCreate={async (draft) => {
          await createCircle(draft);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onCreated={() => router.replace('/(tabs)')}
      />
      <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={10} style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 16 },
  orLine: { flex: 1, height: 1 },
  orText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 15, padding: 14, marginBottom: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepNumber: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  stepNumberMuted: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  stepText: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5 },
  stepLine: { flex: 1, height: 2, borderRadius: 2 },
  skip: { alignSelf: 'center', marginTop: 22, paddingVertical: 6 },
  skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});

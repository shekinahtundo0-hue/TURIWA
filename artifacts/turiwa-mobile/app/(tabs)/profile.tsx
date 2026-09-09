import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BrandHeader, Screen } from '@/components/TuriwaUI';
import { useTuriwa } from '@/context/TuriwaContext';

const items: { icon: keyof typeof Feather.glyphMap; label: string; detail: string }[] = [
  { icon: 'user', label: 'Personal details', detail: 'Your name and contact information' },
  { icon: 'shield', label: 'Security & privacy', detail: 'Keep your account protected' },
  { icon: 'help-circle', label: 'Help centre', detail: 'Answers and support from Turiwa' },
];

export default function ProfileScreen() {
  const colors = useColors();
  const { profileName, signOut } = useTuriwa();
  const initials = profileName.trim().slice(0, 1).toUpperCase() || 'S';
  return (
    <Screen>
      <BrandHeader title="Your profile" subtitle="Your Turiwa account, your way." />
      <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}><Text style={[styles.avatarText, { color: colors.accentForeground }]}>{initials}</Text></View>
        <View style={{ flex: 1 }}><Text style={[styles.profileName, { color: colors.primaryForeground }]}>{profileName}</Text><Text style={[styles.profileMeta, { color: colors.successSoft }]}>Member since August 2026</Text></View>
        <View style={[styles.verified, { backgroundColor: 'rgba(255,255,255,0.15)' }]}><Feather name="check" size={13} color={colors.primaryForeground} /><Text style={[styles.verifiedText, { color: colors.primaryForeground }]}>Verified</Text></View>
      </View>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACCOUNT</Text>
      <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {items.map((item) => <Pressable key={item.label} onPress={() => Alert.alert(item.label, 'This space is ready for your account settings.')} style={({ pressed }) => [styles.menuItem, { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><View style={[styles.menuIcon, { backgroundColor: colors.successSoft }]}><Feather name={item.icon} size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text><Text style={[styles.menuDetail, { color: colors.mutedForeground }]}>{item.detail}</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>)}
      </View>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ABOUT TURIWA</Text>
      <View style={[styles.aboutCard, { backgroundColor: colors.warmSurface, borderColor: colors.accent }]}><Text style={[styles.aboutTitle, { color: colors.foreground }]}>Trust, transparently.</Text><Text style={[styles.aboutCopy, { color: colors.inkSoft }]}>Turiwa helps communities save together with clarity, accountability, and a shared sense of progress.</Text><Text style={[styles.version, { color: colors.mutedForeground }]}>Version 1.0.0</Text></View>
      <Pressable onPress={() => Alert.alert('Sign out', 'Are you sure you want to sign out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/(auth)/welcome'); } }])} style={styles.signOut}><Feather name="log-out" size={16} color={colors.destructive} /><Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: { borderRadius: 21, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 51, height: 51, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  profileName: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  profileMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
  verified: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14 },
  verifiedText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6, marginTop: 29, marginBottom: 9 },
  menu: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  menuItem: { minHeight: 70, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  menuDetail: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  aboutCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  aboutTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  aboutCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 },
  version: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 14 },
  signOut: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24, padding: 12 },
  signOutText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
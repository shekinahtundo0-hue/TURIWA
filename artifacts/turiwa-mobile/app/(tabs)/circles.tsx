import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTuriwa } from '@/context/TuriwaContext';
import { BrandHeader, CircleCard, PrimaryButton, Screen, SectionHeading, styles as uiStyles } from '@/components/TuriwaUI';

export default function CirclesScreen() {
  const colors = useColors();
  const { circles, contributions, createCircle } = useTuriwa();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [monthly, setMonthly] = useState('');
  const insets = useSafeAreaInsets();
  const save = async () => {
    if (!name.trim() || Number(monthly) <= 0) return;
    await createCircle(name, Number(monthly));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setName('');
    setMonthly('');
    setVisible(false);
  };
  return (
    <>
      <Screen>
        <BrandHeader title="Your circles" subtitle={`${circles.length} groups · everything in one place`} />
        <View style={[styles.summary, { backgroundColor: colors.warmSurface, borderColor: colors.accent }]}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.accent }]}><MaterialCommunityIcons name="hand-heart-outline" size={21} color={colors.accentForeground} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.summaryTitle, { color: colors.foreground }]}>Together, you go further</Text><Text style={[styles.summaryCopy, { color: colors.inkSoft }]}>Every contribution builds trust and momentum.</Text></View>
        </View>
        <SectionHeading title="Active circles" action="+ New circle" onAction={() => setVisible(true)} />
        {circles.map((circle) => <CircleCard key={circle.id} {...circle} tone={circle.color} current={circle.id === 'harambee' ? contributions.reduce((sum, item) => sum + item.amount, 0) : 11200} target={circle.target} onPress={() => Alert.alert(circle.name, 'Circle details and member management will live here as your group grows.')} />)}
        <View style={[styles.transparentNote, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="eye" size={17} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.noteTitle, { color: colors.foreground }]}>Built on transparency</Text><Text style={[styles.noteCopy, { color: colors.mutedForeground }]}>Your circle history stays visible to every member.</Text></View></View>
      </Screen>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={[styles.modalShade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}><View style={[styles.modalCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 18 }]}><View style={[styles.modalHandle, { backgroundColor: colors.border }]} /><Text style={[styles.modalTitle, { color: colors.foreground }]}>Start a new circle</Text><Text style={[styles.modalHint, { color: colors.mutedForeground }]}>Create a space for a shared goal and invite your people.</Text><Text style={[styles.label, { color: colors.inkSoft }]}>Circle name</Text><TextInput value={name} onChangeText={setName} placeholder="e.g. Family fund" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /><Text style={[styles.label, { color: colors.inkSoft }]}>Monthly contribution</Text><View style={[styles.amountWrap, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.currency, { color: colors.primary }]}>KES</Text><TextInput value={monthly} onChangeText={setMonthly} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { color: colors.foreground }]} /></View><View style={styles.actions}><Pressable onPress={() => setVisible(false)} style={[styles.cancel, { borderColor: colors.border }]}><Text style={[styles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable><View style={{ flex: 1 }}><PrimaryButton label="Create circle" icon="arrow-right" onPress={save} /></View></View></View></View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 18, padding: 16, borderWidth: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  summaryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  summaryCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  transparentNote: { borderRadius: 17, borderWidth: 1, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'center', marginTop: 18 },
  noteTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  noteCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  modalShade: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 11 },
  modalHandle: { width: 38, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 22 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 19 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 8, marginTop: 10 },
  input: { borderWidth: 1, height: 52, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 },
  amountWrap: { borderWidth: 1, height: 55, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  currency: { fontFamily: 'Inter_700Bold', fontSize: 13, marginRight: 12 },
  amountInput: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 23 },
  cancel: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, height: 49, justifyContent: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
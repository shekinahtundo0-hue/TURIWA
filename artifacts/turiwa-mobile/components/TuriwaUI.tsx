import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const Container = scroll ? require('react-native').ScrollView : View;
  return (
    <Container
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={scroll ? { paddingTop: insets.top + 12, paddingBottom: 116 } : undefined}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </Container>
  );
}

export function BrandHeader({ eyebrow = 'TURIWA', title, subtitle, onNotification }: { eyebrow?: string; title: string; subtitle?: string; onNotification?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      <Pressable testID="notifications-button" onPress={onNotification} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
        <Feather name="bell" size={19} color={colors.foreground} />
        <View style={[styles.notificationDot, { backgroundColor: colors.accent, borderColor: colors.card }]} />
      </Pressable>
    </View>
  );
}

export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {action ? <Pressable onPress={onAction}><Text style={[styles.actionText, { color: colors.primary }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function Amount({ value, size = 28, color }: { value: number; size?: number; color?: string }) {
  const colors = useColors();
  return <Text style={{ color: color ?? colors.foreground, fontSize: size, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 }}>KES {value.toLocaleString()}</Text>;
}

export function PrimaryButton({ label, icon, onPress, compact = false }: { label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void; compact?: boolean }) {
  const colors = useColors();
  return (
    <Pressable testID={`button-${label.toLowerCase().replaceAll(' ', '-')}`} onPress={onPress} style={({ pressed }) => [{ backgroundColor: colors.primary, paddingVertical: compact ? 11 : 15, paddingHorizontal: compact ? 15 : 19, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.82 : 1 }]}>
      {icon ? <Feather name={icon} size={compact ? 15 : 17} color={colors.primaryForeground} /> : null}
      <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: compact ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function StatPill({ icon, label, value, tone = 'green' }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; tone?: 'green' | 'gold' }) {
  const colors = useColors();
  const backgroundColor = tone === 'gold' ? colors.warmSurface : colors.successSoft;
  const iconColor = tone === 'gold' ? colors.accentForeground : colors.primary;
  return (
    <View style={[styles.statPill, { backgroundColor }]}>
      <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
      <View><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text></View>
    </View>
  );
}

export function CircleCard({ name, members, monthly, current, target, tone, onPress }: { name: string; members: number; monthly: number; current: number; target: number; tone: 'green' | 'gold' | 'blue'; onPress?: () => void }) {
  const colors = useColors();
  const tint = tone === 'gold' ? colors.accent : tone === 'blue' ? colors.tint : colors.primary;
  const progress = Math.min(current / target, 1);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.circleCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.86 : 1 }]}>
      <View style={[styles.circleIcon, { backgroundColor: tone === 'gold' ? colors.warmSurface : colors.successSoft }]}><MaterialCommunityIcons name="account-group-outline" size={21} color={tint} /></View>
      <View style={styles.circleMain}>
        <View style={styles.circleTop}><Text style={[styles.circleName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></View>
        <Text style={[styles.circleMeta, { color: colors.mutedForeground }]}>{members} members · KES {monthly.toLocaleString()} / month</Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}><View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: tint }]} /></View>
        <View style={styles.circleBottom}><Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{Math.round(progress * 100)}% of goal</Text><Text style={[styles.progressAmount, { color: colors.foreground }]}>KES {current.toLocaleString()}</Text></View>
      </View>
    </Pressable>
  );
}

export function ActivityRow({ note, date, amount, status }: { note: string; date: string; amount: number; status: 'Complete' | 'Pending' }) {
  const colors = useColors();
  const complete = status === 'Complete';
  return (
    <View style={[styles.activityRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.activityIcon, { backgroundColor: complete ? colors.successSoft : colors.warmSurface }]}><MaterialCommunityIcons name={complete ? 'arrow-top-right' : 'clock-outline'} size={18} color={complete ? colors.primary : colors.accentForeground} /></View>
      <View style={styles.activityCopy}><Text style={[styles.activityNote, { color: colors.foreground }]}>{note}</Text><Text style={[styles.activityDate, { color: colors.mutedForeground }]}>{date}</Text></View>
      <View style={styles.activityAmount}><Text style={[styles.amountText, { color: colors.foreground }]}>+ KES {amount.toLocaleString()}</Text><Text style={[styles.statusText, { color: complete ? colors.success : colors.accentForeground }]}>{status}</Text></View>
    </View>
  );
}

export function AddContributionModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (amount: number, note: string) => Promise<void> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const validAmount = Number(amount) > 0;
  const save = async () => {
    if (!validAmount) return;
    setSaving(true);
    await onSave(Number(amount), note);
    setSaving(false);
    setAmount('');
    setNote('');
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalShade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalEyebrow, { color: colors.primary }]}>HARAMBEE QUEENS</Text>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Record a contribution</Text>
          <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>Your contribution is saved securely on this device.</Text>
          <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Amount</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.currencyPrefix, { color: colors.primary }]}>KES</Text><TextInput testID="contribution-amount" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { color: colors.foreground }]} /></View>
          <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Note <Text style={{ color: colors.mutedForeground }}>(optional)</Text></Text>
          <TextInput testID="contribution-note" value={note} onChangeText={setNote} placeholder="e.g. September contribution" placeholderTextColor={colors.mutedForeground} style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
          <View style={styles.modalActions}><Pressable onPress={onClose} style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[styles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable><View style={styles.saveButton}>{saving ? <ActivityIndicator color={colors.primaryForeground} /> : <PrimaryButton label="Save contribution" icon="check" onPress={save} />}</View></View>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2.2, marginBottom: 8 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.8 },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 7 },
  iconButton: { width: 43, height: 43, borderRadius: 15, borderWidth: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  notificationDot: { position: 'absolute', right: 10, top: 9, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 13 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, letterSpacing: -0.2 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  statPill: { borderRadius: 17, padding: 15, flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, marginBottom: 4 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  circleCard: { borderWidth: 1, borderRadius: 19, padding: 15, flexDirection: 'row', gap: 12, marginBottom: 10 },
  circleIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  circleMain: { flex: 1 },
  circleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  circleName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, flex: 1, marginRight: 5 },
  circleMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  progressTrack: { height: 6, borderRadius: 4, marginTop: 13, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  circleBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  progressLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  progressAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, gap: 11 },
  activityIcon: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  activityCopy: { flex: 1 },
  activityNote: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  activityDate: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
  activityAmount: { alignItems: 'flex-end' },
  amountText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  statusText: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 5 },
  modalShade: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 11 },
  modalHandle: { width: 38, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 22 },
  modalEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.7, marginBottom: 9 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 20 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 8, marginTop: 10 },
  inputWrap: { borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 56 },
  currencyPrefix: { fontFamily: 'Inter_700Bold', fontSize: 14, marginRight: 12 },
  amountInput: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 22 },
  textInput: { borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 23, alignItems: 'center' },
  cancelButton: { height: 49, paddingHorizontal: 17, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  saveButton: { flex: 1 },
});
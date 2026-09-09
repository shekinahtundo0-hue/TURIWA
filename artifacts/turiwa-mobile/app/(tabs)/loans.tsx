import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Loan, useTuriwa } from '@/context/TuriwaContext';
import { BrandHeader, PrimaryButton, Screen, SectionHeading } from '@/components/TuriwaUI';

export default function LoansScreen() {
  const colors = useColors();
  const { loans, applyForLoan, repayLoan } = useTuriwa();
  const [applicationVisible, setApplicationVisible] = useState(false);
  const [repaymentVisible, setRepaymentVisible] = useState(false);
  const activeLoan = loans.find((loan) => loan.status === 'Active' || loan.status === 'Pending');
  const totalBorrowed = loans.reduce((sum, loan) => sum + loan.principal, 0);

  return (
    <>
      <Screen>
        <BrandHeader title="Loans" subtitle="Access what you need, with clarity." />
        <View style={[styles.creditCard, { backgroundColor: colors.primary }]}>
          <View style={styles.creditRing} />
          <Text style={[styles.creditEyebrow, { color: colors.successSoft }]}>AVAILABLE CREDIT</Text>
          <Text style={[styles.creditValue, { color: colors.primaryForeground }]}>KES 20,000</Text>
          <View style={styles.creditFooter}>
            <View><Text style={[styles.creditLabel, { color: colors.successSoft }]}>Eligible from your circles</Text><Text style={[styles.creditMeta, { color: colors.primaryForeground }]}>5% transparent service fee</Text></View>
            <View style={[styles.creditMark, { backgroundColor: 'rgba(255,255,255,0.15)' }]}><Feather name="check" size={15} color={colors.primaryForeground} /><Text style={[styles.creditMarkText, { color: colors.primaryForeground }]}>Ready</Text></View>
          </View>
        </View>
        <View style={styles.loanActions}>
          <View style={{ flex: 1 }}><PrimaryButton label="Request a loan" icon="plus" onPress={() => setApplicationVisible(true)} /></View>
          <Pressable onPress={() => Alert.alert('Loan history', `${loans.length} loan record${loans.length === 1 ? '' : 's'} on this device.`)} style={({ pressed }) => [styles.historyButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Feather name="clock" size={17} color={colors.primary} /><Text style={[styles.historyText, { color: colors.primary }]}>History</Text></Pressable>
        </View>
        <SectionHeading title="Your current loan" />
        {activeLoan ? <LoanCard loan={activeLoan} onRepay={() => setRepaymentVisible(true)} /> : <View style={[styles.emptyLoan, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.emptyIcon, { backgroundColor: colors.successSoft }]}><MaterialCommunityIcons name="hand-coin-outline" size={24} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No active loan</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>When you need a little help, your available credit is ready.</Text><PrimaryButton label="See what I qualify for" icon="arrow-right" onPress={() => setApplicationVisible(true)} compact /></View>}
        <SectionHeading title="Why Turiwa loans?" />
        <View style={styles.reasons}>
          <Reason icon="eye" title="Always transparent" copy="See your fee and repayment total before you apply." />
          <Reason icon="users" title="Built around your circle" copy="Your savings history helps unlock access when you need it." />
          <Reason icon="shield" title="A clear repayment plan" copy="Track every payment and your remaining balance in one place." />
        </View>
        <View style={[styles.borrowed, { backgroundColor: colors.warmSurface }]}><Feather name="bar-chart-2" size={16} color={colors.accentForeground} /><Text style={[styles.borrowedText, { color: colors.inkSoft }]}>Total borrowed with Turiwa: <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>KES {totalBorrowed.toLocaleString()}</Text></Text></View>
      </Screen>
      <LoanApplicationModal visible={applicationVisible} onClose={() => setApplicationVisible(false)} onSave={applyForLoan} />
      <RepaymentModal visible={repaymentVisible} loan={activeLoan} onClose={() => setRepaymentVisible(false)} onSave={repayLoan} />
    </>
  );
}

function LoanCard({ loan, onRepay }: { loan: Loan; onRepay: () => void }) {
  const colors = useColors();
  const progress = Math.min((loan.principal - loan.balance) / loan.principal, 1);
  return <View style={[styles.loanCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.loanCardTop}><View style={[styles.loanIcon, { backgroundColor: colors.successSoft }]}><MaterialCommunityIcons name="hand-coin-outline" size={22} color={colors.primary} /></View><View style={styles.loanTitleWrap}><Text style={[styles.loanName, { color: colors.foreground }]}>{loan.purpose}</Text><Text style={[styles.loanMeta, { color: colors.mutedForeground }]}>{loan.status === 'Pending' ? 'Application pending' : `Due ${loan.dueDate}`}</Text></View><View style={[styles.statusBadge, { backgroundColor: loan.status === 'Pending' ? colors.warmSurface : colors.successSoft }]}><Text style={[styles.statusBadgeText, { color: loan.status === 'Pending' ? colors.accentForeground : colors.primary }]}>{loan.status}</Text></View></View><View style={styles.balanceRow}><View><Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>Remaining balance</Text><Text style={[styles.balanceValue, { color: colors.foreground }]}>KES {loan.balance.toLocaleString()}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>Monthly repayment</Text><Text style={[styles.monthlyValue, { color: colors.foreground }]}>KES {loan.monthlyRepayment.toLocaleString()}</Text></View></View><View style={[styles.loanTrack, { backgroundColor: colors.muted }]}><View style={[styles.loanFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} /></View><View style={styles.loanProgressRow}><Text style={[styles.loanProgressText, { color: colors.mutedForeground }]}>{Math.round(progress * 100)}% repaid</Text><Text style={[styles.loanProgressText, { color: colors.mutedForeground }]}>{loan.interestRate}% fee</Text></View><PrimaryButton label="Make a repayment" icon="arrow-up-right" onPress={onRepay} compact /></View>;
}

function Reason({ icon, title, copy }: { icon: keyof typeof Feather.glyphMap; title: string; copy: string }) {
  const colors = useColors();
  return <View style={[styles.reason, { borderBottomColor: colors.border }]}><View style={[styles.reasonIcon, { backgroundColor: colors.successSoft }]}><Feather name={icon} size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.reasonTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.reasonCopy, { color: colors.mutedForeground }]}>{copy}</Text></View></View>;
}

function LoanApplicationModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (amount: number, purpose: string) => Promise<void> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const valid = Number(amount) >= 1000 && Number(amount) <= 20000 && purpose.trim().length > 0;
  const submit = async () => { if (!valid) return; await onSave(Number(amount), purpose); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setAmount(''); setPurpose(''); onClose(); };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={[styles.modalShade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}><View style={[styles.modalCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}><View style={[styles.modalHandle, { backgroundColor: colors.border }]} /><Text style={[styles.modalEyebrow, { color: colors.primary }]}>TURIWA CREDIT</Text><Text style={[styles.modalTitle, { color: colors.foreground }]}>How much do you need?</Text><Text style={[styles.modalHint, { color: colors.mutedForeground }]}>You can request between KES 1,000 and KES 20,000. The fee is shown upfront.</Text><Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Amount</Text><View style={[styles.amountWrap, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.currency, { color: colors.primary }]}>KES</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { color: colors.foreground }]} /></View><Text style={[styles.inputLabel, { color: colors.inkSoft }]}>What is it for?</Text><TextInput value={purpose} onChangeText={setPurpose} placeholder="e.g. School fees" placeholderTextColor={colors.mutedForeground} style={[styles.textInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /><Text style={[styles.validation, { color: colors.destructive }]}>{amount && Number(amount) > 20000 ? 'Your request is above your available credit.' : ''}</Text><View style={styles.modalActions}><Pressable onPress={onClose} style={[styles.cancelButton, { borderColor: colors.border }]}><Text style={[styles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable><View style={{ flex: 1 }}><PrimaryButton label="Review request" icon="arrow-right" onPress={submit} /></View></View></View></View></Modal>;
}

function RepaymentModal({ visible, loan, onClose, onSave }: { visible: boolean; loan?: Loan; onClose: () => void; onSave: (amount: number) => Promise<void> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const valid = Number(amount) > 0 && Number(amount) <= (loan?.balance ?? 0);
  const submit = async () => { if (!valid) return; await onSave(Number(amount)); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setAmount(''); onClose(); };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={[styles.modalShade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}><View style={[styles.modalCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}><View style={[styles.modalHandle, { backgroundColor: colors.border }]} /><Text style={[styles.modalEyebrow, { color: colors.primary }]}>REPAYMENT</Text><Text style={[styles.modalTitle, { color: colors.foreground }]}>Make a repayment</Text><Text style={[styles.modalHint, { color: colors.mutedForeground }]}>Your remaining balance is KES {(loan?.balance ?? 0).toLocaleString()}.</Text><Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Amount</Text><View style={[styles.amountWrap, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.currency, { color: colors.primary }]}>KES</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={`${loan?.monthlyRepayment ?? 0}`} placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { color: colors.foreground }]} /></View><View style={styles.modalActions}><Pressable onPress={onClose} style={[styles.cancelButton, { borderColor: colors.border }]}><Text style={[styles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable><View style={{ flex: 1 }}><PrimaryButton label="Confirm repayment" icon="check" onPress={submit} /></View></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  creditCard: { borderRadius: 24, padding: 21, minHeight: 174, overflow: 'hidden' },
  creditRing: { position: 'absolute', width: 210, height: 210, borderRadius: 105, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', right: -65, top: -75 },
  creditEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.7 },
  creditValue: { fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1, marginTop: 12 },
  creditFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24 },
  creditLabel: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  creditMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  creditMark: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16 },
  creditMarkText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  loanActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  historyButton: { flex: 0.42, borderWidth: 1, borderRadius: 14, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  historyText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  loanCard: { borderWidth: 1, borderRadius: 20, padding: 16 },
  loanCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loanIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loanTitleWrap: { flex: 1 },
  loanName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  loanMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  statusBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 19 },
  balanceLabel: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  balanceValue: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.4, marginTop: 5 },
  monthlyValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 9 },
  loanTrack: { height: 7, borderRadius: 5, marginTop: 17, overflow: 'hidden' },
  loanFill: { height: '100%', borderRadius: 5 },
  loanProgressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, marginBottom: 14 },
  loanProgressText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  emptyLoan: { borderRadius: 20, borderWidth: 1, padding: 22, alignItems: 'center' },
  emptyIcon: { width: 51, height: 51, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 12 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6, marginBottom: 15 },
  reasons: { backgroundColor: 'transparent' },
  reason: { flexDirection: 'row', gap: 11, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1 },
  reasonIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reasonTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  reasonCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4, lineHeight: 16 },
  borrowed: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 13, marginTop: 20 },
  borrowedText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  modalShade: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 11 },
  modalHandle: { width: 38, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 22 },
  modalEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.7, marginBottom: 9 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 20 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 8, marginTop: 10 },
  amountWrap: { borderWidth: 1, height: 55, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  currency: { fontFamily: 'Inter_700Bold', fontSize: 13, marginRight: 12 },
  amountInput: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 21 },
  textInput: { borderWidth: 1, height: 52, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 },
  validation: { fontFamily: 'Inter_400Regular', fontSize: 11, minHeight: 16, marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  cancelButton: { height: 49, paddingHorizontal: 17, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
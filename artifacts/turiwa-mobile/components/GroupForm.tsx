import { Feather } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { FREQUENCIES, INTEREST_PERIODS, frequencyNoun, MIN_LOAN, periodsPerYear, type Frequency, type GroupDraft, type InterestPeriod } from '@/lib/api';
import { quoteLoan } from '@/lib/loanMath';
import { PrimaryButton } from '@/components/TuriwaUI';

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 7);

type GroupFormProps = {
  onCreate: (draft: GroupDraft) => Promise<void>;
  onCreated?: (draft: GroupDraft) => void;
  submitLabel?: string;
  initialName?: string;
};

export function GroupForm({
  onCreate,
  onCreated,
  submitLabel = 'Create Group',
  initialName = '',
}: GroupFormProps) {
  const colors = useColors();
  const [name, setName] = useState(initialName);
  const [contribution, setContribution] = useState('5000');
  const [frequency, setFrequency] = useState<Frequency>('Monthly');
  const [joiningFee, setJoiningFee] = useState('1000');
  const [welfare, setWelfare] = useState('500');
  const [lateFine, setLateFine] = useState('0');
  const [loanInterest, setLoanInterest] = useState('10');
  const [loanInterestPeriod, setLoanInterestPeriod] = useState<InterestPeriod>('Month');
  const [errors, setErrors] = useState<{ name?: string; contribution?: string; loanInterest?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nameInput = useRef<TextInput>(null);
  const contributionInput = useRef<TextInput>(null);

  const amount = Number(contribution) || 0;
  const yearlyTarget = amount * periodsPerYear(frequency);
  // The example is the smallest loan the fund can hand over, so it reads as a sample
  // rather than as if the contribution figure were a credit limit.
  const quote = quoteLoan(MIN_LOAN, Number(loanInterest) || 0, loanInterestPeriod);

  const submit = async () => {
    const interest = Number(loanInterest);
    const nextErrors = {
      ...(!name.trim() ? { name: 'Give your group a name.' } : null),
      ...(amount <= 0 ? { contribution: 'Set a contribution above zero.' } : null),
      ...(!(interest >= 0 && interest <= 100) ? { loanInterest: 'Keep the loan interest between 0 and 100.' } : null),
    };
    setErrors(nextErrors);
    setFormError('');
    if (nextErrors.name) {
      nameInput.current?.focus();
      return;
    }
    if (nextErrors.contribution) {
      contributionInput.current?.focus();
      return;
    }
    if (Object.keys(nextErrors).length > 0) return;

    const draft: GroupDraft = {
      name: name.trim(),
      contribution: amount,
      frequency,
      joiningFee: Number(joiningFee) || 0,
      welfare: Number(welfare) || 0,
      lateFine: Number(lateFine) || 0,
      loanInterestPercent: interest,
      loanInterestPeriod,
    };
    setSubmitting(true);
    try {
      await onCreate(draft);
      onCreated?.(draft);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the group. Try again.');
      setSubmitting(false);
    }
  };

  const clear = (key: keyof typeof errors) => {
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.inkSoft }]}>GROUP NAME</Text>
      <TextInput
        ref={nameInput}
        testID="group-name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          clear('name');
        }}
        placeholder="e.g. Mamas United"
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Group name"
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, borderColor: errors.name ? colors.destructive : colors.border }]}
      />
      {errors.name ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors.name}</Text> : null}

      <Text style={[styles.label, { color: colors.inkSoft }]}>CONTRIBUTION (KSH)</Text>
      <View style={[styles.amountWrap, { backgroundColor: colors.input, borderColor: errors.contribution ? colors.destructive : colors.border }]}>
        <Text style={[styles.currency, { color: colors.primary }]}>KES</Text>
        <TextInput
          ref={contributionInput}
          testID="group-contribution"
          value={contribution}
          onChangeText={(value) => {
            setContribution(digits(value));
            clear('contribution');
          }}
          keyboardType="number-pad"
          accessibilityLabel="Contribution in shillings"
          placeholder="0"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.amountInput, { color: colors.foreground }]}
        />
      </View>
      {errors.contribution ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors.contribution}</Text> : null}

      <Text style={[styles.label, { color: colors.inkSoft }]}>FREQUENCY</Text>
      <View style={styles.segment}>
        {FREQUENCIES.map((item) => {
          const active = item.value === frequency;
          return (
            <Pressable
              key={item.value}
              testID={`frequency-${item.value}`}
              accessibilityRole="radio"
              accessibilityLabel={`Every ${frequencyNoun(item.value)}`}
              accessibilityState={{ selected: active }}
              onPress={() => setFrequency(item.value)}
              style={({ pressed }) => [
                styles.segmentItem,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.successSoft : colors.background,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={[styles.segmentText, { color: active ? colors.primary : colors.mutedForeground }]}>{item.short}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.goalPreview, { backgroundColor: colors.successSoft }]}>
        <Feather name="target" size={15} color={colors.primary} />
        <Text style={[styles.goalPreviewText, { color: colors.primary }]}>
          {amount > 0
            ? `KES ${amount.toLocaleString()} every ${frequencyNoun(frequency)} · the group starts with a goal of KES ${yearlyTarget.toLocaleString()} — one year at that rate, counted for you alone`
            : 'Set a contribution to see the group target.'}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.rowCell}>
          <Text style={[styles.label, { color: colors.inkSoft }]}>JOINING (KSH)</Text>
          <View style={[styles.input, styles.inputAmount, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <TextInput
              testID="group-joining"
              value={joiningFee}
              onChangeText={(value) => setJoiningFee(digits(value))}
              keyboardType="number-pad"
              accessibilityLabel="Joining fee in shillings"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.plainInput, { color: colors.foreground }]}
            />
          </View>
        </View>
        <View style={{ width: 12 }} />
        <View style={styles.rowCell}>
          <Text style={[styles.label, { color: colors.inkSoft }]}>WELFARE (KSH)</Text>
          <View style={[styles.input, styles.inputAmount, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <TextInput
              testID="group-welfare"
              value={welfare}
              onChangeText={(value) => setWelfare(digits(value))}
              keyboardType="number-pad"
              accessibilityLabel="Welfare cover in shillings"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.plainInput, { color: colors.foreground }]}
            />
          </View>
        </View>
      </View>
      <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>
        The joining fee and welfare cover are written on the group's record so everyone reads the same agreement.
        Turiwa does not collect either one — the treasurer logs the payment in the ledger when it arrives.
      </Text>

      <Text style={[styles.label, { color: colors.inkSoft }]}>LATE FINE (KSH)</Text>
      <View style={[styles.input, styles.inputAmount, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          testID="group-late-fine"
          value={lateFine}
          onChangeText={(value) => setLateFine(digits(value))}
          keyboardType="number-pad"
          accessibilityLabel="Late contribution fine in shillings"
          placeholder="0"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.plainInput, { color: colors.foreground }]}
        />
      </View>
      <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>
        What the admin charges a member who misses a contribution cycle. You can change it later on the group;
        Turiwa records the fine in the ledger and never charges anyone automatically.
      </Text>

      <Text style={[styles.label, { color: colors.inkSoft }]}>LOAN INTEREST %</Text>
      <View style={[styles.input, styles.inputAmount, { backgroundColor: colors.input, borderColor: errors.loanInterest ? colors.destructive : colors.border }]}>
        <TextInput
          testID="group-interest"
          value={loanInterest}
          onChangeText={(value) => {
            setLoanInterest(digits(value).slice(0, 3));
            clear('loanInterest');
          }}
          keyboardType="number-pad"
          accessibilityLabel="Loan interest percent"
          placeholder="10"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.plainInput, { color: colors.foreground }]}
        />
      </View>
      <View style={[styles.segment, { marginTop: 10 }]}>
        {INTEREST_PERIODS.map((item) => {
          const active = item.value === loanInterestPeriod;
          return (
            <Pressable
              key={item.value}
              testID={`interest-period-${item.value}`}
              accessibilityRole="radio"
              accessibilityLabel={`${item.label} compounding monthly`}
              accessibilityState={{ selected: active }}
              onPress={() => setLoanInterestPeriod(item.value)}
              style={({ pressed }) => [
                styles.segmentItem,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.successSoft : colors.background,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={[styles.segmentText, { color: active ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {errors.loanInterest ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors.loanInterest}</Text> : null}
      <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>
        {Number(loanInterest) > 0
          ? `Charged on what the borrower still owes, once for each month of the loan · a smallest loan of KES ${MIN_LOAN.toLocaleString()} would come back as KES ${quote.totalPayable.toLocaleString()} over ${quote.months} months.`
          : 'A rate of zero means the group lends at no cost.'}
      </Text>

      <View style={[styles.adminNote, { backgroundColor: colors.successSoft, borderColor: colors.primary }]}>
        <Feather name="shield" size={15} color={colors.primary} />
        <Text style={[styles.adminNoteText, { color: colors.primary }]}>
          As the creator, you will be the group&rsquo;s first Admin.
        </Text>
      </View>

      {formError ? (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Feather name="alert-triangle" size={15} color={colors.destructive} />
          <Text style={[styles.errorBannerText, { color: colors.destructive }]}>{formError}</Text>
        </View>
      ) : null}

      <View style={styles.submit}>
        {submitting ? (
          <View style={styles.busyWrap} accessibilityLabel="Creating group">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <PrimaryButton label={submitLabel} icon="arrow-right" onPress={submit} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 10.5, letterSpacing: 1.4, marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, height: 52, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 },
  inputAmount: { flexDirection: 'row', alignItems: 'center' },
  plainInput: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 18 },
  amountWrap: { borderWidth: 1, height: 55, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  currency: { fontFamily: 'Inter_700Bold', fontSize: 13, marginRight: 12 },
  amountInput: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 21 },
  fieldError: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15, marginTop: 6 },
  segment: { flexDirection: 'row', gap: 8 },
  segmentItem: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  goalPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginTop: 12 },
  goalPreviewText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11.5, lineHeight: 16 },
  row: { flexDirection: 'row' },
  rowCell: { flex: 1 },
  rowHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 9 },
  adminNote: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, marginTop: 20 },
  adminNoteText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11.5, lineHeight: 16 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 13, borderWidth: 1, padding: 13, marginTop: 16 },
  errorBannerText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11.5, lineHeight: 16 },
  submit: { marginTop: 22 },
  busyWrap: { height: 49, alignItems: 'center', justifyContent: 'center' },
});

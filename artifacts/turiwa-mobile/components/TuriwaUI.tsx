import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { entryDelta, frequencyNoun, interestLabel, isOutflow, isSetAside, isLentOut, kesLabel, RECORDABLE_LEDGER_TYPES, memberLabel, type Circle, type Contribution, type Frequency, type LedgerEntry, type LedgerType, type Loan } from '@/lib/api';

// "3 two-week cycles", "1 month", "5 weeks" - the pace copy has to read well for
// every frequency the group sets.
function cyclePhrase(count: number, frequency: Frequency): string {
  if (frequency === 'Bi-weekly') return `${count} ${count === 1 ? 'two-week cycle' : 'two-week cycles'}`;
  const noun = frequencyNoun(frequency);
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function Screen({ children, scroll = true, refreshing = false, onRefresh }: { children: React.ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const layout = useResponsive();
  const padding = { paddingHorizontal: layout.gutter };
  const column: ViewStyle = { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' };
  if (!scroll) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }, padding]}>
        <View style={column}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }, padding]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: layout.useSidebar ? insets.bottom + 28 : 116 }}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
    >
      <View style={column}>{children}</View>
    </ScrollView>
  );
}

/**
 * Shared presentation for the app's sheets: a bottom sheet on phones and tablets,
 * a centered dialog on desktop where a sheet would stretch across the window.
 */
export function useSheet(): {
  animationType: 'slide' | 'fade';
  shade: StyleProp<ViewStyle>;
  card: StyleProp<ViewStyle>;
  handle: StyleProp<ViewStyle>;
} {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  return {
    animationType: isDesktop ? 'fade' : 'slide',
    shade: [styles.modalShade, isDesktop && styles.modalShadeDialog],
    card: [
      styles.modalCard,
      isDesktop && styles.modalCardDialog,
      { paddingBottom: isDesktop ? 24 : insets.bottom + 20 },
    ],
    // The grabber only means "drag me down", which a centered dialog cannot do.
    handle: [styles.modalHandle, { backgroundColor: colors.border }, isDesktop && styles.hidden],
  };
}

export function BrandHeader({ eyebrow = 'TURIWA', title, subtitle, onNotification, notificationCount = 0, actions }: { eyebrow?: string; title: string; subtitle?: string; onNotification?: () => void; notificationCount?: number; actions?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        <Text numberOfLines={2} style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerActions}>
        {actions}
        {onNotification ? (
          <Pressable testID="notifications-button" onPress={onNotification} accessibilityRole="button" accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} ${notificationCount === 1 ? 'item' : 'items'}` : 'Notifications'} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Feather name="bell" size={19} color={colors.foreground} />
            {notificationCount > 0 ? (
              <View style={[styles.notificationBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                <Text testID="notifications-count" style={[styles.notificationBadgeText, { color: colors.primaryForeground }]}>{notificationCount > 99 ? '99+' : notificationCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function HeaderIconButton({ testID, icon, label, onPress, active = false, disabled = false }: { testID: string; icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: active ? colors.incomeSoft : colors.card, borderColor: active ? colors.primary : colors.border, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
    >
      <Feather name={icon} size={19} color={active ? colors.primary : colors.foreground} />
    </Pressable>
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

export function Amount({ value, size = 28, color, testID }: { value: number; size?: number; color?: string; testID?: string }) {
  const colors = useColors();
  const textColor = color ?? colors.foreground;
  const currencySize = Math.max(12, Math.round(size * 0.42));
  return (
    <View testID={testID} style={styles.amountContainer}>
      <Text style={[styles.currencyTag, { color: textColor, fontSize: currencySize }]}>KES </Text>
      <Text style={[styles.amountValue, { color: textColor, fontSize: size }]}>
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, compact = false }: { label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void; compact?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      testID={`button-${label.toLowerCase().replaceAll(' ', '-')}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButtonOuter,
        {
          borderRadius: 14,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.primaryButtonGrad,
          {
            paddingVertical: compact ? 11 : 15,
            paddingHorizontal: compact ? 16 : 22,
            borderRadius: 14,
          },
        ]}
      >
        {icon ? <Feather name={icon} size={compact ? 15 : 17} color={colors.primaryForeground} /> : null}
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground, fontSize: compact ? 13 : 15 }]}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

export function StatPill({ icon, label, value, tone = 'green' }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; tone?: 'green' | 'gold' }) {
  const colors = useColors();
  const iconBg = tone === 'gold' ? colors.warmSurface : colors.successSoft;
  const iconColor = tone === 'gold' ? colors.accentForeground : colors.primary;
  const borderCol = tone === 'gold' ? colors.goldBorder : colors.border;
  return (
    <View style={[styles.statPill, { backgroundColor: colors.card, borderColor: borderCol }]}>
      <View style={[styles.statPillIconBox, { backgroundColor: iconBg, borderColor: borderCol }]}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.statPillCopy}>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

export function CircleCard({
  name,
  members,
  contribution,
  frequency,
  current,
  target,
  tone,
  isAdmin = false,
  isCoAdmin = false,
  onPress,
}: {
  name: string;
  members: number;
  contribution: number;
  frequency: Frequency;
  current: number;
  target: number;
  tone: 'green' | 'gold' | 'blue';
  isAdmin?: boolean;
  isCoAdmin?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const tint = tone === 'gold' ? colors.accent : tone === 'blue' ? colors.tint : colors.primary;
  const progress = target > 0 ? Math.min(Math.max(current / target, 0), 1) : 0;
  return (
    <Pressable
      testID={`circle-card-${name.toLowerCase().replaceAll(/\s+/g, '-')}`}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.circleCard,
        {
          backgroundColor: colors.card,
          borderColor: isAdmin ? colors.goldBorder : colors.border,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.circleIcon,
          {
            backgroundColor: tone === 'gold' ? colors.warmSurface : colors.successSoft,
            borderColor: tone === 'gold' ? colors.goldBorder : colors.border,
          },
        ]}
      >
        <MaterialCommunityIcons name="account-group-outline" size={21} color={tint} />
      </View>
      <View style={styles.circleMain}>
        <View style={styles.circleTop}>
          <Text style={[styles.circleName, { color: colors.foreground }]} numberOfLines={1}>
            {name}
          </Text>
          {isAdmin ? (
            <View style={[styles.adminBadge, { backgroundColor: colors.goldSoft, borderColor: colors.goldBorder }]}>
              <MaterialCommunityIcons name="crown" size={10} color={colors.accentForeground} style={{ marginRight: 3 }} />
              <Text style={[styles.adminBadgeText, { color: colors.accentForeground }]}>ADMIN</Text>
            </View>
          ) : isCoAdmin ? (
            <View style={[styles.adminBadge, { backgroundColor: colors.coAdminBadgeBg, borderColor: colors.secondary }]}>
              <MaterialCommunityIcons name="shield-account" size={10} color={colors.secondary} style={{ marginRight: 3 }} />
              <Text style={[styles.adminBadgeText, { color: colors.secondary }]}>CO-ADMIN</Text>
            </View>
          ) : null}
          <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
        </View>
        <Text style={[styles.circleMeta, { color: colors.mutedForeground }]}>
          {memberLabel(members)} · KES {contribution.toLocaleString()} every {frequencyNoun(frequency)}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: tint }]} />
        </View>
        <View style={styles.circleBottom}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
            {Math.round(progress * 100)}% of goal
          </Text>
          <Text style={[styles.progressAmount, { color: colors.foreground }]}>
            KES {current.toLocaleString()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function ActivityRow({ note, date, amount, status, circleName, type = 'Contribution', member }: { note: string; date: string; amount: number; status: 'Complete' | 'Pending'; circleName?: string; type?: LedgerType; member?: string | null }) {
  const colors = useColors();
  const { tint: kindTint, surface: kindSurface, icon, sign } = ledgerTone(colors, type);
  const pending = status === 'Pending';
  const tint = pending ? colors.accentForeground : kindTint;
  const surface = pending ? colors.warmSurface : kindSurface;
  const meta = [date, circleName, member].filter(Boolean).join(' · ');
  return (
    <View style={[styles.activityRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.activityIcon, { backgroundColor: surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name={pending ? 'clock-outline' : icon} size={18} color={tint} />
      </View>
      <View style={styles.activityCopy}>
        <Text style={[styles.activityNote, { color: colors.foreground }]} numberOfLines={1}>{note}</Text>
        <Text style={[styles.activityDate, { color: colors.mutedForeground }]} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={styles.activityAmount}>
        <Text style={[styles.amountText, { color: tint }]} numberOfLines={1}>{`${sign} KES ${amount.toLocaleString()}`.trimStart()}</Text>
        <View style={[styles.activityStatusPill, { backgroundColor: surface }]}>
          <Text style={[styles.statusText, { color: tint }]}>{pending ? 'Pending' : ledgerLabel(type)}</Text>
        </View>
      </View>
    </View>
  );
}

const LEDGER_HINT: Record<LedgerType, string> = {
  Contribution: 'Money a member pays into the fund.',
  Expense: 'Money the group spent.',
  Repayment: 'Money coming back from a loan.',
  Welfare: 'Money the group sets aside and still holds.',
  // Not in the form: the API writes this row itself when a loan's money moves, so a
  // hand-typed one could report a payout no loan owes the fund for.
  LoanDisbursement: 'Cash the group handed over as a loan. The loan writes this row itself.',
};

// The kind as a person would say it. "LoanDisbursement" is the stored value, not a
// label that fits a row on a phone.
const LEDGER_LABEL: Record<LedgerType, string> = {
  Contribution: 'Contribution',
  Expense: 'Expense',
  Repayment: 'Repayment',
  Welfare: 'Welfare',
  LoanDisbursement: 'Loan paid out',
};

export const ledgerLabel = (type: LedgerType) => LEDGER_LABEL[type];

// An expense leaves the fund, welfare only leaves the spendable net, and the
// rest are money in - so the sign, ink and icon change with the kind.
function ledgerTone(colors: ReturnType<typeof useColors>, type: LedgerType) {
  // A loan's cash is going out, but it is not spending: it comes back as repayments,
  // so it gets its own ink rather than the expense red.
  if (isLentOut(type)) return { tint: colors.balance, surface: colors.balanceSoft, icon: 'bank-transfer-out' as const, sign: '−' };
  if (isOutflow(type)) return { tint: colors.expense, surface: colors.expenseSoft, icon: 'arrow-top-right' as const, sign: '−' };
  if (isSetAside(type)) return { tint: colors.balance, surface: colors.balanceSoft, icon: 'bookmark-outline' as const, sign: '' };
  return { tint: colors.income, surface: colors.incomeSoft, icon: 'arrow-bottom-left' as const, sign: '+' };
}

export function RecordTransactionModal({ visible, onClose, onSave, circles, initialCircleId, initialType = 'Contribution' }: { visible: boolean; onClose: () => void; onSave: (amount: number, note: string, circleId?: string, entry?: LedgerEntry) => Promise<void>; circles: Circle[]; initialCircleId?: string; initialType?: LedgerType }) {
  const colors = useColors();
  const sheet = useSheet();
  const [type, setType] = React.useState<LedgerType>('Contribution');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [circleId, setCircleId] = React.useState<string | undefined>(undefined);
  const [memberId, setMemberId] = React.useState<string | null>(null);
  const [memberOpen, setMemberOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    // Reset only when the sheet opens or the target circle changes; a background
    // state poll swaps the circles array identity and must not revert the picker.
    if (visible) {
      setCircleId(initialCircleId && circles.some((item) => item.id === initialCircleId) ? initialCircleId : circles[0]?.id);
      setType(initialType);
      setMemberId(null);
      setMemberOpen(false);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialCircleId, initialType]);
  const selected = circles.find((item) => item.id === circleId) ?? circles[0];
  const roster = selected?.membersList ?? [];
  const chosen = roster.find((item) => item.id === memberId) ?? null;
  const validAmount = Number(amount) > 0;
  const quickAmounts = React.useMemo(() => {
    const values = [selected?.contribution ?? 0, 500, 1000, 2000, 5000].filter((value) => value > 0);
    return [...new Set(values)].sort((a, b) => a - b);
  }, [selected?.contribution]);
  const save = async () => {
    if (!validAmount || !selected) return;
    setSaving(true);
    setError('');
    try {
      await onSave(Number(amount), note.trim() || type, selected.id, { type, member: chosen?.name ?? null });
      setAmount('');
      setNote('');
      setMemberId(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={sheet.handle} />
          <View style={styles.ledgerHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalEyebrow, { color: colors.primary, marginBottom: 7 }]}>LEDGER</Text>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Record a transaction</Text>
            </View>
            <Pressable testID="record-close" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close without saving" hitSlop={12} style={({ pressed }) => [styles.ledgerClose, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={[styles.typeGrid, { backgroundColor: colors.input }]}>
            {RECORDABLE_LEDGER_TYPES.map((item) => {
              const active = item === type;
              const tint = ledgerTone(colors, item).tint;
              return (
                <Pressable
                  key={item}
                  testID={`record-type-${item.toLowerCase()}`}
                  onPress={() => setType(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.typeCell,
                    {
                      backgroundColor: active ? colors.card : 'transparent',
                      borderColor: active ? tint : colors.border,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.typeLabel, { color: active ? tint : colors.mutedForeground }]}>{ledgerLabel(item).toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.ledgerHint, { color: colors.mutedForeground }]}>{LEDGER_HINT[type]}</Text>

          {circles.length > 1 ? (
            <>
              <Text style={[styles.ledgerLabel, { color: colors.inkSoft }]}>SELECT CIRCLE</Text>
              <View style={styles.circlePicker}>
                {circles.map((item) => {
                  const active = item.id === selected?.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setCircleId(item.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [styles.circleChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.successSoft : colors.background, opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Text style={[styles.circleChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={[styles.ledgerLabel, { color: colors.inkSoft }]}>SELECT MEMBER</Text>
          <Pressable
            testID="record-member"
            onPress={() => setMemberOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ selected: memberOpen }}
            style={({ pressed }) => [styles.memberField, { backgroundColor: colors.input, borderColor: memberOpen ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.memberValue, { color: chosen ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
              {chosen ? chosen.name : 'Choose a member…'}
            </Text>
            <Feather name={memberOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
          </Pressable>
          {memberOpen ? (
            roster.length > 0 ? (
              <View style={[styles.memberList, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <ScrollView style={styles.memberScroll} showsVerticalScrollIndicator={false}>
                  {roster.map((item) => {
                    const active = item.id === memberId;
                    return (
                      <Pressable
                        key={item.id}
                        testID={`record-member-${item.id}`}
                        onPress={() => {
                          setMemberId(active ? null : item.id);
                          setMemberOpen(false);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [styles.memberOption, { borderBottomColor: colors.border, backgroundColor: active ? colors.successSoft : 'transparent', opacity: pressed ? 0.8 : 1 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.memberOptionText, { color: active ? colors.primary : colors.foreground }]} numberOfLines={1}>{item.name}</Text>
                          <Text style={[styles.memberOptionMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.role === 'admin' ? 'Circle admin' : item.role === 'co-admin' ? 'Co-admin' : 'Member'}</Text>
                        </View>
                        {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <Text style={[styles.ledgerHint, { color: colors.mutedForeground }]}>This circle has no members to choose yet.</Text>
            )
          ) : null}

          <Text style={[styles.ledgerLabel, { color: colors.inkSoft }]}>AMOUNT (KSH)</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: error ? colors.destructive : colors.border }]}><Text style={[styles.currencyPrefix, { color: colors.mutedForeground }]}>KSh</Text><TextInput testID="contribution-amount" value={amount} onChangeText={(value) => { setAmount(value.replace(/[^\d]/g, '')); if (error) setError(''); }} keyboardType="number-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { color: colors.foreground }]} /></View>
          {quickAmounts.length > 0 ? (
            <View style={styles.amountChips}>
              {quickAmounts.map((value) => {
                const active = amount === String(value);
                return (
                  <Pressable
                    key={value}
                    testID={`quick-amount-${value}`}
                    onPress={() => setAmount(String(value))}
                    accessibilityRole="button"
                    accessibilityLabel={`Set the amount to ${value.toLocaleString()} shillings`}
                    style={({ pressed }) => [styles.amountChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.successSoft : colors.background, opacity: pressed ? 0.75 : 1 }]}
                  >
                    <Text style={[styles.amountChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{value >= 1000 ? `${value / 1000}K` : value}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={[styles.ledgerLabel, { color: colors.inkSoft }]}>MEMO / NOTES</Text>
          <TextInput testID="contribution-note" value={note} onChangeText={setNote} placeholder="e.g. April Contribution, Audit Fees…" placeholderTextColor={colors.mutedForeground} style={[styles.textInput, { backgroundColor: colors.input, borderColor: error ? colors.destructive : colors.border, color: colors.foreground }]} />
          {error ? <Text style={[styles.saveError, { color: colors.destructive }]}>{error}</Text> : null}

          <Pressable
            testID="record-commit"
            accessibilityRole="button"
            accessibilityLabel={`Commit this ${type.toLowerCase()} to the ledger`}
            disabled={saving || !validAmount || !selected}
            onPress={save}
            style={({ pressed }) => [
              styles.commitButton,
              {
                backgroundColor: colors.hero,
                boxShadow: colors.shadowHero,
                opacity: saving || !validAmount || !selected ? 0.55 : pressed ? 0.88 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.heroForeground} />
            ) : (
              <View style={styles.commitRow}>
                <Feather name="check" size={16} color={colors.heroForeground} />
                <Text style={[styles.commitText, { color: colors.heroForeground }]}>COMMIT TO LEDGER</Text>
              </View>
            )}
          </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function CircleDetailModal({
  visible,
  onClose,
  circle,
  contributions,
  loans = [],
  isAdmin = false,
  isCoAdmin = false,
  onContribute,
  onApproveLoan,
  onAssignCoAdmin,
  onRemoveCoAdmin,
  onAddMember,
}: {
  visible: boolean;
  onClose: () => void;
  circle?: Circle;
  contributions: Contribution[];
  loans?: Loan[];
  isAdmin?: boolean;
  isCoAdmin?: boolean;
  onContribute?: (circleId: string) => void;
  onApproveLoan?: (loanId: string) => Promise<void>;
  onAssignCoAdmin?: (circleId: string, memberId: string) => Promise<{ success: boolean; message: string }>;
  onRemoveCoAdmin?: (circleId: string, memberId: string) => Promise<{ success: boolean; message: string }>;
  onAddMember?: (circleId: string, name: string, phone?: string) => Promise<{ success: boolean; message: string }>;
}) {
  const colors = useColors();
  const sheet = useSheet();
  const [invite, setInvite] = React.useState<{ message: string; result: string } | null>(null);
  const [addMemberVisible, setAddMemberVisible] = React.useState(false);
  const [newMemberName, setNewMemberName] = React.useState('');
  const [newMemberPhone, setNewMemberPhone] = React.useState('');
  const [memberActionFeedback, setMemberActionFeedback] = React.useState<string | null>(null);
  const [approvalFeedback, setApprovalFeedback] = React.useState<{ message: string; failed: boolean } | null>(null);
  const [approvingLoanId, setApprovingLoanId] = React.useState<string | null>(null);

  if (!circle) return null;
  const tint = circle.color === 'gold' ? colors.accent : circle.color === 'blue' ? colors.tint : colors.primary;
  const saved = contributions.filter((item) => item.circleId === circle.id);
  // Expenses, welfare and the cash a loan handed over all shrink what the group is
  // holding, so this is its net position rather than everything it has ever received.
  const current = saved.reduce((sum, item) => sum + entryDelta(item.type ?? 'Contribution') * item.amount, 0);
  const progress = circle.target > 0 ? Math.min(Math.max(current / circle.target, 0), 1) : 0;
  const remaining = Math.max(circle.target - current, 0);
  // The group's pace is its whole cycle intake — one member's amount times the
  // members who pay it. Dividing the goal by one person's amount projects the pace of
  // a single member and says it belongs to the group.
  const perCycle = circle.contribution * Math.max(circle.members, 0);
  const cyclesToGoal = remaining === 0 || perCycle <= 0 ? 0 : Math.ceil(remaining / perCycle);

  const membersList = circle.membersList ?? [];
  const coAdminsCount = (circle.coAdminIds ?? []).length;
  const circleAdminName = membersList.find((member) => member.role === 'admin')?.name ?? 'Not recorded';
  const isCircleAdmin = isAdmin;
  const hasAdminRights = isCircleAdmin || isCoAdmin;

  // Only this group's requests: an admin decides on the loans taken through their
  // own group, not on every pending loan on the account.
  const pendingLoans = loans.filter((l) => l.status === 'Pending' && l.circleId === circle.id);

  const handleApproveLoan = async (loanId: string) => {
    if (!onApproveLoan || approvingLoanId) return;
    setApprovingLoanId(loanId);
    try {
      await onApproveLoan(loanId);
      setApprovalFeedback({ message: 'Loan approved — it now counts against the group.', failed: false });
    } catch (error) {
      setApprovalFeedback({
        message: error instanceof Error ? error.message : 'Could not approve that loan. Check the amount and try again.',
        failed: true,
      });
    } finally {
      setApprovingLoanId(null);
      setTimeout(() => setApprovalFeedback(null), 4000);
    }
  };

  const shareInvite = async () => {
    const message = `Turiwa group “${circle.name}” · KES ${circle.contribution.toLocaleString()} every ${frequencyNoun(circle.frequency)} · target KES ${circle.target.toLocaleString()}`;
    setInvite({ message, result: 'Group details ready to share.' });
    try {
      await Share.share({ message, title: `Turiwa group ${circle.name}` });
    } catch {
      // Dismissed
    }
  };

  const handleMakeCoAdmin = async (memberId: string) => {
    if (!onAssignCoAdmin) return;
    const res = await onAssignCoAdmin(circle.id, memberId);
    setMemberActionFeedback(res.message);
    setTimeout(() => setMemberActionFeedback(null), 3000);
  };

  const handleRemoveCoAdmin = async (memberId: string) => {
    if (!onRemoveCoAdmin) return;
    const res = await onRemoveCoAdmin(circle.id, memberId);
    setMemberActionFeedback(res.message);
    setTimeout(() => setMemberActionFeedback(null), 3000);
  };

  const handleAddMemberSubmit = async () => {
    if (!newMemberName.trim() || !onAddMember) return;
    const res = await onAddMember(circle.id, newMemberName, newMemberPhone);
    setMemberActionFeedback(res.message);
    setNewMemberName('');
    setNewMemberPhone('');
    setAddMemberVisible(false);
    setTimeout(() => setMemberActionFeedback(null), 3000);
  };

  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(5, 8, 17, 0.65)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card, borderTopColor: colors.border, borderWidth: 1 }]}>
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />

            {/* Circle Header */}
            <View style={styles.detailHeader}>
              <View style={[styles.circleIcon, { backgroundColor: circle.color === 'gold' ? colors.warmSurface : colors.successSoft }]}>
                <MaterialCommunityIcons name="account-group-outline" size={24} color={tint} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.detailNameRow}>
                  <Text style={[styles.detailName, { color: colors.foreground }]} numberOfLines={1}>
                    {circle.name}
                  </Text>
                  {isCircleAdmin ? (
                    <View style={[styles.adminBadge, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}>
                      <MaterialCommunityIcons name="crown" size={11} color={colors.accentForeground} style={{ marginRight: 2 }} />
                      <Text style={[styles.adminBadgeText, { color: colors.accentForeground }]}>ADMIN</Text>
                    </View>
                  ) : isCoAdmin ? (
                    <View style={[styles.adminBadge, { backgroundColor: colors.coAdminBadgeBg, borderColor: colors.secondary }]}>
                      <MaterialCommunityIcons name="shield-account" size={11} color={colors.secondary} style={{ marginRight: 2 }} />
                      <Text style={[styles.adminBadgeText, { color: colors.secondary }]}>CO-ADMIN</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.circleMeta, { color: colors.mutedForeground }]}>
                  {memberLabel(circle.members)} · KES {circle.contribution.toLocaleString()} every {frequencyNoun(circle.frequency)}
                </Text>
              </View>
            </View>

            {/* Financial Goal Stats */}
            <View style={styles.detailStats}>
              <View style={[styles.detailStat, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.detailStatLabel, { color: colors.mutedForeground }]}>CASH THIS GROUP HOLDS</Text>
                <Text style={[styles.detailStatValue, { color: colors.foreground }]}>KES {current.toLocaleString()}</Text>
              </View>
              <View style={{ width: 10 }} />
              <View style={[styles.detailStat, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.detailStatLabel, { color: colors.mutedForeground }]}>GROUP TARGET</Text>
                <Text style={[styles.detailStatValue, { color: colors.foreground }]}>KES {circle.target.toLocaleString()}</Text>
              </View>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.muted, marginTop: 16 }]}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: tint }]} />
            </View>
            <Text style={[styles.detailProgressCopy, { color: colors.mutedForeground }]}>
              {circle.target > 0
                ? `${Math.round(progress * 100)}% of the ${kesLabel(circle.target)} goal, counting what the group has spent`
                : 'No group goal is recorded, so there is nothing to measure this against.'}
            </Text>

            {/* Goal Pace */}
            <View style={[styles.paceCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <MaterialCommunityIcons name={remaining === 0 ? 'trophy-outline' : 'speedometer-medium'} size={19} color={tint} />
              <Text style={[styles.paceText, { color: colors.foreground }]}>
                {circle.target <= 0
                  ? 'No group goal is recorded, so there is nothing to pace against yet.'
                  : remaining === 0
                    ? 'Goal reached. Every member has put in the work.'
                    : perCycle <= 0
                      ? `KES ${remaining.toLocaleString()} to go, and no cycle amount is agreed yet — set what each member pays and this becomes a pace.`
                      : `KES ${remaining.toLocaleString()} to go — about ${cyclePhrase(cyclesToGoal, circle.frequency)} if all ${memberLabel(circle.members)} pay their KES ${circle.contribution.toLocaleString()}.`}
              </Text>
            </View>

            {/* Governance & Capacity Banner */}
            <View style={[styles.governanceCard, { backgroundColor: colors.background, borderColor: isCircleAdmin ? colors.goldBorder : colors.border }]}>
              <View style={styles.governanceHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="shield-check-outline" size={18} color={isCircleAdmin ? colors.accent : colors.primary} />
                  <Text style={[styles.governanceTitle, { color: colors.foreground }]}>GOVERNANCE & LEADERSHIP</Text>
                </View>
                <View style={styles.capacityPill}>
                  <Text style={[styles.capacityPillText, { color: colors.primary }]}>
                    {memberLabel(circle.members).toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.governanceGrid}>
                <View style={[styles.govStatItem, { borderColor: colors.border }]}>
                  <Text style={[styles.govStatLabel, { color: colors.mutedForeground }]}>ADMIN</Text>
                  <Text style={[styles.govStatValue, { color: colors.foreground }]} numberOfLines={1}>
                    {circleAdminName}
                  </Text>
                  <Text style={[styles.govStatSub, { color: colors.mutedForeground }]}>
                    Opened this group · {memberLabel(circle.members)}
                  </Text>
                </View>
                <View style={[styles.govStatItem, { borderColor: colors.border }]}>
                  <Text style={[styles.govStatLabel, { color: colors.mutedForeground }]}>LOAN APPROVALS</Text>
                  <Text style={[styles.govStatValue, { color: isCircleAdmin ? colors.accent : colors.primary }]}>
                    {pendingLoans.length === 0 ? 'None waiting' : `${pendingLoans.length} waiting`}
                  </Text>
                  <Text style={[styles.govStatSub, { color: colors.mutedForeground }]}>
                    {isCircleAdmin ? 'You decide on them' : 'The admin decides'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.governanceNotice, { color: colors.inkSoft }]}>
                {isCircleAdmin
                  ? 'You opened this group, so its ledger entries and loan approvals are yours to manage.'
                  : isCoAdmin
                  ? 'As Co-Admin, you help with the ledger and loan approvals.'
                  : 'The member who opened this group runs its ledger and loan approvals.'}
              </Text>
            </View>

            {/* Action Feedback Banner */}
            {approvalFeedback ? (
              <View
                style={[
                  styles.feedbackBanner,
                  approvalFeedback.failed
                    ? { backgroundColor: colors.destructiveSoft, borderColor: colors.destructive }
                    : { backgroundColor: colors.successSoft, borderColor: colors.success },
                ]}
              >
                <Feather
                  name={approvalFeedback.failed ? 'alert-circle' : 'check-circle'}
                  size={14}
                  color={approvalFeedback.failed ? colors.destructive : colors.success}
                />
                <Text style={[styles.feedbackText, { color: approvalFeedback.failed ? colors.destructive : colors.success }]}>
                  {approvalFeedback.message}
                </Text>
              </View>
            ) : null}
            {memberActionFeedback ? (
              <View style={[styles.feedbackBanner, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
                <Feather name="check-circle" size={14} color={colors.success} />
                <Text style={[styles.feedbackText, { color: colors.success }]}>{memberActionFeedback}</Text>
              </View>
            ) : null}

            {/* Pending Loan Approvals Section (Admin & Co-Admin only) */}
            {hasAdminRights && pendingLoans.length > 0 ? (
              <View style={styles.approvalsSection}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={17} color={colors.accent} />
                    <Text style={[styles.inputLabel, { color: colors.accent, marginTop: 0 }]}>
                      Pending Loan Approvals ({pendingLoans.length})
                    </Text>
                  </View>
                  <Text style={[styles.subBadgeText, { color: colors.mutedForeground }]}>Admin Action Required</Text>
                </View>
                {pendingLoans.map((loan) => (
                  <View key={loan.id} style={[styles.approvalCard, { backgroundColor: colors.background, borderColor: colors.goldBorder }]}>
                    <View style={styles.approvalTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.approvalBorrower, { color: colors.foreground }]}>{loan.purpose}</Text>
                        <Text style={[styles.approvalMeta, { color: colors.mutedForeground }]}>
                          Requested: KES {loan.principal.toLocaleString()} · {interestLabel(loan.interestRate, loan.interestPeriod)} · Repay: KES {loan.monthlyRepayment.toLocaleString()}/mo
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Approve ${loan.purpose}`}
                        accessibilityState={{ disabled: approvingLoanId !== null }}
                        onPress={() => handleApproveLoan(loan.id)}
                        style={({ pressed }) => [
                          styles.approveButton,
                          { backgroundColor: colors.primary, opacity: approvingLoanId === loan.id ? 0.6 : pressed ? 0.8 : 1 },
                        ]}
                      >
                        <Feather name={approvingLoanId === loan.id ? 'clock' : 'check'} size={14} color={colors.primaryForeground} />
                        <Text style={[styles.approveButtonText, { color: colors.primaryForeground }]}>
                          {approvingLoanId === loan.id ? 'Approving' : 'Approve'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Circle Members Section */}
            <View style={styles.membersSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft, marginTop: 0 }]}>
                  Circle Members ({membersList.length})
                </Text>
                {isCircleAdmin && onAddMember ? (
                  <Pressable
                    onPress={() => setAddMemberVisible(true)}
                    style={({ pressed }) => [
                      styles.addMemberBtn,
                      { backgroundColor: colors.successSoft, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    <Feather name="user-plus" size={13} color={colors.primary} />
                    <Text style={[styles.addMemberBtnText, { color: colors.primary }]}>+ Add Member</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Members List */}
              {membersList.length === 0 ? (
                <Text style={[styles.membersEmpty, { color: colors.mutedForeground }]}>
                  No members saved for this group yet. Everyone you record in the ledger will appear here.
                </Text>
              ) : null}
              {membersList.map((m) => {
                const isAdminMember = m.role === 'admin';
                const isCoAdminMember = m.role === 'co-admin';
                const initials = m.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                return (
                  <View key={m.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                    <View
                      style={[
                        styles.memberAvatar,
                        {
                          backgroundColor: isAdminMember ? colors.goldSoft : isCoAdminMember ? colors.coAdminBadgeBg : colors.muted,
                          borderColor: isAdminMember ? colors.gold : isCoAdminMember ? colors.secondary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.memberAvatarText,
                          { color: isAdminMember ? colors.accentForeground : isCoAdminMember ? colors.secondary : colors.foreground },
                        ]}
                      >
                        {initials}
                      </Text>
                    </View>

                    <View style={styles.memberMain}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                          {m.name}
                        </Text>
                        {isAdminMember ? (
                          <View style={[styles.roleBadge, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}>
                            <MaterialCommunityIcons name="crown" size={10} color={colors.accentForeground} style={{ marginRight: 2 }} />
                            <Text style={[styles.roleBadgeText, { color: colors.accentForeground }]}>ADMIN</Text>
                          </View>
                        ) : isCoAdminMember ? (
                          <View style={[styles.roleBadge, { backgroundColor: colors.coAdminBadgeBg, borderColor: colors.secondary }]}>
                            <MaterialCommunityIcons name="shield-account" size={10} color={colors.secondary} style={{ marginRight: 2 }} />
                            <Text style={[styles.roleBadgeText, { color: colors.secondary }]}>CO-ADMIN</Text>
                          </View>
                        ) : (
                          <View style={[styles.roleBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                            <Text style={[styles.roleBadgeText, { color: colors.mutedForeground }]}>MEMBER</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.memberMeta, { color: colors.mutedForeground }]}>
                        {m.phone ? `${m.phone} · ` : ''}
                        {m.joinedDate ? `Joined ${m.joinedDate} · ` : ''}
                        Contributed KES {m.totalContributed.toLocaleString()}
                      </Text>
                    </View>

                    {/* Admin Delegation Actions */}
                    {isCircleAdmin && !isAdminMember && onAssignCoAdmin && onRemoveCoAdmin ? (
                      <View style={styles.adminActionWrap}>
                        {isCoAdminMember ? (
                          <Pressable
                            onPress={() => handleRemoveCoAdmin(m.id)}
                            style={({ pressed }) => [
                              styles.coAdminToggleBtn,
                              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                            ]}
                          >
                            <Text style={[styles.coAdminToggleText, { color: colors.destructive }]}>Dismiss</Text>
                          </Pressable>
                        ) : coAdminsCount < 2 ? (
                          <Pressable
                            onPress={() => handleMakeCoAdmin(m.id)}
                            style={({ pressed }) => [
                              styles.coAdminToggleBtn,
                              { borderColor: colors.secondary, backgroundColor: colors.coAdminBadgeBg, opacity: pressed ? 0.7 : 1 },
                            ]}
                          >
                            <Text style={[styles.coAdminToggleText, { color: colors.secondary }]}>+ Co-Admin</Text>
                          </Pressable>
                        ) : (
                          <Text style={[styles.coAdminLimitNotice, { color: colors.mutedForeground }]}>Max 3 admins</Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* Group Rules */}
            <Text style={[styles.inputLabel, { color: colors.inkSoft, marginTop: 24 }]}>Group rules</Text>
            <View style={styles.detailStats}>
              <View style={[styles.detailStat, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.detailStatLabel, { color: colors.mutedForeground }]}>JOINING</Text>
                <Text style={[styles.detailStatValue, { color: colors.foreground }]}>
                  {circle.joiningFee > 0 ? `KES ${circle.joiningFee.toLocaleString()}` : '—'}
                </Text>
              </View>
              <View style={{ width: 10 }} />
              <View style={[styles.detailStat, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.detailStatLabel, { color: colors.mutedForeground }]}>WELFARE</Text>
                <Text style={[styles.detailStatValue, { color: colors.foreground }]}>
                  {circle.welfare > 0 ? `KES ${circle.welfare.toLocaleString()}` : '—'}
                </Text>
              </View>
              <View style={{ width: 10 }} />
              <View style={[styles.detailStat, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.detailStatLabel, { color: colors.mutedForeground }]}>LOAN INT.</Text>
                <Text style={[styles.detailStatValue, { color: colors.foreground }]}>{interestLabel(circle.loanInterestPercent, circle.loanInterestPeriod)}</Text>
              </View>
            </View>

            {/* Invite Members */}
            <Text style={[styles.inputLabel, { color: colors.inkSoft, marginTop: 24 }]}>Invite members</Text>
            <Pressable
              onPress={shareInvite}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.inviteRow,
                { borderColor: colors.border, backgroundColor: colors.warmSurface, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Feather name="share-2" size={16} color={colors.accentForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.inviteTitle, { color: colors.foreground }]}>Share this group</Text>
                <Text style={[styles.inviteCopy, { color: colors.mutedForeground }]}>
                  {invite ? invite.result : 'Send the group name, amount and target to a friend.'}
                </Text>
              </View>
            </Pressable>

            {/* Recent Contributions */}
            <Text style={[styles.inputLabel, { color: colors.inkSoft, marginTop: 24 }]}>Recent ledger entries</Text>
            {saved.length > 0 ? (
              saved.slice(0, 5).map((item) => {
                const tone = ledgerTone(colors, item.type ?? 'Contribution');
                return (
                  <View key={item.id} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.detailRowNote, { color: colors.foreground }]}>{item.note}</Text>
                      <Text style={[styles.detailRowDate, { color: colors.mutedForeground }]}>
                        {[item.date, item.type ?? 'Contribution', item.member].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={[styles.detailRowAmount, { color: tone.tint }]}>
                      {`${tone.sign} KES ${item.amount.toLocaleString()}`.trimStart()}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.detailEmpty, { color: colors.mutedForeground }]}>
                No contributions recorded in this circle yet. Be the first to give it momentum.
              </Text>
            )}

            {/* Modal Bottom Actions */}
            <View style={styles.modalActions}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.cancelButton,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.cancelText, { color: colors.inkSoft }]}>Close</Text>
              </Pressable>
              <View style={styles.saveButton}>
                <PrimaryButton label="Contribute" icon="plus" onPress={() => onContribute?.(circle.id)} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Add Member Sub-Modal */}
      <Modal visible={addMemberVisible} transparent animationType={sheet.animationType} onRequestClose={() => setAddMemberVisible(false)}>
        <View style={[sheet.shade, { backgroundColor: 'rgba(5, 8, 17, 0.70)' }]}>
          <View style={[sheet.card, { backgroundColor: colors.card }]}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[styles.modalEyebrow, { color: colors.primary }]}>CIRCLE MEMBERSHIP</Text>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Circle Member</Text>
            <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
              Each circle can have a maximum of 100 members. Currently {membersList.length}/100.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Full Name</Text>
            <TextInput
              value={newMemberName}
              onChangeText={setNewMemberName}
              placeholder="e.g. Mary Wanjiku"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.textInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
            />

            <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Phone Number (Optional)</Text>
            <TextInput
              value={newMemberPhone}
              onChangeText={setNewMemberPhone}
              keyboardType="phone-pad"
              placeholder="e.g. +254 712 345 678"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.textInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setAddMemberVisible(false)}
                style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.cancelText, { color: colors.inkSoft }]}>Cancel</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Add to Circle" icon="check" onPress={handleAddMemberSubmit} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// The bell badge and the sheet it opens must count the same rows, so both read
// from this one derivation: no pending item, no badge.
export function notificationItems(contributions: Contribution[], loans: Loan[], circles: Circle[]) {
  const list: { id: string; icon: keyof typeof Feather.glyphMap; title: string; copy: string; date: string }[] = [];
  for (const loan of loans) {
    if (loan.status === 'Active') {
      list.push({ id: `loan-${loan.id}`, icon: 'credit-card', title: 'Loan update', copy: `KES ${loan.balance.toLocaleString()} remaining on your "${loan.purpose}" loan.`, date: `Due ${loan.dueDate}` });
    } else if (loan.status === 'Pending') {
      list.push({ id: `loan-${loan.id}`, icon: 'clock', title: 'Loan application', copy: `Your "${loan.purpose}" loan request is under review.`, date: `Due ${loan.dueDate}` });
    } else {
      list.push({ id: `loan-${loan.id}`, icon: 'check-circle', title: 'Loan paid off', copy: `Your "${loan.purpose}" loan is fully repaid. Well done!`, date: `Due ${loan.dueDate}` });
    }
  }
  for (const item of contributions.slice(0, 4)) {
    const circle = circles.find((entry) => entry.id === item.circleId);
    const kind = item.type ?? 'Contribution';
    const verb = isOutflow(kind) ? 'paid out of' : isSetAside(kind) ? 'set aside from' : 'saved to';
    const icon = isOutflow(kind) ? 'trending-down' : isSetAside(kind) ? 'bookmark' : 'trending-up';
    list.push({ id: `contribution-${item.id}`, icon, title: `${kind} recorded`, copy: `KES ${item.amount.toLocaleString()} ${verb} ${circle?.name ?? 'your circle'}${item.member ? ` · ${item.member}` : ''}${item.status === 'Pending' ? ' · pending confirmation' : ''}.`, date: item.date });
  }
  return list;
}

export function NotificationsModal({ visible, onClose, contributions, loans, circles }: { visible: boolean; onClose: () => void; contributions: Contribution[]; loans: Loan[]; circles: Circle[] }) {
  const colors = useColors();
  const sheet = useSheet();
  const items = React.useMemo(() => notificationItems(contributions, loans, circles), [contributions, loans, circles]);
  const ledgerShown = Math.min(4, contributions.length);
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[styles.modalEyebrow, { color: colors.primary }]}>TURIWA</Text>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Notifications</Text>
            <Text testID="notifications-hint" style={[styles.modalHint, { color: colors.mutedForeground }]}>{items.length === 0 ? 'The latest from your circles and loans.' : `${items.length} ${items.length === 1 ? 'item' : 'items'}: ${loans.length} ${loans.length === 1 ? 'loan' : 'loans'} and your ${ledgerShown} latest ${ledgerShown === 1 ? 'ledger entry' : 'ledger entries'}.`}</Text>
            {items.length > 0 ? items.map((item) => (
              <View key={item.id} testID={`notification-row-${item.id}`} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.activityIcon, { backgroundColor: colors.successSoft }]}><Feather name={item.icon} size={16} color={colors.primary} /></View>
                <View style={{ flex: 1 }}><Text style={[styles.detailRowNote, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.detailRowDate, { color: colors.mutedForeground }]}>{item.copy}</Text></View>
                <Text style={[styles.detailRowDate, { color: colors.mutedForeground }]}>{item.date}</Text>
              </View>
            )) : (
              <View testID="notifications-empty" style={[styles.detailEmptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}><Feather name="check-circle" size={22} color={colors.success} /><Text style={[styles.detailEmptyTitle, { color: colors.foreground }]}>All caught up</Text><Text style={[styles.detailEmpty, { color: colors.mutedForeground }]}>Nothing new right now — your contributions and loans will show up here.</Text></View>
            )}
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}><PrimaryButton label="Done" icon="check" onPress={onClose} /></View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25 },
  // Long names (e.g. "Good morning, <name>") must wrap inside the column rather than run under the bell.
  headerCopy: { flex: 1, paddingRight: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2.2, marginBottom: 8 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.8 },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 7 },
  iconButton: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  notificationBadge: { position: 'absolute', right: 3, top: 3, minWidth: 17, height: 17, borderRadius: 9, borderWidth: 1.5, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  notificationBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11, lineHeight: 13 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 13 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, letterSpacing: -0.2 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  amountContainer: { flexDirection: 'row', alignItems: 'baseline' },
  currencyTag: { fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4, opacity: 0.8 },
  amountValue: { fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  primaryButtonOuter: { overflow: 'hidden' },
  primaryButtonGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { fontFamily: 'Inter_600SemiBold' },
  statPill: { borderRadius: 18, borderWidth: 1, padding: 13, flex: 1, flexDirection: 'row', gap: 11, alignItems: 'center' },
  statPillIconBox: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statPillCopy: { flex: 1 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, marginBottom: 3 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 14.5, letterSpacing: -0.2 },
  circleCard: { borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 13, marginBottom: 11 },
  circleIcon: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  circleMain: { flex: 1 },
  circleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  circleName: { fontFamily: 'Inter_600SemiBold', fontSize: 15.5, letterSpacing: -0.2, flex: 1, marginRight: 6 },
  circleMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4, lineHeight: 16 },
  progressTrack: { height: 6, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  circleBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  progressAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, letterSpacing: -0.2 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  activityIcon: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  activityCopy: { flex: 1 },
  activityNote: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5 },
  activityDate: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  activityAmount: { alignItems: 'flex-end' },
  amountText: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: -0.2 },
  activityStatusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.3 },
  modalShade: { flex: 1, justifyContent: 'flex-end' },
  modalShadeDialog: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 11, maxHeight: '92%' },
  modalCardDialog: { borderRadius: 26, paddingHorizontal: 26, width: '100%', maxWidth: 620, maxHeight: '86%' },
  // Sized by its content, but shrinks back inside a tall sheet so it scrolls.
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  modalHandle: { width: 38, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 22 },
  hidden: { display: 'none' },
  modalEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.7, marginBottom: 9 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 20 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 8, marginTop: 10 },
  inputWrap: { borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 56 },
  currencyPrefix: { fontFamily: 'Inter_700Bold', fontSize: 14, marginRight: 12 },
  amountInput: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 22 },
  textInput: { borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 },
  saveError: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 23, alignItems: 'center' },
  cancelButton: { height: 49, paddingHorizontal: 17, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  saveButton: { flex: 1 },
  circlePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amountChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  amountChip: { borderWidth: 1, borderRadius: 11, minWidth: 62, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  amountChipText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  circleChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  circleChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  ledgerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ledgerClose: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // A recessed track with the chosen kind lifted onto the card surface, so the
  // active cell reads as selected without relying on colour alone.
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 6, borderRadius: 18, marginTop: 20 },
  typeCell: { flexGrow: 1, flexBasis: '47%', minHeight: 50, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  ledgerHint: { fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 17, marginTop: 9 },
  ledgerLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4, marginTop: 20, marginBottom: 9 },
  memberField: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, minHeight: 52, paddingHorizontal: 14 },
  memberValue: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 14 },
  memberList: { borderWidth: 1, borderRadius: 14, marginTop: 8 },
  memberScroll: { maxHeight: 208 },
  memberOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, minHeight: 56, borderBottomWidth: 1 },
  memberOptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5 },
  memberOptionMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  commitButton: { minHeight: 56, borderRadius: 28, marginTop: 26, alignItems: 'center', justifyContent: 'center' },
  commitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commitText: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.9 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 17 },
  detailNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailName: { fontFamily: 'Inter_700Bold', fontSize: 19, letterSpacing: -0.4, flex: 1 },
  adminBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  adminBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 8.5, letterSpacing: 0.9 },
  detailAdminCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 10 },
  detailStats: { flexDirection: 'row' },
  detailStat: { flex: 1, borderWidth: 1, borderRadius: 15, padding: 13 },
  detailStatLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3 },
  detailStatValue: { fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: -0.4, marginTop: 6 },
  detailProgressCopy: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 7 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  detailRowNote: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  detailRowDate: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4, lineHeight: 14 },
  detailRowAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  detailEmpty: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 4 },
  detailEmptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 9 },
  detailEmptyCard: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 4 },
  paceCard: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 14 },
  paceText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  inviteRow: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 13 },
  inviteTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  inviteCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  // Governance & Members styling
  governanceCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 16 },
  governanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  governanceTitle: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  capacityPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  capacityPillText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6 },
  governanceGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  govStatItem: { flex: 1, borderWidth: 1, borderRadius: 13, padding: 11 },
  govStatLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  govStatValue: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 4 },
  govStatSub: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  governanceNotice: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  feedbackBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 14 },
  feedbackText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  approvalsSection: { marginTop: 22 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  subBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  approvalCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  approvalTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  approvalBorrower: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  approvalMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4, lineHeight: 16 },
  approveButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 },
  approveButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  membersSection: { marginTop: 22 },
  addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  addMemberBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  memberAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  memberAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  memberMain: { flex: 1 },
  memberName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, maxWidth: 140 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 8.5, letterSpacing: 0.8 },
  memberMeta: { fontFamily: 'Inter_400Regular', fontSize: 10.5, marginTop: 4 },
  adminActionWrap: { alignItems: 'flex-end', justifyContent: 'center' },
  coAdminToggleBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  coAdminToggleText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  coAdminLimitNotice: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  membersEmpty: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 19, paddingHorizontal: 2, paddingVertical: 14 },
});
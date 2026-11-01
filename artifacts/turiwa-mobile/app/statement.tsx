import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useTuriwa } from '@/context/TuriwaContext';
import type { Contribution } from '@/lib/api';
import { currentMonthKey, entryDate, isLentOut, isOverdue, isOutflow, isSetAside, kesLabel, memberLabel, plannedPerMonth, recentMonthKeys } from '@/lib/api';
import { ALL_PERIODS, buildStatement, csvFileName, goalEstimate, ledgerCsv, loanTie, monthlySummary, periodLabel, saveCsv, statementCsv, type Period } from '@/lib/statement';
import { BrandHeader, PrimaryButton, Screen, SectionHeading, styles as uiStyles, useSheet } from '@/components/TuriwaUI';
import { AppChrome, useSubScreenBack } from '@/components/AppNav';

/**
 * Both statements a member and a treasurer ask for, drawn from the same rows the app
 * already shows. Nothing here is estimated: a figure appears because the ledger holds
 * rows that add up to it, and rows that do not tie are named rather than smoothed over.
 * Export is on every screen and asks for nothing, because a member's own records are
 * not a paid feature.
 */
export default function StatementScreen() {
  const colors = useColors();
  const layout = useResponsive();
  const onBack = useSubScreenBack();
  const { contributions, circles, loans, finance, activeCircleId, profileName } = useTuriwa();
  const [who, setWho] = useState<'mine' | 'group'>('mine');
  const [period, setPeriod] = useState<Period>(currentMonthKey());
  const [circleId, setCircleId] = useState<string>('All');
  const [reportOpen, setReportOpen] = useState(false);
  // The group statement opens on the circle the person is working in. 'All groups' stays
  // a choice, but it should not be the view that follows someone quietly into a circle
  // they have just switched away from.
  useEffect(() => {
    if (activeCircleId) setCircleId(activeCircleId);
  }, [activeCircleId]);

  // Newest first, plus the whole history: a period with no rows still shows as a
  // period, and the report says it found nothing rather than hiding the month.
  const periods = useMemo(() => [...recentMonthKeys(12).reverse(), ALL_PERIODS], []);
  const known = useMemo(() => new Set(circles.map((circle) => circle.id)), [circles]);
  const circleName = (id: string) => circles.find((circle) => circle.id === id)?.name ?? 'Unassigned';
  const scopeRows = (items: Contribution[]) =>
    items.filter((item) => {
      if (who === 'group' && circleId !== 'All' && item.circleId !== circleId) return false;
      if (who === 'mine') {
        const named = (item.member ?? '').trim().toLowerCase();
        const me = profileName.trim().toLowerCase();
        // Rows with no member named were recorded by this account and never
        // attributed, so they belong to this account's own statement.
        return named === '' || named === me;
      }
      return true;
    });
  const statement = useMemo(
    () => buildStatement(scopeRows(contributions), period),
    [contributions, circleId, period, profileName, who],
  );
  const groupName = who === 'mine' ? `${profileName || 'This account'} — personal` : circleId === 'All' ? 'All groups on this account' : circleName(circleId);
  const scopedCircles = who === 'group' && circleId !== 'All' ? circles.filter((circle) => circle.id === circleId) : circles;
  const planned = scopedCircles.reduce((sum, circle) => sum + plannedPerMonth(circle), 0);
  const loansInScope = who === 'group' && circleId !== 'All' ? loans.filter((loan) => loan.circleId === circleId) : loans;
  const summary = monthlySummary(statement, {
    planned: who === 'mine' ? 0 : planned,
    overdue: loansInScope.filter((loan) => isOverdue(loan)),
    requests: loansInScope.filter((loan) => loan.status === 'Pending'),
    unlinked: loansInScope.filter((loan) => !loan.circleId || !known.has(loan.circleId)),
    gaps: loansInScope.reduce((sum, loan) => (loan.status === 'Active' && loan.circleId ? sum + Math.abs(loanTie(loan, finance.returnedFor(loan.id)).difference) : sum), 0),
    unassigned: statement.rows.reduce((sum, item) => (known.has(item.circleId) ? sum : sum + item.amount), 0),
  });
  const rowsToRender = statement.rows.slice(0, 40);
  const exportName = `turiwa-${who === 'mine' ? 'personal' : 'group'}-statement`;

  const exportCsv = () => {
    if (who === 'group') {
      saveCsv(csvFileName(exportName), statementCsv(statement, groupName));
      return;
    }
    saveCsv(
      csvFileName(exportName),
      ledgerCsv(statement.rows, circleName, [
        ['Report', 'Turiwa personal statement'],
        ['Account', profileName || 'This account'],
        ['Period', statement.label],
        ['Rows', statement.rows.length],
        ['Money in (KES)', statement.moneyIn],
        ['Money out (KES)', statement.moneyOut],
      ]),
    );
  };

  return (
    <AppChrome>
    <View style={styles.root}>
      <Screen>
        <BrandHeader
          onBack={onBack}
          title="Statements"
          subtitle="What the ledger holds, added up. Download it whenever you want — your own records are not a paid feature."
        />
        <View style={[styles.tabs, { backgroundColor: colors.muted }]}>
          {(['mine', 'group'] as const).map((item) => (
            <Pressable
              key={item}
              testID={`statement-tab-${item}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: who === item }}
              onPress={() => setWho(item)}
              style={[styles.tab, who === item && { backgroundColor: colors.card }]}
            >
              <Text style={[styles.tabText, { color: who === item ? colors.foreground : colors.mutedForeground }]}>
                {item === 'mine' ? 'My statement' : 'Group statement'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.pickerLabel, { color: colors.inkSoft }]}>PERIOD</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {periods.map((key) => {
            const active = key === period;
            return (
              <Pressable
                key={key}
                testID={`statement-period-${key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setPeriod(key)}
                style={({ pressed }) => [styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.successSoft : colors.card, opacity: pressed ? 0.78 : 1 }]}
              >
                <Text style={[styles.chipText, { color: active ? colors.primary : colors.mutedForeground }]}>{periodLabel(key)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {who === 'group' && circles.length > 1 ? (
          <>
            <Text style={[styles.pickerLabel, { color: colors.inkSoft }]}>GROUP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {['All', ...circles.map((circle) => circle.id)].map((id) => {
                const active = id === circleId;
                return (
                  <Pressable
                    key={id}
                    testID={`statement-circle-${id.toLowerCase()}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setCircleId(id)}
                    style={({ pressed }) => [styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.successSoft : colors.card, opacity: pressed ? 0.78 : 1 }]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.primary : colors.mutedForeground }]}>{id === 'All' ? 'All groups' : circleName(id)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        <SectionHeading title={statement.label} action={statement.rows.length === 0 ? undefined : `${statement.rows.length} ${statement.rows.length === 1 ? 'entry' : 'entries'}`} />
        <View testID="statement-bridge" style={[styles.bridge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <BridgeLine
            testID="statement-opening"
            label={
              who === 'mine'
                ? period === ALL_PERIODS
                  ? 'Entries recorded in your name'
                  : `Recorded in your name before ${statement.label}`
                : period === ALL_PERIODS
                  ? 'Before the first entry'
                  : `Cash before ${statement.label}`
            }
            value={statement.opening}
            tone="plain"
          />
          <BridgeLine label="Contributions received" value={statement.contributions} sign="+" tone="income" />
          <BridgeLine label="Loan repayments received" value={statement.repaid} sign="+" tone="income" />
          <BridgeLine label="Late fines received" value={statement.fines} sign="+" tone="income" />
          <BridgeLine label="Expenses paid" value={statement.expenses} sign="−" tone="expense" />
          <BridgeLine label="Welfare still held back" value={statement.welfare} sign="−" tone="balance" />
          <BridgeLine label="Loan money handed over" value={statement.paidOut} sign="−" tone="balance" />
          <BridgeLine
            label={
              who === 'mine'
                ? period === ALL_PERIODS
                  ? 'Net of every entry in your name'
                  : `Net movement in your name, ${statement.label}`
                : period === ALL_PERIODS
                  ? 'Cash the fund holds'
                  : `Cash at the end of ${statement.label}`
            }
            value={statement.closing}
            tone="total"
          />
        </View>
        {who === 'mine' ? (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            These lines add up the entries recorded in your name. They are not the group’s cash — money a loan handed
            over appears here as an entry against you and leaves the fund on the group’s own statement.
          </Text>
        ) : null}
        {statement.backfilled > 0 ? (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            {statement.backfilled} {statement.backfilled === 1 ? 'entry' : 'entries'} carry the date “On file”: money a loan moved before the
            ledger kept a date for it. The amount is real; the day is not recorded.
          </Text>
        ) : null}

        <SectionHeading title="What the period says" />
        <View style={[styles.summary, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {summary.map((line, index) => (
            <Text key={line} testID={index === 0 ? 'statement-summary-lead' : undefined} style={[styles.summaryLine, { color: colors.foreground }]}>
              {line}
            </Text>
          ))}
        </View>

        {who === 'mine' ? (
          <>
            <SectionHeading title="My loans" />
            {loansInScope.length === 0 ? (
              <Text style={[styles.note, { color: colors.mutedForeground }]}>No loan is recorded against this account, so nothing is owed to or by it.</Text>
            ) : (
              <View style={styles.loanList}>
                {loansInScope.map((loan) => {
                  const tie = loanTie(loan, finance.returnedFor(loan.id));
                  return (
                    <View key={loan.id} testID={`statement-loan-${loan.id}`} style={[styles.loanRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.loanPurpose, { color: colors.foreground }]} numberOfLines={1}>{loan.purpose}</Text>
                      <Text style={[styles.loanMeta, { color: colors.mutedForeground }]}>
                        {loan.status === 'Pending'
                          ? `Requested ${kesLabel(loan.principal)} · waiting for the group's decision`
                          : `${loan.status === 'Paid off' ? 'Cleared' : 'Owed now'} ${kesLabel(loan.balance)} · ${kesLabel(tie.ledgerRepaid)} of repayments recorded${tie.difference === 0 ? '' : ` · ${kesLabel(Math.abs(tie.difference))} not explained by the loan balance`}`}
                      </Text>
                      <Text style={[styles.loanRef, { color: colors.mutedForeground }]}>Reference {loan.id}</Text>
                    </View>
                  );
                })}
              </View>
            )}
            {statement.awaitingConfirmation > 0 ? (
              <Text style={[styles.note, { color: colors.accentForeground }]}>
                {statement.awaitingConfirmation} {statement.awaitingConfirmation === 1 ? 'entry is' : 'entries are'} recorded but not confirmed.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <SectionHeading title="Lending and obligations" />
            <View style={[styles.bridge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <BridgeLine label={circleId === 'All' ? 'Still owed to these groups' : 'Still owed to this circle'} value={loansInScope.filter((loan) => loan.status === 'Active').reduce((sum, loan) => sum + loan.balance, 0)} tone="total" />
              <BridgeLine label="Past their due date" value={loansInScope.filter((loan) => loan.status === 'Active' && isOverdue(loan)).reduce((sum, loan) => sum + loan.balance, 0)} tone="plain" />
              <BridgeLine label="Waiting for a decision" value={loansInScope.filter((loan) => loan.status === 'Pending').reduce((sum, loan) => sum + loan.principal, 0)} tone="plain" />
            </View>
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              {loansInScope.filter((loan) => loan.status === 'Active').length === 0
                ? 'No running loan, so nothing is owed.'
                : `${loansInScope.filter((loan) => loan.status === 'Active').length} running ${loansInScope.filter((loan) => loan.status === 'Active').length === 1 ? 'loan' : 'loans'} in scope. What borrowers owe is a claim on the future, not cash in the fund, so it is never added to the balance above.`}
            </Text>
            {scopedCircles.length > 0 && scopedCircles.length < 4 ? (
              <View style={styles.goalList}>
                {scopedCircles.map((circle) => (
                  <Text key={circle.id} style={[styles.note, { color: colors.mutedForeground }]}>
                    {circle.name}: {kesLabel(finance.savedFor(circle.id))} held of a {kesLabel(circle.target)} goal — {goalEstimate(finance.savedFor(circle.id), circle.target, plannedPerMonth(circle))} {memberLabel(circle.members)} at {kesLabel(circle.contribution)} every cycle.
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}

        <SectionHeading title="Entries" />
        {statement.rows.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="file-text" size={22} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing recorded in this period</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {who === 'mine'
                ? 'No entry in these months is attributed to you. Try a wider period or the group statement.'
                : 'This group has no entry in these months. The balances above are what the earlier records left.'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.rowList}>
              {rowsToRender.map((item) => <EntryRow key={item.id} item={item} circleName={circleName(item.circleId)} />)}
            </View>
            {statement.rows.length > rowsToRender.length ? (
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                Showing the first {rowsToRender.length} of {statement.rows.length} entries. The download carries all of them.
              </Text>
            ) : null}
          </>
        )}

        <View style={[styles.actions, layout.isPhone && styles.actionsStack]}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Download this statement" icon="download" onPress={exportCsv} />
          </View>
          <Pressable
            testID="statement-discrepancy"
            accessibilityRole="button"
            onPress={() => {
              Haptics.selectionAsync();
              setReportOpen(true);
            }}
            style={({ pressed }) => [styles.reportButton, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="alert-circle" size={15} color={colors.foreground} />
            <Text style={[styles.reportText, { color: colors.foreground }]}>Report a discrepancy</Text>
          </Pressable>
        </View>
        <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
          Every figure above is a sum of these rows. If one of them is wrong, the report below carries its reference so the
          treasurer can find the exact entry.
        </Text>
      </Screen>
      <DiscrepancySheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        groupName={groupName}
        period={statement.label}
        rows={statement.rows}
      />
    </View>
    </AppChrome>
  );
}

function BridgeLine({ label, value, sign = '', tone, testID }: { label: string; value: number; sign?: '+' | '−' | ''; tone: 'income' | 'expense' | 'balance' | 'plain' | 'total'; testID?: string }) {
  const colors = useColors();
  const tint = tone === 'income' ? colors.income : tone === 'expense' ? colors.expense : tone === 'balance' ? colors.balance : colors.foreground;
  return (
    <View testID={testID} style={[styles.bridgeRow, tone === 'total' && { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 10 }]}>
      <Text style={[styles.bridgeLabel, { color: tone === 'total' ? colors.foreground : colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.bridgeValue, { color: tone === 'total' ? colors.foreground : tint }]}>
        {sign}
        {kesLabel(value)}
      </Text>
    </View>
  );
}

function EntryRow({ item, circleName }: { item: Contribution; circleName: string }) {
  const colors = useColors();
  const type = item.type ?? 'Contribution';
  const out = isOutflow(type) || isLentOut(type) || isSetAside(type);
  const tint = isOutflow(type) ? colors.expense : isSetAside(type) || isLentOut(type) ? colors.balance : colors.income;
  return (
    <View style={[styles.entryRow, { borderBottomColor: colors.border }]}>
      <View style={styles.entryMain}>
        <Text style={[styles.entryNote, { color: colors.foreground }]} numberOfLines={1}>{item.note}</Text>
        <Text style={[styles.entryMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {entryDate(item)} · {circleName} · {item.member?.trim() ? item.member : 'No member named'} · {type}
        </Text>
        <Text style={[styles.entryRef, { color: colors.mutedForeground }]} numberOfLines={1}>Ref {item.id}</Text>
      </View>
      <Text style={[styles.entryAmount, { color: tint }]}>{out ? '−' : '+'} {kesLabel(item.amount).replace('KES ', '')}</Text>
    </View>
  );
}

/**
 * The report a member sends when a number looks wrong. It carries the references of
 * the entries in the period, because "the balance is off" is not something a treasurer
 * can act on, and it asks for nothing but the words.
 */
function DiscrepancySheet({ visible, onClose, groupName, period, rows }: { visible: boolean; onClose: () => void; groupName: string; period: string; rows: Contribution[] }) {
  const colors = useColors();
  const sheet = useSheet();
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState('');
  const lines = [
    'Turiwa — discrepancy report',
    `Records: ${groupName}`,
    `Period: ${period}`,
    `Prepared: ${new Date().toISOString().slice(0, 10)}`,
    rows.length === 0
      ? 'Entries in this period: none recorded.'
      : `Entries in this period (${rows.length}):\n${rows.slice(0, 25).map((item) => `· ${item.id} — ${entryDate(item)}, ${kesLabel(item.amount)}, ${item.type ?? 'Contribution'}, ${item.note}`).join('\n')}`,
    note.trim() ? `What looks wrong: ${note.trim()}` : 'What looks wrong: (not written yet)',
  ].join('\n\n');

  const send = async () => {
    try {
      await Share.share({ title: 'Turiwa discrepancy report', message: lines });
      setFeedback('The report is ready to send. Paste it to whoever keeps the group’s records.');
    } catch {
      // A browser without the share API, or a device where it was dismissed: the whole
      // report is on screen above, and on the web that text is selectable, so the
      // member can still take it with them.
      setFeedback('Sharing is not available here. The report above is selectable — copy it and send it to the treasurer.');
    }
    setTimeout(() => setFeedback(''), 8000);
  };

  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={sheet.handle} />
            <Text style={[styles.sheetEyebrow, { color: colors.primary }]}>DISCREPANCY REPORT</Text>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Something looks wrong</Text>
            <Text style={[styles.sheetHint, { color: colors.mutedForeground }]}>
              Say what you expected and what the ledger shows. The entry references go with it, so the person keeping the
              records can find the exact row.
            </Text>
            <TextInput
              testID="discrepancy-note"
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="e.g. I paid KES 2,000 on 4 Oct but only 1,000 is listed"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="What looks wrong"
              style={[styles.sheetInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
            />
            <View style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text selectable style={[styles.previewText, { color: colors.mutedForeground }]}>{lines}</Text>
            </View>
            {feedback ? <Text style={[styles.feedback, { color: colors.primary }]} accessibilityLiveRegion="polite">{feedback}</Text> : null}
            <View style={styles.sheetActions}>
              <Pressable onPress={onClose} style={[styles.sheetCancel, { borderColor: colors.border }]}>
                <Text style={[styles.sheetCancelText, { color: colors.inkSoft }]}>Close</Text>
              </Pressable>
              <View style={{ flex: 1 }}><PrimaryButton label="Prepare report" icon="arrow-right" onPress={send} /></View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: 'row', borderRadius: 13, padding: 4, marginTop: 18 },
  tab: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  pickerLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4, marginTop: 18, marginBottom: 8 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  bridge: { borderWidth: 1, borderRadius: 18, padding: 16 },
  bridgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 5 },
  bridgeLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, flexShrink: 1 },
  bridgeValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, fontVariant: ['tabular-nums'], flexShrink: 0 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 17, marginTop: 10 },
  summary: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 9 },
  summaryLine: { fontFamily: 'Inter_500Medium', fontSize: 12.5, lineHeight: 19 },
  loanList: { gap: 10 },
  loanRow: { borderWidth: 1, borderRadius: 16, padding: 14 },
  loanPurpose: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5 },
  loanMeta: { fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  loanRef: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 7, letterSpacing: 0.3 },
  goalList: { gap: 4, marginTop: 6 },
  rowList: { marginTop: 4 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, paddingVertical: 12 },
  entryMain: { flex: 1 },
  entryNote: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  entryMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  entryRef: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 3, letterSpacing: 0.4 },
  entryAmount: { fontFamily: 'Inter_700Bold', fontSize: 13, fontVariant: ['tabular-nums'] },
  empty: { borderWidth: 1, borderRadius: 18, padding: 22, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  actionsStack: { flexDirection: 'column' },
  reportButton: { flex: 0.62, minWidth: 190, minHeight: 49, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  reportText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  footnote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 14 },
  sheetEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.7, marginBottom: 9 },
  sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.5 },
  sheetHint: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 19, marginTop: 7 },
  sheetInput: { borderWidth: 1, minHeight: 92, borderRadius: 14, padding: 13, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 16, textAlignVertical: 'top' },
  preview: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  previewText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  feedback: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, marginTop: 12 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' },
  sheetCancel: { height: 49, paddingHorizontal: 17, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  sheetCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});

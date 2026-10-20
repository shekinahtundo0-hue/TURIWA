import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useTuriwa } from '@/context/TuriwaContext';
import { ActivityRow, BrandHeader, HeaderIconButton, RecordTransactionModal, Screen, SectionHeading } from '@/components/TuriwaUI';
import { entryDelta, isLentOut, isOutflow, isSetAside, type Contribution } from '@/lib/api';
import { csvFileName, ledgerCsv, saveCsv } from '@/lib/statement';

type Tone = 'income' | 'expense' | 'balance';

export default function ActivityScreen() {
  const colors = useColors();
  const layout = useResponsive();
  const insets = useSafeAreaInsets();
  const { contributions, circles, addContribution, refresh, refreshing } = useTuriwa();
  const [filter, setFilter] = useState<'All' | 'Complete' | 'Pending'>('All');
  const [circleFilter, setCircleFilter] = useState<'All' | string>('All');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const circleName = (id: string) => circles.find((item) => item.id === id)?.name ?? 'Unassigned';
  const filtered = useMemo(
    () =>
      contributions.filter((item) => {
        if (filter !== 'All' && item.status !== filter) return false;
        if (circleFilter !== 'All' && item.circleId !== circleFilter) return false;
        if (needle && !`${item.note} ${item.type} ${item.member ?? ''} ${circleName(item.circleId)}`.toLowerCase().includes(needle)) return false;
        return true;
      }),
    [contributions, circles, filter, circleFilter, needle],
  );
  // Every card below is a sum of `filtered`, so the figures describe the list on
  // screen rather than the whole fund. Money in is what the rows paid in; money out
  // is split three ways, because a spent shilling, a shilling held for welfare and a
  // shilling handed over as a loan are three different facts.
  const kind = (item: Contribution) => item.type ?? 'Contribution';
  const sum = (test: (item: Contribution) => boolean) =>
    filtered.reduce((total, item) => total + (test(item) ? item.amount : 0), 0);
  const moneyIn = sum((item) => entryDelta(kind(item)) > 0);
  const spent = sum((item) => isOutflow(kind(item)));
  const setAside = sum((item) => isSetAside(kind(item)));
  const lentOut = sum((item) => isLentOut(kind(item)));
  const moneyOut = spent + setAside + lentOut;
  const net = moneyIn - moneyOut;
  const inCount = filtered.filter((item) => entryDelta(kind(item)) > 0).length;
  const outCount = filtered.length - inCount;
  const filtering = filter !== 'All' || circleFilter !== 'All' || needle.length > 0;
  // Only the choices the ledger actually holds. A "Pending" chip that can never match
  // a row teaches a member that the app has filters it does not mean.
  const statuses: ('All' | 'Complete' | 'Pending')[] = [
    'All',
    ...(contributions.some((item) => item.status === 'Complete') ? (['Complete'] as const) : []),
    ...(contributions.some((item) => item.status === 'Pending') ? (['Pending'] as const) : []),
  ];
  // A row can belong to a group this account no longer lists (a group deleted after
  // the cache kept its entries). Those rows are still the member's records, so they
  // get a filter of their own instead of silently joining a group that is not theirs.
  const known = new Set(circles.map((item) => item.id));
  const unlisted = Array.from(new Set(contributions.filter((item) => !known.has(item.circleId)).map((item) => item.circleId)));
  const circleOptions = [...circles.map((item) => item.id), ...unlisted];
  const clearFilters = () => {
    setFilter('All');
    setCircleFilter('All');
    setQuery('');
  };
  const exportCsv = () => {
    const csv = ledgerCsv(filtered, circleName, [
      ['Report', 'Turiwa ledger extract'],
      ['Rows in this file', filtered.length],
      ['Group', circleFilter === 'All' ? 'All groups on this account' : circleName(circleFilter)],
      ['Status filter', filter],
      ['Search', needle ? query.trim() : 'none'],
      ['Exported on', new Date().toISOString().slice(0, 10)],
    ]);
    saveCsv(csvFileName('turiwa-activity'), csv);
  };

  return (
    <View style={styles.root}>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <BrandHeader
          title="Activity"
          subtitle="Every contribution, expense, repayment, welfare set-aside and loan payout, as the ledger holds it."
          actions={
            <>
              <HeaderIconButton
                testID="activity-search"
                icon="search"
                label="Search the ledger"
                active={searchOpen}
                onPress={() => setSearchOpen((open) => !open)}
              />
              <HeaderIconButton
                testID="activity-export"
                icon="download"
                label="Download these entries as a spreadsheet"
                disabled={filtered.length === 0}
                onPress={exportCsv}
              />
            </>
          }
        />
        <View style={styles.summaryRow}>
          <SummaryCard testID="summary-in" tone="income" icon="arrow-down-left" label="TOTAL IN" value={moneyIn} caption={`${inCount} ${inCount === 1 ? 'entry' : 'entries'} in`} />
          <SummaryCard testID="summary-out" tone="expense" icon="arrow-up-right" label="TOTAL OUT" value={moneyOut} caption={`${outCount} ${outCount === 1 ? 'entry' : 'entries'} out`} />
          <SummaryCard testID="summary-net" tone="balance" icon="grid" label="CASH LEFT" value={net} caption={net < 0 ? 'Out went beyond in' : 'In less out'} />
        </View>
        {moneyOut > 0 ? (
          <Text style={[styles.outBreakdown, { color: colors.mutedForeground }]}>
            Out is three different things, so they stay apart: KES {spent.toLocaleString()} spent, KES{' '}
            {setAside.toLocaleString()} still held for welfare, KES {lentOut.toLocaleString()} handed over as loans
            and owed back. In is what members contributed and what borrowers paid back — a loan is never income.
          </Text>
        ) : null}
        {searchOpen ? (
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              testID="activity-query"
              value={query}
              onChangeText={setQuery}
              placeholder="Search memos, members and circles"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Search the ledger"
              autoCorrect={false}
              autoCapitalize="none"
              style={[styles.searchInput, { color: colors.foreground }]}
            />
            {query ? (
              <Pressable testID="activity-clear-search" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear the search">
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <SectionHeading title="Transaction history" />
        {circleOptions.length > 1 ? (
          <>
            <Text style={[styles.filterLabel, { color: colors.inkSoft }]}>Group</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circleFilters}>
              {['All', ...circleOptions].map((id) => {
                const active = circleFilter === id;
                return (
                  <Pressable
                    key={id}
                    testID={`activity-circle-${id.toLowerCase()}`}
                    onPress={() => setCircleFilter(id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [styles.circleFilter, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.successSoft : colors.card, opacity: pressed ? 0.75 : 1 }]}
                  >
                    <Text style={[styles.circleFilterText, { color: active ? colors.primary : colors.mutedForeground }]}>{id === 'All' ? 'All groups' : circleName(id)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
        {statuses.length > 1 ? (
          <>
            <Text style={[styles.filterLabel, { color: colors.inkSoft }]}>Status</Text>
            <View style={[styles.filters, { backgroundColor: colors.muted }]}>
              {statuses.map((item) => <Pressable key={item} testID={`activity-status-${item.toLowerCase()}`} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filter, filter === item && { backgroundColor: colors.card }]}><Text style={[styles.filterText, { color: filter === item ? colors.foreground : colors.mutedForeground }]}>{item}</Text></Pressable>)}
            </View>
          </>
        ) : null}
        <Text testID="activity-summary" style={[styles.resultMeta, { color: colors.mutedForeground }]}>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · KES {net.toLocaleString()} net{circleFilter === 'All' ? '' : ` in ${circleName(circleFilter)}`}</Text>
        <View style={styles.list}>{filtered.map((item) => <ActivityRow key={item.id} {...item} circleName={circleFilter === 'All' ? circleName(item.circleId) : undefined} />)}</View>
        {filtered.length === 0 ? (
          contributions.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}><Feather name="inbox" size={25} color={colors.mutedForeground} /></View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing here yet</Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>New transactions will appear in this view.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}><Feather name="search" size={25} color={colors.mutedForeground} /></View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results found</Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Try adjusting your filters.</Text>
              {filtering ? (
                <Pressable testID="activity-clear-filters" accessibilityRole="button" onPress={clearFilters} style={({ pressed }) => [styles.clearFilters, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
                  <Feather name="rotate-ccw" size={14} color={colors.primary} />
                  <Text style={[styles.clearFiltersText, { color: colors.primary }]}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
          )
        ) : null}
        <View style={[styles.footnote, { backgroundColor: colors.successSoft }]}><Feather name="shield" size={16} color={colors.primary} /><Text style={[styles.footnoteText, { color: colors.primary }]}>Every figure above is the sum of the rows below — nothing is estimated, and the export carries the same rows.</Text></View>
      </Screen>
      <Pressable
        testID="record-transaction"
        accessibilityRole="button"
        accessibilityLabel="Record a transaction"
        onPress={() => {
          Haptics.selectionAsync();
          setRecordOpen(true);
        }}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: layout.useSidebar ? insets.bottom + 26 : 100,
            right: layout.gutter,
            backgroundColor: colors.hero,
            opacity: pressed ? 0.88 : 1,
            boxShadow: colors.shadowHero,
          },
        ]}
      >
        <View style={[styles.fabIcon, { backgroundColor: colors.heroChip }]}>
          <Feather name="plus" size={16} color={colors.heroForeground} />
        </View>
          <Text style={[styles.fabText, { color: colors.heroForeground }]}>RECORD TRANSACTION</Text>
      </Pressable>
      <RecordTransactionModal
        visible={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSave={addContribution}
        circles={circles}
      />
    </View>
  );
}
function SummaryCard({ testID, tone, icon, label, value, caption }: { testID: string; tone: Tone; icon: keyof typeof Feather.glyphMap; label: string; value: number; caption: string }) {
  const colors = useColors();
  const layout = useResponsive();
  const tint = tone === 'income' ? colors.income : tone === 'expense' ? colors.expense : colors.balance;
  const surface = tone === 'income' ? colors.incomeSoft : tone === 'expense' ? colors.expenseSoft : colors.balanceSoft;
  return (
    <View testID={testID} style={[styles.summaryCard, layout.isPhone && styles.summaryCardPhone, { backgroundColor: surface, borderColor: colors.border }]}>
      <View style={styles.summaryHead}>
        <View style={[styles.summaryIconBox, { backgroundColor: 'rgba(255, 255, 255, 0.5)' }]}>
          <Feather name={icon} size={12} color={tint} />
        </View>
        <Text style={[styles.summaryLabel, { color: tint }]}>{label}</Text>
      </View>
      <Text style={[styles.summaryValue, layout.isPhone && styles.summaryValuePhone, { color: tint }]}>
        <Text style={styles.summaryCurrency}>KES </Text>
        {value.toLocaleString()}
      </Text>
      {layout.isPhone ? null : <Text style={[styles.summaryCaption, { color: tint }]} numberOfLines={1}>{caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 13 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  summaryIconBox: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontFamily: 'Inter_700Bold', fontSize: 9.5, letterSpacing: 1.1, flexShrink: 1 },
  summaryCardPhone: { padding: 12 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 21, letterSpacing: -0.7 },
  summaryValuePhone: { fontSize: 15.5, letterSpacing: -0.4 },
  // The currency sits smaller than the figure so three cards still fit side by
  // side on a phone without the amount breaking onto a second line.
  summaryCurrency: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5, letterSpacing: 0.4 },
  summaryCaption: { fontFamily: 'Inter_500Medium', fontSize: 10.5, marginTop: 6, opacity: 0.85 },
  outBreakdown: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 17, marginTop: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, minHeight: 46, marginTop: 18 },
  searchInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, paddingVertical: 8 },
  filters: { borderRadius: 13, padding: 4, flexDirection: 'row', marginBottom: 7 },
  filterLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4, marginTop: 16, marginBottom: 8 },
  circleFilters: { gap: 8, paddingRight: 8 },
  circleFilter: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  circleFilterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  resultMeta: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 10, marginBottom: 2 },
  filter: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 10 },
  filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  list: { marginTop: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 14 },
  emptyCopy: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 5 },
  clearFilters: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 40, marginTop: 16 },
  clearFiltersText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  footnote: { flexDirection: 'row', gap: 9, alignItems: 'center', padding: 13, borderRadius: 13, marginTop: 23 },
  footnoteText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  fab: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 9, paddingRight: 18, minHeight: 54, borderRadius: 27 },
  fabIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fabText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.1 },
});

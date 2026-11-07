import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useTuriwa } from '@/context/TuriwaContext';
import {
  ActivityRow,
  BrandHeader,
  HeaderIconButton,
  RecordTransactionModal,
  Screen,
  ScreenSkeleton,
  SectionHeading,
  TransactionDetailModal,
} from '@/components/TuriwaUI';
import {
  currentMonthKey,
  entryDelta,
  isLentOut,
  isOutflow,
  isSetAside,
  monthKey,
  monthLabel,
  type Contribution,
  type LedgerType,
} from '@/lib/api';
import { csvFileName, ledgerCsv, saveCsv } from '@/lib/statement';

type Tone = 'income' | 'expense' | 'balance';
type DateRange = 'All' | 'ThisMonth' | 'LastMonth' | 'Last90Days';
type DirectionFilter = 'All' | 'Inflow' | 'Outflow';
type StatusFilter = 'All' | 'Complete' | 'Pending';
type TypeFilter = 'All' | LedgerType;

const PAGE_SIZE = 25;

export default function ActivityScreen() {
  const colors = useColors();
  const layout = useResponsive();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { contributions, circles, loans, activeCircleId, addContribution, refresh, refreshing, hydrated } = useTuriwa();

  // Primary filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [circleFilter, setCircleFilter] = useState<'All' | string>('All');
  const [dateRange, setDateRange] = useState<DateRange>('All');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('All');
  const [memberFilter, setMemberFilter] = useState<string>('All');

  // Search & Modals
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Contribution | null>(null);

  // Pagination / Incremental loading
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  // Follow active circle switch
  useEffect(() => {
    if (activeCircleId) {
      setCircleFilter(activeCircleId);
    }
  }, [activeCircleId]);

  const circleName = (id: string) => circles.find((item) => item.id === id)?.name ?? 'Unassigned';

  // Distinct members across contributions or active circles for member filter
  const memberOptions = useMemo(() => {
    const names = new Set<string>();
    contributions.forEach((item) => {
      if (item.member && item.member.trim()) names.add(item.member.trim());
    });
    circles.forEach((circle) => {
      (circle.membersList ?? []).forEach((m) => {
        if (m.name && m.name.trim()) names.add(m.name.trim());
      });
    });
    return Array.from(names).sort();
  }, [contributions, circles]);

  // Date calculation boundaries
  const now = useMemo(() => new Date(), []);
  const thisMonthKey = useMemo(() => currentMonthKey(now), [now]);
  const lastMonthKey = useMemo(() => {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return currentMonthKey(prev);
  }, [now]);
  const ninetyDaysAgo = useMemo(() => Date.now() - 90 * 24 * 60 * 60 * 1000, []);

  const needle = query.trim().toLowerCase();

  // Filter application
  const filtered = useMemo(() => {
    return contributions.filter((item) => {
      // 1. Status Filter
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;

      // 2. Circle Filter
      if (circleFilter !== 'All' && item.circleId !== circleFilter) return false;

      // 3. Date Range Filter
      if (dateRange === 'ThisMonth' && monthKey(item) !== thisMonthKey) return false;
      if (dateRange === 'LastMonth' && monthKey(item) !== lastMonthKey) return false;
      if (dateRange === 'Last90Days') {
        const itemTime = new Date(item.createdAt).getTime();
        if (!Number.isNaN(itemTime) && itemTime < ninetyDaysAgo) return false;
      }

      // 4. Transaction Type Filter
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;

      // 5. Direction Filter
      if (directionFilter === 'Inflow' && entryDelta(item.type ?? 'Contribution') <= 0) return false;
      if (directionFilter === 'Outflow' && entryDelta(item.type ?? 'Contribution') >= 0) return false;

      // 6. Member Filter
      if (memberFilter !== 'All' && item.member !== memberFilter) return false;

      // 7. Search Needle (Matches note, type, member, ID, loanId, and circleName)
      if (needle) {
        const searchable = `${item.note} ${item.type} ${item.member ?? ''} ${item.id} ${item.loanId ?? ''} ${circleName(item.circleId)}`.toLowerCase();
        if (!searchable.includes(needle)) return false;
      }

      return true;
    });
  }, [
    contributions,
    statusFilter,
    circleFilter,
    dateRange,
    typeFilter,
    directionFilter,
    memberFilter,
    needle,
    thisMonthKey,
    lastMonthKey,
    ninetyDaysAgo,
    circles,
  ]);

  // Reset pagination whenever filters or search query change
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [statusFilter, circleFilter, dateRange, typeFilter, directionFilter, memberFilter, needle]);

  const visibleTransactions = useMemo(
    () => filtered.slice(0, displayLimit),
    [filtered, displayLimit]
  );

  // Authoritative financial calculations strictly adhering to Turiwa accounting model:
  // - Inflows: Contributions, Repayments, Fines
  // - Outflows: Operational Expenses, Loan Disbursements
  // - Earmarks: Welfare Set-Asides (held in reserve, not spendable)
  // - Available Cash: Inflows - Expenses - Disbursements - Welfare
  const sum = (test: (item: Contribution) => boolean) =>
    filtered.reduce((total, item) => total + (test(item) ? item.amount : 0), 0);
  const count = (test: (item: Contribution) => boolean) =>
    filtered.filter(test).length;

  const contributionsAmount = sum((item) => (item.type ?? 'Contribution') === 'Contribution');
  const contributionsCount = count((item) => (item.type ?? 'Contribution') === 'Contribution');

  const repaymentsAmount = sum((item) => item.type === 'Repayment');
  const repaymentsCount = count((item) => item.type === 'Repayment');

  const finesAmount = sum((item) => item.type === 'Fine');
  const finesCount = count((item) => item.type === 'Fine');

  const expensesAmount = sum((item) => isOutflow(item.type));
  const expensesCount = count((item) => isOutflow(item.type));

  const disbursementsAmount = sum((item) => isLentOut(item.type));
  const disbursementsCount = count((item) => isLentOut(item.type));

  const welfareAmount = sum((item) => isSetAside(item.type));
  const welfareCount = count((item) => isSetAside(item.type));

  const totalInflows = contributionsAmount + repaymentsAmount + finesAmount;
  const totalInflowsCount = contributionsCount + repaymentsCount + finesCount;

  const availableCash = totalInflows - expensesAmount - disbursementsAmount - welfareAmount;

  // Active filter state detection
  const isFiltering =
    statusFilter !== 'All' ||
    circleFilter !== 'All' ||
    dateRange !== 'All' ||
    typeFilter !== 'All' ||
    directionFilter !== 'All' ||
    memberFilter !== 'All' ||
    needle.length > 0;

  const clearFilters = () => {
    Haptics.selectionAsync().catch(() => {});
    setStatusFilter('All');
    setCircleFilter('All');
    setDateRange('All');
    setTypeFilter('All');
    setDirectionFilter('All');
    setMemberFilter('All');
    setQuery('');
  };

  const dateRangeLabel =
    dateRange === 'ThisMonth'
      ? `This Month (${monthLabel(thisMonthKey)})`
      : dateRange === 'LastMonth'
      ? `Last Month (${monthLabel(lastMonthKey)})`
      : dateRange === 'Last90Days'
      ? 'Last 90 Days'
      : 'All Time';

  // Every entry the API writes is Complete, so a "Pending" segment would be a filter the
  // ledger can never answer. It appears only while a row actually carries that status.
  const statusOptions = useMemo<StatusFilter[]>(() => {
    const present = new Set(contributions.map((item) => item.status as StatusFilter));
    return (['All', 'Complete', 'Pending'] as const).filter((option) => option === 'All' || present.has(option));
  }, [contributions]);

  // Available circle options
  const known = new Set(circles.map((item) => item.id));
  const unlisted = Array.from(new Set(contributions.filter((item) => !known.has(item.circleId)).map((item) => item.circleId)));
  const circleOptions = [...circles.map((item) => item.id), ...unlisted];

  const exportCsv = () => {
    const csv = ledgerCsv(filtered, circleName, [
      ['Report', 'Turiwa Financial Ledger Extract'],
      ['Rows in this file', filtered.length],
      ['Group', circleFilter === 'All' ? 'All circles on this account' : circleName(circleFilter)],
      ['Date Range', dateRangeLabel],
      ['Status Filter', statusFilter],
      ['Type Filter', typeFilter],
      ['Direction Filter', directionFilter],
      ['Member Filter', memberFilter],
      ['Search', needle ? query.trim() : 'none'],
      ['Exported on', new Date().toISOString().slice(0, 10)],
    ]);
    saveCsv(csvFileName('turiwa-activity-ledger'), csv);
  };

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Screen><ScreenSkeleton rows={6} /></Screen>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <BrandHeader
          title="Activity"
          subtitle="Real-time financial ledger tracking contributions, expenses, loans, repayments, and welfare set-asides."
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
                label="Download entries as CSV spreadsheet"
                disabled={filtered.length === 0}
                onPress={exportCsv}
              />
            </>
          }
        />

        {/* Date Range Badge & Scope Summary */}
        <View style={styles.periodBanner}>
          <View style={styles.periodRow}>
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={[styles.periodText, { color: colors.foreground }]}>
              {dateRangeLabel} {circleFilter !== 'All' ? `· ${circleName(circleFilter)}` : '· All Circles'}
            </Text>
          </View>
          {isFiltering ? (
            <Pressable
              testID="activity-reset-filters-top"
              onPress={clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Reset all active filters"
              style={({ pressed }) => [styles.resetBadge, { backgroundColor: colors.muted, opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="rotate-ccw" size={11} color={colors.primary} />
              <Text style={[styles.resetBadgeText, { color: colors.primary }]}>Reset</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Financial Summary Grid (6 Distinct Metrics) */}
        <View style={styles.summaryGrid}>
          {/* 1. Member Contributions */}
          <SummaryCard
            testID="summary-contributions"
            tone="income"
            icon="arrow-down-left"
            label="CONTRIBUTIONS"
            value={contributionsAmount}
            count={contributionsCount}
            caption="Member savings & cycle dues"
          />

          {/* 2. Loan Repayments */}
          <SummaryCard
            testID="summary-repayments"
            tone="income"
            icon="corner-down-left"
            label="REPAYMENTS"
            value={repaymentsAmount}
            count={repaymentsCount}
            caption="Principal & interest recovered"
          />

          {/* 3. Operational Expenses */}
          <SummaryCard
            testID="summary-expenses"
            tone="expense"
            icon="arrow-up-right"
            label="EXPENSES"
            value={expensesAmount}
            count={expensesCount}
            caption="Circle operational costs paid out"
          />

          {/* 4. Loan Disbursements */}
          <SummaryCard
            testID="summary-disbursements"
            tone="balance"
            icon="send"
            label="LOANS DISBURSED"
            value={disbursementsAmount}
            count={disbursementsCount}
            caption="Capital lent out to borrowers"
          />

          {/* 5. Welfare Reserve */}
          <SummaryCard
            testID="summary-welfare"
            tone="balance"
            icon="bookmark"
            label="WELFARE RESERVE"
            value={welfareAmount}
            count={welfareCount}
            caption="Earmarked funds held in reserve"
          />

          {/* 6. Available Cash */}
          <SummaryCard
            testID="summary-available-cash"
            tone={availableCash >= 0 ? 'income' : 'expense'}
            icon="shield"
            label="AVAILABLE CASH"
            value={availableCash}
            count={filtered.length}
            caption={
              isFiltering
                ? availableCash >= 0
                  ? 'Net of the records these filters show'
                  : 'Deficit within the records these filters show'
                : availableCash >= 0
                  ? 'Spendable net circle balance'
                  : 'Deficit: Outflow exceeded inflows'
            }
          />
        </View>

        {/* Fines Subtext if present */}
        {finesAmount > 0 ? (
          <Text style={[styles.accountingNotice, { color: colors.mutedForeground }]}>
            Late penalty fines collected: KES {finesAmount.toLocaleString()} ({finesCount} {finesCount === 1 ? 'fine' : 'fines'}) included in total cash inflows.
          </Text>
        ) : null}

        {/* Search Bar */}
        {searchOpen ? (
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              testID="activity-query"
              value={query}
              onChangeText={setQuery}
              placeholder="Search memo, reference, member, or circle…"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Search the ledger"
              autoCorrect={false}
              autoCapitalize="none"
              style={[styles.searchInput, { color: colors.foreground }]}
            />
            {query ? (
              <Pressable
                testID="activity-clear-search"
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search input"
                hitSlop={8}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Filter Section */}
        <View style={styles.filterSection}>
          {/* Quick Date Range Filters */}
          <View style={styles.filterRowBlock}>
            <Text style={[styles.filterLabel, { color: colors.inkSoft }]}>DATE RANGE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {(['All', 'ThisMonth', 'LastMonth', 'Last90Days'] as const).map((range) => {
                const active = dateRange === range;
                const label = range === 'All' ? 'All Time' : range === 'ThisMonth' ? 'This Month' : range === 'LastMonth' ? 'Last Month' : 'Last 90 Days';
                return (
                  <Pressable
                    key={range}
                    testID={`filter-date-${range.toLowerCase()}`}
                    onPress={() => setDateRange(range)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.filterChip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.successSoft : colors.card,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Direction & Status Filters */}
          <View style={styles.dualFilterRow}>
            {/* Direction */}
            <View style={{ flex: 1 }}>
              <Text style={[styles.filterLabel, { color: colors.inkSoft }]}>DIRECTION</Text>
              <View style={[styles.segmentedWrap, { backgroundColor: colors.muted }]}>
                {(['All', 'Inflow', 'Outflow'] as const).map((dir) => {
                  const active = directionFilter === dir;
                  return (
                    <Pressable
                      key={dir}
                      testID={`filter-direction-${dir.toLowerCase()}`}
                      onPress={() => setDirectionFilter(dir)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.segmentBtn, active && { backgroundColor: colors.card }]}
                    >
                      <Text style={[styles.segmentText, { color: active ? colors.foreground : colors.mutedForeground }]}>
                        {dir === 'All' ? 'All' : dir === 'Inflow' ? '+ In' : '− Out'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Status */}
            <View style={{ flex: 1 }}>
              <Text style={[styles.filterLabel, { color: colors.inkSoft }]}>STATUS</Text>
              <View style={[styles.segmentedWrap, { backgroundColor: colors.muted }]}>
                {statusOptions.map((st) => {
                  const active = statusFilter === st;
                  return (
                    <Pressable
                      key={st}
                      testID={`filter-status-${st.toLowerCase()}`}
                      onPress={() => setStatusFilter(st)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.segmentBtn, active && { backgroundColor: colors.card }]}
                    >
                      <Text style={[styles.segmentText, { color: active ? colors.foreground : colors.mutedForeground }]}>
                        {st}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Group / Circle Selector */}
          {circleOptions.length > 1 ? (
            <View style={styles.filterRowBlock}>
              <Text style={[styles.filterLabel, { color: colors.inkSoft }]}>SAVINGS CIRCLE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {['All', ...circleOptions].map((id) => {
                  const active = circleFilter === id;
                  return (
                    <Pressable
                      key={id}
                      testID={`filter-circle-${id.toLowerCase()}`}
                      onPress={() => setCircleFilter(id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.filterChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.successSoft : colors.card,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.filterChipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                        {id === 'All' ? 'All Circles' : circleName(id)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Transaction Type Filter */}
          <View style={styles.filterRowBlock}>
            <Text style={[styles.filterLabel, { color: colors.inkSoft }]}>TRANSACTION TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {(['All', 'Contribution', 'Repayment', 'Expense', 'LoanDisbursement', 'Welfare', 'Fine'] as const).map((t) => {
                const active = typeFilter === t;
                const label =
                  t === 'All'
                    ? 'All Types'
                    : t === 'Contribution'
                    ? 'Contributions'
                    : t === 'Repayment'
                    ? 'Repayments'
                    : t === 'Expense'
                    ? 'Expenses'
                    : t === 'LoanDisbursement'
                    ? 'Loan Payouts'
                    : t === 'Welfare'
                    ? 'Welfare'
                    : 'Late Fines';
                return (
                  <Pressable
                    key={t}
                    testID={`filter-type-${t.toLowerCase()}`}
                    onPress={() => setTypeFilter(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.filterChip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.successSoft : colors.card,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Member Filter (if members exist) */}
          {memberOptions.length > 1 ? (
            <View style={styles.filterRowBlock}>
              <Text style={[styles.filterLabel, { color: colors.inkSoft }]}>MEMBER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {['All', ...memberOptions].map((name) => {
                  const active = memberFilter === name;
                  return (
                    <Pressable
                      key={name}
                      testID={`filter-member-${name.toLowerCase().replace(/\s+/g, '-')}`}
                      onPress={() => setMemberFilter(name)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.filterChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.successSoft : colors.card,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.filterChipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                        {name === 'All' ? 'All Members' : name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>

        {/* Transaction History Section */}
        <SectionHeading
          title="Transaction History"
          action={isFiltering ? 'Reset Filters' : undefined}
          onAction={isFiltering ? clearFilters : undefined}
        />

        {/* Result Meta Counter */}
        <View style={styles.resultMetaRow}>
          <Text testID="activity-summary" style={[styles.resultMeta, { color: colors.mutedForeground }]}>
            Showing {visibleTransactions.length} of {filtered.length} {filtered.length === 1 ? 'record' : 'records'} · KES {availableCash.toLocaleString()} {isFiltering ? 'net of these filters' : 'available cash'}
          </Text>
          {isFiltering ? (
            <Pressable
              testID="activity-clear-filters"
              onPress={clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Reset all active filters"
              style={({ pressed }) => [styles.resetLink, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="rotate-ccw" size={12} color={colors.primary} />
              <Text style={[styles.resetLinkText, { color: colors.primary }]}>Clear filters</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Transaction Rows List */}
        <View style={styles.list}>
          {visibleTransactions.map((item) => (
            <ActivityRow
              key={item.id}
              id={item.id}
              note={item.note}
              date={item.date}
              createdAt={item.createdAt}
              amount={item.amount}
              status={item.status}
              circleName={circleName(item.circleId)}
              type={item.type}
              member={item.member}
              loanId={item.loanId}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedTx(item);
              }}
            />
          ))}
        </View>

        {/* Incremental Loading / Pagination */}
        {filtered.length > visibleTransactions.length ? (
          <Pressable
            testID="activity-load-more"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setDisplayLimit((curr) => curr + PAGE_SIZE);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Load ${Math.min(PAGE_SIZE, filtered.length - visibleTransactions.length)} more transactions`}
            style={({ pressed }) => [
              styles.loadMoreButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Feather name="chevron-down" size={16} color={colors.primary} />
            <Text style={[styles.loadMoreText, { color: colors.foreground }]}>
              Load More Records ({filtered.length - visibleTransactions.length} remaining)
            </Text>
          </Pressable>
        ) : null}

        {/* Empty States */}
        {filtered.length === 0 ? (
          contributions.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                <Feather name="inbox" size={26} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Transactions Recorded</Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                Contributions, expenses, repayments and loan disbursements will appear here once recorded.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                <Feather name="search" size={26} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Matching Records</Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                No transactions matched your selected filters or search query.
              </Text>
              <Pressable
                testID="activity-empty-clear-filters"
                accessibilityRole="button"
                onPress={clearFilters}
                style={({ pressed }) => [
                  styles.clearFiltersBtn,
                  { borderColor: colors.primary, backgroundColor: colors.successSoft, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Feather name="rotate-ccw" size={14} color={colors.primary} />
                <Text style={[styles.clearFiltersBtnText, { color: colors.primary }]}>Reset All Filters</Text>
              </Pressable>
            </View>
          )
        ) : null}

        {/* Accounting Guarantee Footnote */}
        <View style={[styles.footnote, { backgroundColor: colors.successSoft }]}>
          <Feather name="shield" size={16} color={colors.primary} />
          <Text style={[styles.footnoteText, { color: colors.primary }]}>
            Authoritative ledger: All calculations are derived directly from verified database records. Loan payouts are capital receivables and repayments are capital recoveries.
          </Text>
        </View>

        {/* Generous bottom spacer so FAB never obscures list content */}
        <View style={{ height: layout.useSidebar ? 40 : 100 }} />
      </Screen>

      {/* Floating Action Button */}
      <Pressable
        testID="record-transaction"
        accessibilityRole="button"
        accessibilityLabel="Record a transaction"
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setRecordOpen(true);
        }}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: layout.useSidebar ? insets.bottom + 26 : 96,
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

      {/* Record Transaction Modal */}
      <RecordTransactionModal
        visible={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSave={addContribution}
        circles={circles}
      />

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        visible={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        circleName={selectedTx ? circleName(selectedTx.circleId) : undefined}
        loan={selectedTx?.loanId ? loans.find((item) => item.id === selectedTx.loanId) ?? null : null}
        onViewLoan={(loanId) => {
          setSelectedTx(null);
          router.push({ pathname: '/(tabs)/loans', params: { loanId } });
        }}
      />
    </View>
  );
}

function SummaryCard({
  testID,
  tone,
  icon,
  label,
  value,
  count,
  caption,
}: {
  testID: string;
  tone: Tone;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: number;
  count?: number;
  caption: string;
}) {
  const colors = useColors();
  const layout = useResponsive();
  const tint = tone === 'income' ? colors.income : tone === 'expense' ? colors.expense : colors.balance;
  const surface = tone === 'income' ? colors.incomeSoft : tone === 'expense' ? colors.expenseSoft : colors.balanceSoft;

  return (
    <View
      testID={testID}
      style={[
        styles.summaryCard,
        layout.isPhone && styles.summaryCardPhone,
        { backgroundColor: surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.summaryHead}>
        <View style={[styles.summaryIconBox, { backgroundColor: 'rgba(255, 255, 255, 0.45)' }]}>
          <Feather name={icon} size={12} color={tint} />
        </View>
        <Text style={[styles.summaryLabel, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.summaryValue, layout.isPhone && styles.summaryValuePhone, { color: tint }]}>
        <Text style={styles.summaryCurrency}>KES </Text>
        {value.toLocaleString()}
      </Text>
      <Text style={[styles.summaryCaption, { color: tint }]} numberOfLines={1}>
        {count !== undefined ? `${count} txns · ` : ''}{caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  periodBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  periodText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  resetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  resetBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minWidth: 145,
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
  },
  summaryCardPhone: {
    minWidth: '47%',
    padding: 11,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  summaryIconBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10.5,
    letterSpacing: 1.1,
    flexShrink: 1,
  },
  summaryValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    letterSpacing: -0.6,
  },
  summaryValuePhone: {
    fontSize: 15.5,
    letterSpacing: -0.4,
  },
  summaryCurrency: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  summaryCaption: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10.5,
    marginTop: 5,
    opacity: 0.88,
  },
  accountingNotice: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    marginBottom: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    minHeight: 46,
    marginTop: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    paddingVertical: 8,
  },
  filterSection: {
    marginTop: 14,
    gap: 10,
  },
  filterRowBlock: {
    gap: 6,
  },
  dualFilterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  filterLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10.5,
    letterSpacing: 1.3,
  },
  filterScroll: {
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 13,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  segmentedWrap: {
    borderRadius: 11,
    padding: 3,
    flexDirection: 'row',
    minHeight: 44,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    minHeight: 44,
  },
  segmentText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
  },
  resultMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  resultMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    flex: 1,
  },
  resetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resetLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
  },
  list: {
    marginTop: 4,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 46,
    marginTop: 14,
    marginBottom: 6,
  },
  loadMoreText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    marginTop: 12,
  },
  emptyCopy: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 320,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 42,
    marginTop: 14,
  },
  clearFiltersBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  footnote: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    padding: 12,
    borderRadius: 13,
    marginTop: 20,
  },
  footnoteText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },
  fab: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 9,
    paddingRight: 18,
    minHeight: 52,
    borderRadius: 26,
    zIndex: 10,
  },
  fabIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1.1,
  },
});

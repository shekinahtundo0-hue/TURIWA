import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/context/ThemeContext';
import { useTuriwa } from '@/context/TuriwaContext';
import type { Circle, LedgerType } from '@/lib/api';
import * as api from '@/lib/api';
import { buildStatement, monthlySummary } from '@/lib/statement';
import {
  ActivityRow,
  Amount,
  BrandHeader,
  CircleCard,
  CircleDetailModal,
  NotificationsModal,
  notificationItems,
  PrimaryButton,
  RecordTransactionModal,
  Screen,
  SectionHeading,
  StatPill,
} from '@/components/TuriwaUI';

// The greeting follows the clock instead of greeting everyone at breakfast.
function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const colors = useColors();
  const { isDark } = useTheme();
  const layout = useResponsive();
  const wide = layout.isDesktop;
  const router = useRouter();
  const { circles, contributions, addContribution, loans, finance, user, hydrated, profileName, live, liveError, refresh, refreshing, setCircleFine, applyFine, removeCircleMember } = useTuriwa();
  const [modalVisible, setModalVisible] = useState(false);
  const [contributionCircleId, setContributionCircleId] = useState<string | undefined>(undefined);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [detailCircle, setDetailCircle] = useState<Circle | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [ledgerType, setLedgerType] = useState<LedgerType>('Contribution');
  // One sheet records every kind of ledger entry; the entry point picks the kind.
  const openLedger = (type: LedgerType = 'Contribution') => {
    Haptics.selectionAsync();
    setLedgerType(type);
    setModalVisible(true);
  };
  const savedFor = finance.savedFor;
  const isAdmin = (circle: Circle) => Boolean(user?.id) && circle.createdBy === user?.id;
  const requests = loans.filter((loan) => loan.status === 'Pending');
  // Same derivation as the sheet the bell opens: the badge is that list's length.
  const notifications = useMemo(() => notificationItems(contributions, loans, circles), [contributions, loans, circles]);
  // On track is this month's own question: what the group agreed to take in a month,
  // against what its own members have handed in this one. A group's saved total, or the
  // fund's net movement, says nothing about either.
  const onTrackCircles = circles.filter((circle) => {
    const planned = api.plannedPerMonth(circle);
    return planned > 0 && finance.contributedForThisMonth(circle.id) >= planned;
  }).length;
  // Money the fund has actually handed over and not seen back: a request is not a loan.
  const runningLoans = loans.filter((loan) => loan.status === 'Active');
  const monthStatement = useMemo(() => buildStatement(contributions, api.currentMonthKey()), [contributions]);
  const summary = useMemo(
    () =>
      monthlySummary(monthStatement, {
        planned: finance.plannedThisMonth,
        overdue: finance.overdueLoans,
        requests,
        unlinked: finance.unlinkedLoans,
        gaps: finance.loanGaps,
        unassigned: finance.unassigned,
      }),
    [monthStatement, finance, loans],
  );
  if (!hydrated) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <MaterialCommunityIcons name="loading" size={32} color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <BrandHeader
          title={`${greetingFor(new Date())}, ${profileName}`}
          subtitle={
            live
              ? 'Live with your Turiwa database.'
              : liveError
                ? 'Not connected to your Turiwa database. Pull down to refresh.'
                : 'Connecting to your Turiwa database…'
          }
          onNotification={() => setNotificationsVisible(true)}
          notificationCount={notifications.length}
        />
        <View style={[styles.overview, wide && styles.overviewWide]}>
          <View style={[styles.heroWrap, wide && styles.heroWrapWide]}>
            <LinearGradient
              colors={isDark ? ['#051811', '#0B2D21'] : ['#022E20', '#04432F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroCard, wide && styles.heroCardWide, { boxShadow: colors.shadowHero }]}
            >
              <View style={[styles.heroOrb, { borderColor: colors.heroBorder }]} />
              <View style={[styles.heroOrbInner, { borderColor: colors.heroBorder }]} />
              <View style={styles.heroTopRow}>
                <Text style={[styles.heroEyebrow, { color: colors.heroMuted }]}>
                  CASH HELD BY THE FUND
                </Text>
                <View style={[styles.trustBadge, { backgroundColor: colors.heroChip, borderColor: colors.heroBorder }]}>
                  <Feather name="shield" size={13} color={colors.heroForeground} />
                  <Text style={[styles.trustText, { color: colors.heroForeground }]}>
                    Read from the ledger
                  </Text>
                </View>
              </View>
              <Amount testID="home-cash-held" value={finance.netBalance} size={wide ? 38 : 34} color={colors.heroForeground} />
              <View style={styles.heroFooter}>
                <View style={styles.heroMonthWrap}>
                  <Text style={[styles.heroMeta, { color: colors.heroMuted }]}>
                    This month, against the plan
                  </Text>
                  <Text testID="home-month-pace" style={[styles.heroMonth, { color: colors.heroForeground }]}>
                    {finance.plannedThisMonth > 0
                      ? `${api.kesLabel(finance.contributedThisMonth)} in contributions of ${api.kesLabel(finance.plannedThisMonth)} agreed`
                      : `${api.kesLabel(finance.contributedThisMonth)} in contributions · no monthly plan set yet`}
                  </Text>
                </View>
                <Pressable
                  testID="home-save"
                  accessibilityRole="button"
                  onPress={() => openLedger()}
                  style={({ pressed }) => [
                    styles.heroQuickBtn,
                    { backgroundColor: colors.heroChip, borderColor: colors.heroBorder, opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <Feather name="plus" size={13} color={colors.heroForeground} />
                  <Text style={[styles.heroQuickText, { color: colors.heroForeground }]}>Save</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </View>
          <View style={[styles.statsRow, wide && styles.statsColumn]}>
            <StatPill
              icon="account-group-outline"
              label="Active circles"
              value={`${circles.length}`}
            />
            <StatPill icon="trending-up" label="On track this month" value={`${onTrackCircles}/${circles.length}`} tone="gold" />
          </View>
        </View>

        {/* What the fund holds is four different kinds of money. Shown as the sum of
            the parts, so no figure on this screen is one nobody can trace to a row. */}
        <SectionHeading title="Where the money is" />
        <View testID="home-bridge" style={[styles.bridge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <BridgeRow label="Contributions paid in" value={finance.contributed} />
          <BridgeRow label="Loan money paid back" value={finance.repaid} />
          <BridgeRow label="Spent by the group" value={-finance.outflow} />
          <BridgeRow label="Set aside as welfare" value={-finance.setAside} hint="Held, not spent" />
          <BridgeRow label="Handed over as loans" value={-finance.paidOut} hint="Back as repayments" />
          <View style={[styles.bridgeTotal, { borderTopColor: colors.border }]}>
            <Text style={[styles.bridgeTotalLabel, { color: colors.mutedForeground }]}>Cash the fund can use</Text>
            <Text style={[styles.bridgeTotalValue, { color: colors.foreground }]}>{api.kesLabel(finance.netBalance)}</Text>
          </View>
          {finance.unassigned !== 0 ? (
            <Text style={[styles.bridgeNote, { color: colors.accentForeground }]}>
              {api.kesLabel(Math.abs(finance.unassigned))} of these entries belong to a group this account cannot open.
            </Text>
          ) : null}
        </View>
        <View style={styles.loanFacts}>
          <MoneyFact
            testID="home-owed"
            label="OWED TO THE GROUP"
            value={finance.outstanding}
            caption={runningLoans.length > 0 ? `${runningLoans.length} running loan${runningLoans.length === 1 ? '' : 's'}, interest included` : 'Nothing borrowed yet'}
            onPress={() => router.push('/loans')}
          />
          <MoneyFact
            testID="home-lendable"
            label="READY TO LEND"
            value={finance.lendable}
            caption="The cash the fund holds — the same ceiling a loan is refused above"
            onPress={() => router.push('/loans')}
          />
        </View>

        <SectionHeading title="Needs attention" />
        <View style={[styles.attention, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <AttentionRow
            testID="attention-overdue"
            icon="alert-triangle"
            warn={finance.overdueLoans.length > 0}
            label={finance.overdueLoans.length > 0 ? `${finance.overdueLoans.length} loan${finance.overdueLoans.length === 1 ? '' : 's'} past their due date` : 'No loan is past its due date'}
            detail={finance.overdueLoans.length > 0 ? `${api.kesLabel(finance.overdueOwed)} still owing on them` : `${runningLoans.length} running loan${runningLoans.length === 1 ? '' : 's'} on schedule`}
            onPress={() => router.push('/loans')}
          />
          <AttentionRow
            testID="attention-approvals"
            icon="file-text"
            warn={requests.length > 0}
            label={requests.length > 0 ? `${requests.length} loan request${requests.length === 1 ? '' : 's'} awaiting a decision` : 'No loan request is waiting'}
            detail={requests.length > 0 ? 'No money moves until the group approves it' : 'A new request appears here the moment a member sends one'}
            onPress={() => router.push('/loans')}
          />
          <AttentionRow
            testID="attention-arrears"
            icon="clock"
            warn={finance.plannedThisMonth > finance.contributedThisMonth}
            label={
              finance.plannedThisMonth > finance.contributedThisMonth
                ? `${api.kesLabel(finance.plannedThisMonth - finance.contributedThisMonth)} of this month's plan has not arrived`
                : 'This month has met the agreed plan'
            }
            detail={
              finance.plannedThisMonth > 0
                ? `The groups agreed to take ${api.kesLabel(finance.plannedThisMonth)} in the month; members have handed in ${api.kesLabel(finance.contributedThisMonth)}`
                : 'Set a contribution and headcount in a group to get a monthly plan'
            }
            onPress={() => router.push('/activity')}
          />
          <AttentionRow
            testID="attention-reconciliation"
            icon="target"
            warn={finance.unlinkedLoans.length > 0 || finance.loanGaps > 0}
            label={
              finance.unlinkedLoans.length > 0
                ? `${finance.unlinkedLoans.length} loan${finance.unlinkedLoans.length === 1 ? '' : 's'} have no group on record`
                : finance.loanGaps > 0
                  ? `${api.kesLabel(finance.loanGaps)} where a loan and its rows disagree`
                  : 'The loan book and the ledger agree'
            }
            detail={
              finance.unlinkedLoans.length > 0
                ? 'Their cash is in the fund total but in no group split'
                : 'Each group adds up to the fund, and each loan to its repayments'
            }
            onPress={() => router.push('/statement')}
          />
        </View>

        <SectionHeading
          title="This month at a glance"
          action="Full statement"
          onAction={() => router.push('/statement')}
        />
        <View testID="home-monthly-summary" style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {summary.map((line) => (
            <Text key={line} style={[styles.summaryLine, { color: colors.foreground }]}>
              {line}
            </Text>
          ))}
          <Text style={[styles.summaryFoot, { color: colors.mutedForeground }]}>
            Read from {monthStatement.rows.length} ledger {monthStatement.rows.length === 1 ? 'row' : 'rows'}. Any figure for what is still owed assumes everyone pays on time.
          </Text>
        </View>

        <SectionHeading title="Turiwa services" />
        <View style={styles.serviceGrid}>
          <ServiceTile width={layout.tileWidth} icon="credit-card" label="Loans" detail={finance.lendable > 0 ? `${api.kesLabel(finance.lendable)} ready to lend` : 'No cash to lend right now'} onPress={() => router.push('/loans')} />
          <ServiceTile width={layout.tileWidth} icon="plus-circle" label="Contribute" detail="Add to a circle" onPress={() => openLedger()} />
          <ServiceTile width={layout.tileWidth} icon="users" label="Circles" detail={`${circles.length} active ${circles.length === 1 ? 'group' : 'groups'}`} onPress={() => router.push('/circles')} />
          <ServiceTile width={layout.tileWidth} icon="activity" label="Activity" detail="Track every move" onPress={() => router.push('/activity')} />
          <ServiceTile width={layout.tileWidth} icon="file-text" label="Statements" detail="Export your records" onPress={() => router.push('/statement')} />
        </View>
        <Pressable
          testID="home-welfare"
          onPress={() => openLedger('Welfare')}
          accessibilityRole="button"
          accessibilityLabel="Set money aside as welfare"
          style={({ pressed }) => [styles.snapshot, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.82 : 1 }]}
        >
          <View style={[styles.snapshotIcon, { backgroundColor: colors.balanceSoft }]}><MaterialCommunityIcons name="shield-check-outline" size={19} color={colors.balance} /></View>
          <View style={styles.snapshotCopy}>
            <Text style={[styles.snapshotLabel, { color: colors.mutedForeground }]}>WELFARE SET ASIDE</Text>
            <Text style={[styles.snapshotAmount, { color: colors.foreground }]}>
              {finance.setAside > 0 ? `${api.kesLabel(finance.setAside)} held, not spent` : 'Nothing set aside yet'}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>
        {runningLoans.length > 0 ? (
          <Pressable onPress={() => router.push('/loans')} accessibilityRole="button" style={({ pressed }) => [styles.snapshot, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.82 : 1 }]}>
            <View style={[styles.snapshotIcon, { backgroundColor: colors.successSoft }]}><MaterialCommunityIcons name="hand-coin-outline" size={19} color={colors.primary} /></View>
            <View style={styles.snapshotCopy}><Text style={[styles.snapshotLabel, { color: colors.mutedForeground }]}>{runningLoans.length === 1 ? `CURRENT LOAN · ${runningLoans[0].status.toUpperCase()}` : `${runningLoans.length} LOANS OUTSTANDING`}</Text><Text style={[styles.snapshotAmount, { color: colors.foreground }]}>{api.kesLabel(finance.outstanding)} remaining</Text></View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        <SectionHeading
          title="Your circles"
          action={circles.length > 1 ? 'See all' : undefined}
          onAction={() => setShowAll(true)}
        />
        {circles.length === 0 ? (
          <Pressable onPress={() => router.push('/(onboarding)/create-group')} accessibilityRole="button" style={({ pressed }) => [styles.newGroup, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.82 : 1 }]}>
            <View style={[styles.newGroupIcon, { backgroundColor: colors.successSoft }]}><Feather name="plus" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.newGroupTitle, { color: colors.foreground }]}>Create your first group</Text>
              <Text style={[styles.newGroupCopy, { color: colors.mutedForeground }]}>Set the contribution, how often, and your loan rate.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        <View style={styles.cardGrid}>
          {(showAll ? circles : circles.slice(0, 2)).map((circle) => (
            <View key={circle.id} style={{ width: layout.cardWidth }}>
              <CircleCard
                {...circle}
                tone={circle.color}
                isAdmin={isAdmin(circle)}
                current={savedFor(circle.id)}
                onPress={() => setDetailCircle(circle)}
              />
            </View>
          ))}
        </View>
        <SectionHeading
          title="Recent activity"
          action="View all"
          onAction={() => router.push('/activity')}
        />
        {contributions.slice(0, 3).map((item) => (
          <ActivityRow key={item.id} {...item} />
        ))}
      </Screen>
      <RecordTransactionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={addContribution}
        circles={circles}
        initialCircleId={contributionCircleId}
        initialType={ledgerType}
      />
      <CircleDetailModal
        visible={detailCircle !== null}
        circle={detailCircle ?? undefined}
        contributions={contributions}
        loans={loans}
        isAdmin={detailCircle ? isAdmin(detailCircle) : false}
        isCoAdmin={detailCircle ? (detailCircle.coAdminIds ?? []).includes(user?.id ?? '') : false}
        currentUserId={user?.id}
        onClose={() => setDetailCircle(null)}
        onApplyLoan={(circleId) => {
          setDetailCircle(null);
          router.push({ pathname: '/loans', params: { circleId } });
        }}
        onReviewLoans={() => {
          setDetailCircle(null);
          router.push('/loans');
        }}
        onContribute={(circleId) => {
          setDetailCircle(null);
          setContributionCircleId(circleId);
          openLedger();
        }}
        onSetFine={async (circleId, amount) => {
          await setCircleFine(circleId, amount);
          Haptics.selectionAsync();
        }}
        onApplyFine={async (circleId, memberId) => {
          await applyFine(circleId, memberId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onRemoveCircleMember={async (circleId, memberId) => {
          await removeCircleMember(circleId, memberId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
      />
      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
        contributions={contributions}
        loans={loans}
        circles={circles}
      />
    </>
  );
}

function ServiceTile({ width, icon, label, detail, onPress }: { width: DimensionValue; icon: keyof typeof Feather.glyphMap; label: string; detail: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      testID={`service-${label.toLowerCase()}`}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceTile,
        {
          width,
          backgroundColor: colors.card,
          borderColor: colors.border,
          transform: [{ scale: pressed ? 0.975 : 1 }],
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View style={styles.serviceHead}>
        <View style={[styles.serviceIcon, { backgroundColor: colors.successSoft, borderColor: colors.border }]}>
          <Feather name={icon} size={17} color={colors.primary} />
        </View>
        <Feather name="arrow-up-right" size={13} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.serviceLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.serviceDetail, { color: colors.mutedForeground }]} numberOfLines={1}>{detail}</Text>
    </Pressable>
  );
}

/** One line of the bridge from what came in to what the fund can use. Money in reads
 *  positive and money the group no longer holds reads negative, because that is what
 *  each of them is. */
function BridgeRow({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const colors = useColors();
  const positive = value >= 0;
  return (
    <View style={styles.bridgeRow}>
      <View style={styles.bridgeLabelWrap}>
        <Feather name={positive ? 'arrow-down-left' : 'arrow-up-right'} size={12} color={positive ? colors.income : colors.expense} />
        <Text style={[styles.bridgeLabel, { color: colors.foreground }]}>{label}</Text>
        {hint ? <Text style={[styles.bridgeHint, { color: colors.mutedForeground }]} numberOfLines={1}>{hint}</Text> : null}
      </View>
      <Text style={[styles.bridgeValue, { color: positive ? colors.income : colors.expense }]}>{api.kesLabel(value)}</Text>
    </View>
  );
}

function MoneyFact({ testID, label, value, caption, onPress }: { testID: string; label: string; value: number; caption: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${api.kesLabel(value)}. ${caption}`}
      onPress={onPress}
      style={({ pressed }) => [styles.fact, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={[styles.factLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.foreground }]}>{api.kesLabel(value)}</Text>
      <Text style={[styles.factCaption, { color: colors.mutedForeground }]}>{caption}</Text>
    </Pressable>
  );
}

/** One thing a treasurer would want to look at, with the number that made it true. */
function AttentionRow({ testID, icon, label, detail, warn, onPress }: { testID: string; icon: keyof typeof Feather.glyphMap; label: string; detail: string; warn: boolean; onPress: () => void }) {
  const colors = useColors();
  const tone = warn ? colors.expense : colors.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.attentionRow, { borderBottomColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.attentionIcon, { backgroundColor: warn ? colors.expenseSoft : colors.successSoft }]}>
        <Feather name={icon} size={14} color={tone} />
      </View>
      <View style={styles.attentionCopy}>
        <Text style={[styles.attentionLabel, { color: tone }]}>{label}</Text>
        <Text style={[styles.attentionDetail, { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overview: { marginBottom: 17 },
  overviewWide: { flexDirection: 'row', alignItems: 'stretch' },
  heroWrap: { position: 'relative' },
  heroWrapWide: { flex: 5, paddingRight: 12 },
  heroCard: { borderRadius: 24, padding: 22, minHeight: 184, overflow: 'hidden' },
  heroCardWide: { flex: 1 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heroOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    right: -60,
    top: -70,
    opacity: 0.5,
  },
  heroOrbInner: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    right: -25,
    top: -35,
    opacity: 0.3,
  },
  heroEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10.5,
    letterSpacing: 1.8,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 22,
  },
  heroMonthWrap: { flex: 1, paddingRight: 10 },
  heroMeta: { fontFamily: 'Inter_400Regular', fontSize: 10.5 },
  heroMonth: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  trustBadge: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  trustText: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5, letterSpacing: 0.2 },
  heroQuickBtn: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroQuickText: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statsColumn: { flexDirection: 'column', flex: 2, gap: 10 },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  serviceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 11 },
  serviceTile: { minHeight: 110, borderRadius: 18, borderWidth: 1, padding: 14 },
  serviceIcon: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  serviceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, letterSpacing: -0.2 },
  serviceDetail: { fontFamily: 'Inter_400Regular', fontSize: 10.5, marginTop: 4 },
  snapshot: { borderRadius: 17, borderWidth: 1, padding: 13, flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 17 },
  newGroup: { borderRadius: 18, borderWidth: 1, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'center' },
  newGroupIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  newGroupTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5 },
  newGroupCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 },
  snapshotIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  snapshotCopy: { flex: 1 },
  snapshotLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  snapshotAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 4 },
  bridge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 15, paddingTop: 6, paddingBottom: 13 },
  bridgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 11, minHeight: 46 },
  bridgeLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  bridgeLabel: { fontFamily: 'Inter_500Medium', fontSize: 12.5 },
  bridgeHint: { fontFamily: 'Inter_400Regular', fontSize: 10.5, flexBasis: '100%', marginLeft: 20 },
  bridgeValue: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  bridgeTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, marginTop: 4, paddingTop: 13 },
  bridgeTotalLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  bridgeTotalValue: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  bridgeNote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 10 },
  loanFacts: { flexDirection: 'row', gap: 10, marginTop: 10 },
  fact: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14 },
  factLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  factValue: { fontFamily: 'Inter_700Bold', fontSize: 19, letterSpacing: -0.5, marginTop: 6, fontVariant: ['tabular-nums'] },
  factCaption: { fontFamily: 'Inter_400Regular', fontSize: 10.5, lineHeight: 15, marginTop: 6 },
  attention: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 15 },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, minHeight: 62, borderBottomWidth: 1 },
  attentionIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  attentionCopy: { flex: 1 },
  attentionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  attentionDetail: { fontFamily: 'Inter_400Regular', fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  summary: { borderRadius: 20, borderWidth: 1, padding: 15, gap: 8 },
  summaryLine: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 19 },
  summaryFoot: { fontFamily: 'Inter_400Regular', fontSize: 10.5, lineHeight: 15, marginTop: 2 },
});

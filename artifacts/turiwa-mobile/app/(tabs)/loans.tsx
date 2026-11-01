import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { type Finance, Loan, useTuriwa } from '@/context/TuriwaContext';
import type { Circle } from '@/lib/api';
import { isOverdue, kesLabel, MIN_LOAN, interestLabel } from '@/lib/api';
import { quoteLoan } from '@/lib/loanMath';
import { loanTie } from '@/lib/statement';
import { BrandHeader, PrimaryButton, Screen, SectionHeading, useSheet, styles as uiStyles } from '@/components/TuriwaUI';

export default function LoansScreen() {
  const colors = useColors();
  const { isDark } = useTheme();
  const { loans, circles, finance, applyForLoan, repayLoan, approveLoan, rejectLoan, user } = useTuriwa();
  const [applicationVisible, setApplicationVisible] = useState(false);
  const [repaymentFor, setRepaymentFor] = useState<Loan | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [approvalFeedback, setApprovalFeedback] = useState<{ message: string; failed: boolean } | null>(null);
  const [approvingLoanId, setApprovingLoanId] = useState<string | null>(null);
  const [rejectingLoanId, setRejectingLoanId] = useState<string | null>(null);

  const administeredCircles = circles.filter((c) => {
    const id = user?.id;
    return id !== undefined && (c.createdBy === id || c.adminId === id || (c.coAdminIds ?? []).includes(id));
  });
  const isUserAdminOrCoAdmin = administeredCircles.length > 0;
  const administeredIds = new Set(administeredCircles.map((circle) => circle.id));
  // An admin decides on the requests that came through their own groups. A request
  // raised through someone else's group is not theirs to approve, and the button
  // would be a lie.
  const pendingApprovals = loans.filter(
    (loan) => loan.status === 'Pending' && loan.circleId !== null && administeredIds.has(loan.circleId),
  );
  const runningLoans = loans.filter((loan) => loan.status === 'Active');
  const lateLoans = runningLoans.filter((loan) => isOverdue(loan));
  // A request the member raised but cannot decide themselves still belongs on their
  // screen — otherwise it looks lost rather than waiting.
  const waitingOnOthers = loans.filter(
    (loan) => loan.status === 'Pending' && !pendingApprovals.some((item) => item.id === loan.id),
  );
  const totalBorrowed = finance.totalBorrowed;
  // What the fund could hand over today. The API refuses a loan above its own cash,
  // so this is the rule and the number on screen are the same thing.
  const lendable = finance.lendable;

  const handleApprove = async (loanId: string) => {
    if (approvingLoanId || rejectingLoanId) return;
    setApprovingLoanId(loanId);
    try {
      await approveLoan(loanId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setApprovalFeedback({ message: 'Loan approved — it now counts against the group.', failed: false });
    } catch (error) {
      // The server says why it refused, so the member reads that instead of a
      // generic failure that leaves them guessing whether the money moved.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setApprovalFeedback({
        message: error instanceof Error ? error.message : 'Could not approve that loan. Check your connection and try again.',
        failed: true,
      });
    } finally {
      setApprovingLoanId(null);
      setTimeout(() => setApprovalFeedback(null), 4000);
    }
  };

  const handleReject = async (loanId: string) => {
    if (approvingLoanId || rejectingLoanId) return;
    setRejectingLoanId(loanId);
    try {
      await rejectLoan(loanId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setApprovalFeedback({ message: 'Loan request rejected. No money moved from the group.', failed: false });
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setApprovalFeedback({
        message: error instanceof Error ? error.message : 'Could not reject that loan request. Try again.',
        failed: true,
      });
    } finally {
      setRejectingLoanId(null);
      setTimeout(() => setApprovalFeedback(null), 4000);
    }
  };

  return (
    <>
      <Screen>
        <BrandHeader title="Loans" subtitle="Access what you need, with clarity." />
        <LinearGradient
          colors={isDark ? ['#051811', '#0B2D21'] : ['#022E20', '#04432F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.creditCard, { boxShadow: colors.shadowHero }]}
        >
          <View style={[styles.creditRing, { borderColor: colors.heroBorder }]} />
          <View style={[styles.creditRingInner, { borderColor: colors.heroBorder }]} />
          <Text style={[styles.creditEyebrow, { color: colors.heroMuted }]}>CASH THE FUND CAN LEND</Text>
          <View style={styles.creditValueRow}>
            <Text style={[styles.creditCurrency, { color: colors.heroForeground }]}>KES </Text>
            <Text testID="loan-lendable" style={[styles.creditValue, { color: colors.heroForeground }]}>{kesLabel(lendable).replace('KES ', '')}</Text>
          </View>
          <View style={styles.creditFooter}>
            <View>
              <Text style={[styles.creditLabel, { color: colors.heroMuted }]}>Borrowers still owe the fund</Text>
              <Text testID="loan-outstanding" style={[styles.creditMeta, { color: colors.heroForeground }]}>
                {finance.outstanding > 0 ? `${kesLabel(finance.outstanding)} across ${runningLoans.length} running ${runningLoans.length === 1 ? 'loan' : 'loans'}` : 'Nothing borrowed yet'}
              </Text>
            </View>
            <View style={[styles.creditMark, { backgroundColor: colors.heroChip, borderColor: colors.heroBorder }]}>
              <Feather name={lendable >= MIN_LOAN ? 'check' : 'alert-circle'} size={14} color={colors.heroForeground} />
              <Text style={[styles.creditMarkText, { color: colors.heroForeground }]}>
                {lendable >= MIN_LOAN ? (lateLoans.length > 0 ? `${lateLoans.length} late` : 'Ready') : 'No cash'}
              </Text>
            </View>
          </View>
        </LinearGradient>
        <View style={styles.loanActions}>
          <View style={{ flex: 1 }}><PrimaryButton label="Request a loan" icon="plus" onPress={() => setApplicationVisible(true)} /></View>
          <Pressable onPress={() => setHistoryVisible(true)} style={({ pressed }) => [styles.historyButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Feather name="clock" size={17} color={colors.primary} /><Text style={[styles.historyText, { color: colors.primary }]}>History</Text></Pressable>
        </View>

        {/* Admin Loan Approvals Hub (Visible when user is Admin or Co-Admin) */}
        {isUserAdminOrCoAdmin ? (
          <View>
            <SectionHeading
              title={`Admin Loan Approvals (${pendingApprovals.length})`}
              action={pendingApprovals.length > 0 ? 'Action Required' : undefined}
            />
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

            {pendingApprovals.length > 0 ? (
              pendingApprovals.map((loan) => {
                const circle = circles.find((c) => c.id === loan.circleId);
                return (
                  <View key={loan.id} style={[styles.adminApprovalCard, { backgroundColor: colors.card, borderColor: colors.goldBorder }]}>
                    <View style={styles.adminApprovalTop}>
                      <View style={[styles.adminApprovalIcon, { backgroundColor: colors.goldSoft }]}>
                        <MaterialCommunityIcons name="crown" size={20} color={colors.accentForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.adminApprovalTitle, { color: colors.foreground }]} numberOfLines={1}>
                            {loan.purpose}
                          </Text>
                          <View style={[styles.adminReviewBadge, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}>
                            <Text style={[styles.adminReviewBadgeText, { color: colors.accentForeground }]}>PENDING</Text>
                          </View>
                        </View>
                        <Text style={[styles.adminApprovalMeta, { color: colors.mutedForeground }]}>
                          {circle?.name ? `${circle.name} · ` : ''}KES {loan.principal.toLocaleString()} · KES {loan.totalPayable.toLocaleString()} back · {interestLabel(loan.interestRate, loan.interestPeriod)} · KES {loan.monthlyRepayment.toLocaleString()}/mo
                        </Text>
                      </View>
                      <View style={styles.loanDecisionActions}>
                        <Pressable
                          testID={`loan-reject-${loan.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Reject ${loan.purpose}`}
                          accessibilityState={{ disabled: approvingLoanId !== null || rejectingLoanId !== null }}
                          onPress={() => handleReject(loan.id)}
                          style={({ pressed }) => [
                            styles.approveActionBtn,
                            { backgroundColor: colors.destructiveSoft, opacity: rejectingLoanId === loan.id ? 0.6 : pressed ? 0.8 : 1 },
                          ]}
                        >
                          <Feather name={rejectingLoanId === loan.id ? 'clock' : 'x'} size={13} color={colors.destructive} />
                          <Text style={[styles.approveActionText, { color: colors.destructive }]}>
                            {rejectingLoanId === loan.id ? 'Rejecting' : 'Reject'}
                          </Text>
                        </Pressable>
                        <Pressable
                          testID={`loan-approve-${loan.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Approve ${loan.purpose}`}
                          accessibilityState={{ disabled: approvingLoanId !== null || rejectingLoanId !== null }}
                          onPress={() => handleApprove(loan.id)}
                          style={({ pressed }) => [
                            styles.approveActionBtn,
                            { backgroundColor: colors.primary, opacity: approvingLoanId === loan.id ? 0.6 : pressed ? 0.8 : 1 },
                          ]}
                        >
                          <Feather name={approvingLoanId === loan.id ? 'clock' : 'check'} size={13} color={colors.primaryForeground} />
                          <Text style={[styles.approveActionText, { color: colors.primaryForeground }]}>
                            {approvingLoanId === loan.id ? 'Approving' : 'Approve'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={[styles.adminQueueClear, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="shield-check" size={18} color={colors.accent} />
                <Text style={[styles.adminQueueText, { color: colors.mutedForeground }]}>
                  Circle administration active · No pending loan requests in your circles.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        <SectionHeading
          title={runningLoans.length === 1 ? 'Your running loan' : `Your running loans (${runningLoans.length})`}
          action={lateLoans.length > 0 ? `${lateLoans.length} past due` : undefined}
        />
        {runningLoans.length > 0 ? (
          <View style={styles.loanStack}>
            {runningLoans.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                circleName={circles.find((circle) => circle.id === loan.circleId)?.name}
                returned={finance.returnedFor(loan.id)}
                onRepay={() => setRepaymentFor(loan)}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.emptyLoan, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.successSoft }]}><MaterialCommunityIcons name="hand-coin-outline" size={24} color={colors.primary} /></View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No loan is running</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
              A loan starts when the group hands over its savings, so nothing is running until a request is
              approved.
            </Text>
            <PrimaryButton label="Request a loan" icon="arrow-right" onPress={() => setApplicationVisible(true)} compact />
          </View>
        )}

        {waitingOnOthers.length > 0 ? (
          <>
            <SectionHeading title={`Waiting for a decision (${waitingOnOthers.length})`} />
            <View style={styles.loanStack}>
              {waitingOnOthers.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  circleName={circles.find((circle) => circle.id === loan.circleId)?.name}
                  returned={finance.returnedFor(loan.id)}
                />
              ))}
            </View>
          </>
        ) : null}
        <SectionHeading title="Why Turiwa loans?" />
        <View style={styles.reasons}>
          <Reason icon="eye" title="Always transparent" copy="See your interest and repayment total before you apply." />
          <Reason icon="users" title="Built around your circle" copy="Your savings history helps unlock access when you need it." />
          <Reason icon="shield" title="A clear repayment plan" copy="Track every payment and your remaining balance in one place." />
        </View>
        <View style={[styles.borrowed, { backgroundColor: colors.warmSurface }]}>
          <Feather name="bar-chart-2" size={16} color={colors.accentForeground} />
          <Text style={[styles.borrowedText, { color: colors.inkSoft }]}>
            Cash the groups have paid out as loans{' '}
            <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>KES {totalBorrowed.toLocaleString()}</Text>{' '}
            · interest agreed on top{' '}
            <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>KES {finance.interestEarned.toLocaleString()}</Text>
          </Text>
        </View>
      </Screen>
      <LoanApplicationModal visible={applicationVisible} circles={circles} finance={finance} onClose={() => setApplicationVisible(false)} onSave={applyForLoan} />
      <RepaymentModal visible={repaymentFor !== null} loan={repaymentFor ?? undefined} onClose={() => setRepaymentFor(null)} onSave={(amount) => repayLoan(amount, repaymentFor?.id)} />
      <LoanHistoryModal visible={historyVisible} loans={loans} finance={finance} onClose={() => setHistoryVisible(false)} />
    </>
  );
}

function LoanHistoryModal({ visible, loans, finance, onClose }: { visible: boolean; loans: Loan[]; finance: Finance; onClose: () => void }) {
  const colors = useColors();
  const sheet = useSheet();
  const totalBorrowed = finance.totalBorrowed;
  const totalOutstanding = finance.outstanding;
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[styles.modalEyebrow, { color: colors.primary }]}>TURIWA CREDIT</Text>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Loan history</Text>
            <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
              {loans.length} loan{loans.length === 1 ? '' : 's'} · KES {totalBorrowed.toLocaleString()} borrowed · KES {totalOutstanding.toLocaleString()} outstanding.
            </Text>
            {loans.length > 0 ? loans.map((loan) => {
              const tie = loanTie(loan, finance.returnedFor(loan.id));
              return (
                <View key={loan.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.historyRowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyPurpose, { color: colors.foreground }]}>{loan.purpose}</Text>
                      <Text style={[styles.historyMeta, { color: colors.mutedForeground }]}>{loan.status === 'Paid off' ? 'Fully repaid' : loan.status === 'Rejected' ? 'Request declined by the group' : loan.status === 'Pending' ? 'Waiting for the group to decide' : `Due ${loan.dueDate}`} · {interestLabel(loan.interestRate, loan.interestPeriod)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: loan.status === 'Active' ? colors.successSoft : loan.status === 'Pending' ? colors.warmSurface : loan.status === 'Rejected' ? colors.destructiveSoft : colors.muted }]}><Text style={[styles.statusBadgeText, { color: loan.status === 'Active' ? colors.primary : loan.status === 'Pending' ? colors.accentForeground : loan.status === 'Rejected' ? colors.destructive : colors.mutedForeground }]}>{loan.status}</Text></View>
                  </View>
                  <View style={styles.historyAmounts}>
                    <View><Text style={[styles.historyAmountLabel, { color: colors.mutedForeground }]}>{loan.status === 'Pending' ? 'REQUESTED' : 'BORROWED'}</Text><Text style={[styles.historyAmountValue, { color: colors.foreground }]}>KES {loan.principal.toLocaleString()}</Text></View>
                    <View><Text style={[styles.historyAmountLabel, { color: colors.mutedForeground }]}>REPAID</Text><Text style={[styles.historyAmountValue, { color: colors.foreground }]}>KES {tie.ledgerRepaid.toLocaleString()}</Text></View>
                    <View style={{ alignItems: 'flex-end' }}><Text style={[styles.historyAmountLabel, { color: colors.mutedForeground }]}>BALANCE</Text><Text style={[styles.historyAmountValue, { color: colors.foreground }]}>KES {loan.balance.toLocaleString()}</Text></View>
                  </View>
                  <View style={[styles.loanTrack, { backgroundColor: colors.muted }]}><View style={[styles.loanFill, { width: `${progressOf(loan) * 100}%`, backgroundColor: colors.primary }]} /></View>
                  {loan.status === 'Active' && tie.difference !== 0 ? (
                    <Text style={[styles.tieNote, { color: colors.destructive }]}>
                      The repayment rows for this loan add up to KES {tie.ledgerRepaid.toLocaleString()}, while its
                      balance implies KES {tie.onRecord.toLocaleString()} came back — a KES{' '}
                      {Math.abs(tie.difference).toLocaleString()} difference to check with the treasurer.
                    </Text>
                  ) : null}
                </View>
              );
            }) : (
              <View style={[uiStyles.detailEmptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}><Feather name="clock" size={22} color={colors.primary} /><Text style={[uiStyles.detailEmptyTitle, { color: colors.foreground }]}>No loans yet</Text><Text style={[uiStyles.detailEmpty, { color: colors.mutedForeground }]}>When you borrow, every loan and repayment will be listed here.</Text></View>
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

/** What the loan's own balance implies has been paid, against its agreed total,
 *  held between 0 and 1. A balance written above the total — which older records
 *  can hold — would otherwise give a bar a negative width. */
function progressOf(loan: Loan) {
  if (loan.totalPayable <= 0) return 0;
  const paid = Math.max(loan.totalPayable - loan.balance, 0);
  return Math.min(Math.max(paid / loan.totalPayable, 0), 1);
}

function LoanCard({ loan, circleName, returned, onRepay }: { loan: Loan; circleName?: string; returned: number; onRepay?: () => void }) {
  const colors = useColors();
  const progress = progressOf(loan);
  const tie = loanTie(loan, returned);
  const pending = loan.status === 'Pending';
  const late = isOverdue(loan);
  return (
    <View style={[styles.loanCard, { backgroundColor: colors.card, borderColor: late ? colors.destructive : colors.border }]}>
      <View style={styles.loanCardTop}>
        <View style={[styles.loanIcon, { backgroundColor: pending ? colors.warmSurface : colors.successSoft }]}>
          <MaterialCommunityIcons name={pending ? 'file-clock-outline' : 'hand-coin-outline'} size={22} color={pending ? colors.accentForeground : colors.primary} />
        </View>
        <View style={styles.loanTitleWrap}>
          <Text style={[styles.loanName, { color: colors.foreground }]}>{loan.purpose}</Text>
          <Text style={[styles.loanMeta, { color: colors.mutedForeground }]}>
            {`${circleName ? `${circleName} · ` : 'No group on this record · '}${pending ? 'Waiting for an admin to approve' : late ? `Past due since ${loan.dueDate}` : `Due ${loan.dueDate}`}`}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: pending ? colors.warmSurface : late ? colors.destructiveSoft : colors.successSoft }]}>
          <Text style={[styles.statusBadgeText, { color: pending ? colors.accentForeground : late ? colors.destructive : colors.primary }]}>
            {pending ? 'PENDING' : late ? 'PAST DUE' : 'RUNNING'}
          </Text>
        </View>
      </View>

      {/* The three figures a borrower actually agreed to, kept apart rather than
          collapsed into one number: what arrived, what interest added, what is owed. */}
      <View style={[styles.historyAmounts, { marginTop: 16 }]}>
        <View>
          <Text style={[styles.historyAmountLabel, { color: colors.mutedForeground }]}>{pending ? 'REQUESTED' : 'PAID OUT'}</Text>
          <Text style={[styles.historyAmountValue, { color: colors.foreground }]}>KES {loan.principal.toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.historyAmountLabel, { color: colors.mutedForeground }]}>+ INTEREST</Text>
          <Text style={[styles.historyAmountValue, { color: colors.foreground }]}>KES {Math.max(loan.totalPayable - loan.principal, 0).toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.historyAmountLabel, { color: colors.mutedForeground }]}>= TO PAY BACK</Text>
          <Text style={[styles.historyAmountValue, { color: colors.foreground }]}>KES {loan.totalPayable.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.balanceRow}>
        <View>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>{pending ? 'Would still owe' : 'Remaining balance'}</Text>
          <Text style={[styles.balanceValue, { color: colors.foreground }]}>KES {(pending ? loan.totalPayable : loan.balance).toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>Monthly repayment</Text>
          <Text style={[styles.monthlyValue, { color: colors.foreground }]}>KES {loan.monthlyRepayment.toLocaleString()}</Text>
        </View>
      </View>
      {pending ? null : (
        <>
          <View style={[styles.loanTrack, { backgroundColor: colors.muted }]}><View style={[styles.loanFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} /></View>
          <View style={styles.loanProgressRow}>
            <Text style={[styles.loanProgressText, { color: colors.mutedForeground }]}>{Math.round(progress * 100)}% repaid</Text>
            <Text style={[styles.loanProgressText, { color: colors.mutedForeground }]}>{interestLabel(loan.interestRate, loan.interestPeriod)} · {loan.months} months</Text>
          </View>
          <Text style={[styles.tieNote, { color: tie.difference === 0 ? colors.mutedForeground : colors.destructive }]}>
            {tie.difference === 0
              ? `KES ${tie.ledgerRepaid.toLocaleString()} of repayments recorded in the ledger — the loan and the ledger agree.`
              : `The ledger holds KES ${tie.ledgerRepaid.toLocaleString()} of repayments for this loan, while its balance implies KES ${tie.onRecord.toLocaleString()}. A KES ${Math.abs(tie.difference).toLocaleString()} difference to check.`}
          </Text>
        </>
      )}
      {onRepay ? (
        <PrimaryButton label="Make a repayment" icon="arrow-up-right" onPress={onRepay} compact />
      ) : (
        <Text style={[styles.pendingNote, { color: colors.mutedForeground }]}>
          An admin of {circleName ?? 'the group'} approves this request. Nothing has left the fund yet, so the money
          is still everyone's savings.
        </Text>
      )}
    </View>
  );
}

function Reason({ icon, title, copy }: { icon: keyof typeof Feather.glyphMap; title: string; copy: string }) {
  const colors = useColors();
  return <View style={[styles.reason, { borderBottomColor: colors.border }]}><View style={[styles.reasonIcon, { backgroundColor: colors.successSoft }]}><Feather name={icon} size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.reasonTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.reasonCopy, { color: colors.mutedForeground }]}>{copy}</Text></View></View>;
}

function LoanApplicationModal({ visible, onClose, onSave, circles, finance }: { visible: boolean; onClose: () => void; onSave: (amount: number, purpose: string, circleId?: string) => Promise<void>; circles: Circle[]; finance: Finance }) {
  const colors = useColors();
  const sheet = useSheet();
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [circleId, setCircleId] = useState<string | undefined>(undefined);
  React.useEffect(() => {
    if (visible) setCircleId(circles[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const selected = circles.find((item) => item.id === circleId) ?? circles[0];
  // The ceiling is one group's own cash — the same figure the API refuses a loan
  // above — not a credit score or a limit nobody can point at in the ledger.
  const ceiling = selected ? Math.max(finance.savedFor(selected.id), 0) : 0;
  const requested = Number(amount) || 0;
  const rate = selected?.loanInterestPercent ?? 5;
  const period = selected?.loanInterestPeriod ?? 'Month';
  const quote = quoteLoan(requested, rate, period);
  const valid = selected !== undefined && requested >= MIN_LOAN && requested <= ceiling && purpose.trim().length > 0;
  const submit = async () => {
    if (!valid || !selected) return;
    await onSave(requested, purpose, selected.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAmount('');
    setPurpose('');
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={sheet.handle} />
            <Text style={[styles.modalEyebrow, { color: colors.primary }]}>TURIWA CREDIT</Text>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>How much do you need?</Text>
            <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
              {selected === undefined
                ? "A Turiwa loan comes out of a group's own savings, so you need a group before you can ask for one."
                : ceiling >= MIN_LOAN
                  ? `${selected.name} holds KES ${ceiling.toLocaleString()} in its ledger. You can ask for between KES ${MIN_LOAN.toLocaleString()} and that. Your interest and total are shown upfront.`
                  : `${selected.name} holds KES ${ceiling.toLocaleString()}, which is less than the smallest loan of KES ${MIN_LOAN.toLocaleString()}. The group cannot hand out cash it has not received.`}
            </Text>
            {circles.length > 1 ? (
              <>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Borrow through</Text>
                <View style={uiStyles.circlePicker}>
                  {circles.map((item) => {
                    const active = item.id === selected?.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setCircleId(item.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [uiStyles.circleChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.successSoft : colors.background, opacity: pressed ? 0.75 : 1 }]}
                      >
                        <Text style={[uiStyles.circleChipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                          {item.name} · KES {Math.max(finance.savedFor(item.id), 0).toLocaleString()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
            <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Amount</Text>
            <View style={[styles.amountWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.currency, { color: colors.primary }]}>KES</Text>
              <TextInput testID="loan-amount" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Loan amount" style={[styles.amountInput, { color: colors.foreground }]} />
            </View>
            <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>What is it for?</Text>
            <TextInput testID="loan-purpose" value={purpose} onChangeText={setPurpose} placeholder="e.g. School fees" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Loan purpose" style={[styles.textInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <View style={[styles.feePreview, { backgroundColor: colors.successSoft }]}>
              <Feather name="percent" size={15} color={colors.primary} />
              <Text style={[styles.feePreviewText, { color: colors.primary }]}>
                {selected ? `${selected.name} lends at ${interestLabel(rate, period)}, compounded over ${quote.months} months` : `No group yet · ${interestLabel(rate, period)} applies`}
                {requested >= MIN_LOAN ? ` · you would repay KES ${quote.totalPayable.toLocaleString()}: KES ${quote.monthlyRepayment.toLocaleString()} a month, then KES ${quote.finalRepayment.toLocaleString()} at the end` : ''}
              </Text>
            </View>
            <Text style={[styles.validation, { color: colors.destructive }]}>
              {requested > ceiling ? `${selected?.name ?? 'That group'} holds KES ${ceiling.toLocaleString()}. A loan above that would leave its balance describing cash nobody can pay out.` : ''}
            </Text>
            <Text style={[styles.pendingNote, { color: colors.mutedForeground }]}>
              An admin of {selected?.name ?? 'your group'} approves this request before any money moves. Until then it
              is a question, not a debt.
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={onClose} style={[styles.cancelButton, { borderColor: colors.border }]}>
                <Text style={[styles.cancelText, { color: colors.inkSoft }]}>Cancel</Text>
              </Pressable>
              <View style={{ flex: 1 }}><PrimaryButton label="Review request" icon="arrow-right" onPress={submit} /></View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RepaymentModal({ visible, loan, onClose, onSave }: { visible: boolean; loan?: Loan; onClose: () => void; onSave: (amount: number) => Promise<void> }) {
  const colors = useColors();
  const sheet = useSheet();
  const [amount, setAmount] = useState('');
  const balance = loan?.balance ?? 0;
  const monthly = loan?.monthlyRepayment ?? 0;
  // Six rounded instalments overshoot the agreed total, so the last one is smaller.
  // Asking for the full instalment at the end would hand the group money nobody owes.
  const finalRepayment = loan && loan.months > 1 ? Math.max(loan.totalPayable - monthly * (loan.months - 1), 0) : monthly;
  const instalmentsLeft = monthly > 0 && balance > 0 ? Math.ceil(balance / monthly) : 0;
  React.useEffect(() => {
    if (visible && loan) setAmount(String(Math.min(loan.monthlyRepayment, loan.balance)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const requested = Number(amount) || 0;
  const valid = requested > 0 && requested <= balance;
  const submit = async () => {
    if (!valid) return;
    await onSave(requested);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAmount('');
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <View style={sheet.handle} />
          <Text style={[styles.modalEyebrow, { color: colors.primary }]}>REPAYMENT</Text>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Make a repayment</Text>
          <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
            Your remaining balance is KES {balance.toLocaleString()}
            {instalmentsLeft > 0 ? ` — about ${instalmentsLeft} more ${instalmentsLeft === 1 ? 'repayment' : 'repayments'} of KES ${monthly.toLocaleString()}.` : '.'}
          </Text>
          <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Amount</Text>
          <View style={[styles.amountWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.currency, { color: colors.primary }]}>KES</Text>
            <TextInput testID="repayment-amount" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={`${monthly}`} placeholderTextColor={colors.mutedForeground} accessibilityLabel="Repayment amount" style={[styles.amountInput, { color: colors.foreground }]} />
          </View>
          {finalRepayment !== monthly && balance > 0 ? (
            <Text style={[styles.pendingNote, { color: colors.mutedForeground }]}>
              Your last repayment is KES {Math.min(finalRepayment, balance).toLocaleString()}, not KES{' '}
              {monthly.toLocaleString()} — the earlier rounded instalments already cover the rest of the agreed total.
            </Text>
          ) : null}
          <Text style={[styles.validation, { color: colors.destructive }]}>
            {requested > balance ? `The most you owe is KES ${balance.toLocaleString()}. Anything above that is not a debt the group is holding.` : ''}
          </Text>
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.cancelButton, { borderColor: colors.border }]}>
              <Text style={[styles.cancelText, { color: colors.inkSoft }]}>Cancel</Text>
            </Pressable>
            <View style={{ flex: 1 }}><PrimaryButton label="Confirm repayment" icon="check" onPress={submit} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  creditCard: { borderRadius: 24, padding: 22, minHeight: 180, overflow: 'hidden' },
  creditRing: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 1, right: -65, top: -75, opacity: 0.5 },
  creditRingInner: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 1, right: -30, top: -40, opacity: 0.3 },
  creditEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10.5, letterSpacing: 1.8 },
  creditValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  creditCurrency: { fontFamily: 'Inter_600SemiBold', fontSize: 16, letterSpacing: 0.5, opacity: 0.8 },
  creditValue: { fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1 },
  creditFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 22 },
  creditLabel: { fontFamily: 'Inter_400Regular', fontSize: 10.5 },
  creditMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  creditMark: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  creditMarkText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  loanActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  historyButton: { flex: 0.42, borderWidth: 1, borderRadius: 14, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  historyText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  loanStack: { gap: 10 },
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
  tieNote: { fontFamily: 'Inter_500Medium', fontSize: 10.5, lineHeight: 15, marginTop: 2, marginBottom: 12 },
  pendingNote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 8, marginBottom: 12 },
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
  historyRow: { borderBottomWidth: 1, paddingVertical: 15 },
  historyRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyPurpose: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  historyMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  historyAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  historyAmountLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  historyAmountValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 5 },
  modalEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.7, marginBottom: 9 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 20 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 8, marginTop: 10 },
  amountWrap: { borderWidth: 1, height: 55, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  currency: { fontFamily: 'Inter_700Bold', fontSize: 13, marginRight: 12 },
  amountInput: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 21 },
  textInput: { borderWidth: 1, height: 52, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 },
  validation: { fontFamily: 'Inter_400Regular', fontSize: 11, minHeight: 16, marginTop: 6 },
  feePreview: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginTop: 14 },
  feePreviewText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11.5, lineHeight: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  cancelButton: { height: 49, paddingHorizontal: 17, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  // Admin Approvals Hub Styles
  feedbackBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  feedbackText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  adminApprovalCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 10 },
  adminApprovalTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adminApprovalIcon: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  adminApprovalTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  adminApprovalMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4, lineHeight: 16 },
  adminReviewBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  adminReviewBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 8.5, letterSpacing: 0.8 },
  approveActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 },
  loanDecisionActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  approveActionText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  adminQueueClear: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 10 },
  adminQueueText: { fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1, lineHeight: 17 },
});

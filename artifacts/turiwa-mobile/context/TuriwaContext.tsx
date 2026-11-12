import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '@/lib/api';
import { LOAN_MONTHS } from '@/lib/loanMath';
import type { AppNotification, AuthUser, Circle, CircleMember, CircleRole, Contribution, ContributionMetadata, GroupDraft, LedgerEntry, LedgerType, Loan, NotificationPreferencePatch, NotificationPreferenceRow } from '@/lib/api';

export type { AppNotification, AuthUser, Circle, CircleMember, CircleRole, Contribution, ContributionMetadata, GroupDraft, LedgerEntry, LedgerType, Loan, NotificationPreferencePatch, NotificationPreferenceRow };

type StoredAuth = {
  signedIn?: boolean;
  token?: string | null;
  user?: AuthUser | null;
  name?: string;
};

/**
 * The money figures every screen shares. Home, Loans and Activity all read this
 * so the same contribution or loan can never add up to two different numbers.
 *
 * Every figure comes off the ledger, and the ledger is built so that one identity
 * always holds: the fund's cash is what came in, less what it spent, less what it
 * set aside, less what it handed out as loans. Contributions alone cannot equal
 * that cash once anything has been spent or lent — so the screens say which of the
 * four each number is, and a loan's money is in the ledger rather than off in a
 * separate table nobody totals.
 */
export type Finance = {
  /** What members have paid into the fund. */
  contributed: number;
  /** What borrowers have paid back. */
  repaid: number;
  /** Money members handed over as late-contribution fines. */
  fines: number;
  /** Money in: contributions, repayments and fines together. */
  inflow: number;
  /** Money the group spent. */
  outflow: number;
  /** Money the group still holds, earmarked as welfare. */
  setAside: number;
  /** Money the group handed over as loans. */
  paidOut: number;
  /** Money still away with borrowers: paid out less what has come back. */
  lentOut: number;
  openLoans: Loan[];
  /** What borrowers still owe, interest included. Not the same as `lentOut`, which
   *  is the group's own cash and carries no interest. */
  outstanding: number;
  /** The fund's cash — the ledger read as one running total. */
  netBalance: number;
  /** The most the fund could hand over today: cash it actually holds. */
  lendable: number;
  /** Ledger rows whose group is not in this account's list, kept in the totals and
   *  shown as its own bucket so the groups always add up to the fund. */
  unassigned: number;
  /** What members handed in during the current calendar month — the receipts the
   *  monthly plan predicts, so the two are the same kind of money. */
  contributedThisMonth: number;
  /** What the group agreed to take in a month: every member's cycle amount, per month. */
  plannedThisMonth: number;
  /** One group's own receipts this calendar month, so a group's progress is read
   *  against what it collected and not the fund's total. */
  contributedForThisMonth: (circleId: string) => number;
  /** Running loans whose recorded due day has passed. A loan with no due day is not
   *  here: the record does not say, and silence is not a verdict. */
  overdueLoans: Loan[];
  /** What those loans still owe, interest included. */
  overdueOwed: number;
  /** Loans the app cannot place in a group, so their cash sits in no group ledger.
   *  The fund total still carries them; only the per-group split cannot. */
  unlinkedLoans: Loan[];
  /** KES by which a loan's own balance and the repayment rows it wrote disagree.
   *  Zero means the loan table and the ledger tell the same story. */
  loanGaps: number;
  /** What the loans have grown to above what they borrowed. */
  interestEarned: number;
  totalBorrowed: number;
  savedFor: (circleId: string) => number;
  /** What the ledger says a loan has taken back. A loan's own balance says the same
   *  thing from the other side; the loan screen shows the two together. */
  returnedFor: (loanId: string) => number;
};

type TuriwaContextValue = {
  circles: Circle[];
  contributions: Contribution[];
  loans: Loan[];
  finance: Finance;
  /** The circle the scoped screens read right now; null when this account has none. */
  activeCircle: Circle | null;
  activeCircleId: string;
  /** This account's role inside `activeCircle` only. Roles do not travel between circles. */
  activeRole: CircleRole | null;
  /** The active circle's own ledger figures; null while no circle is active. */
  activeFinance: Finance | null;
  /** Unread messages counted per circle, so a list can say where something is waiting. */
  unreadByCircle: Record<string, number>;
  /** Make another circle active. Resolves false when this account cannot use it. */
  setActiveCircle: (circleId: string) => Promise<boolean>;
  notifications: AppNotification[];
  unreadCount: number;
  notificationPreferences: NotificationPreferenceRow[];
  refreshNotifications: (force?: boolean) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  saveNotificationPreferences: (patch: NotificationPreferencePatch) => Promise<void>;
  authHydrated: boolean;
  signedIn: boolean;
  profileName: string;
  user: AuthUser | null;
  live: boolean;
  /** Why the app is not showing the database's figures right now, empty while all is well. */
  liveError: string;
  refreshing: boolean;
  refresh: () => Promise<void>;
  addContribution: (amount: number, note: string, circleId?: string, entry?: LedgerEntry, metadata?: ContributionMetadata) => Promise<void>;
  createCircle: (draft: GroupDraft) => Promise<void>;
  joinCircle: (code: string) => Promise<void>;
  deleteCircle: (circleId: string) => Promise<void>;
  setCircleFine: (circleId: string, lateFine: number) => Promise<void>;
  applyFine: (circleId: string, memberId: string) => Promise<void>;
  applyForLoan: (amount: number, purpose: string, circleId: string, preferredMonths: number, applicationKey?: string) => Promise<void>;
  repayLoan: (amount: number, loanId?: string, idempotencyKey?: string, audit?: { method?: string; reference?: string }) => Promise<void>;
  approveLoan: (loanId: string, terms: { amount: number; months: number; interestRate: number }) => Promise<void>;
  rejectLoan: (loanId: string, reason: string) => Promise<void>;
  removeCircleMember: (circleId: string, memberId: string) => Promise<void>;
  setCircleMemberRole: (circleId: string, memberId: string, role: 'member' | 'co-admin') => Promise<void>;
  transferPrimaryAdmin: (circleId: string, memberId: string) => Promise<void>;
  signIn: (phone: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  createAccount: (name: string, phone: string, password: string, verificationToken: string, signal?: AbortSignal) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  activateTwoFactor: (code: string) => Promise<string[]>;
  disableTwoFactor: (code: string, password?: string) => Promise<void>;
  deleteAccount: (password: string, code: string) => Promise<void>;
  nextStopAfterAuth: () => Promise<'/(tabs)' | '/(onboarding)/create-group'>;
  hydrated: boolean;
};

const AUTH_KEY = '@turiwa/auth';

type SessionScope = { generation: number; token: string | null; user: AuthUser | null; stateReceived?: boolean };

// Storage writes cannot be cancelled once dispatched. Serialise them so a logout,
// account deletion or newer session is always written after an older in-flight write.
let storageWrites: Promise<void> = Promise.resolve();
function writeStorage(write: () => Promise<void>): Promise<void> {
  const next = storageWrites.then(write);
  storageWrites = next.catch(() => {});
  return next;
}

function cacheKey(userId: string, name: 'circles' | 'contributions' | 'loans' | 'active-circle') {
  return `@turiwa/${userId}/${name}`;
}
const LEGACY_CACHE_KEYS = ['@turiwa/circles', '@turiwa/contributions', '@turiwa/loans'];

/**
 * This account's standing inside one circle, or null when it has no standing there.
 *
 * Membership is a fact about one circle and nothing else, so it is read from that
 * circle's own record: the person who opened it, otherwise their row on its roster.
 * A circle's answer is never carried over to another one, and a roster row that is
 * pending or removed does not grant a role.
 */
export function circleAccess(circle: Circle, userId: string): { role: CircleRole; status: CircleMember['status'] } | null {
  if (!userId) return null;
  if (circle.createdBy === userId) return { role: 'admin', status: 'active' };
  const member = circle.membersList?.find((row) => row.id === userId);
  if (!member) return null;
  return { role: member.role ?? 'member', status: member.status ?? 'active' };
}

/**
 * Whether this account may decide on a circle's loan requests.
 *
 * This is the same reading the API applies to every loan call: the person who opened the
 * circle, otherwise an active roster row carrying admin or co-admin. Screen buttons are
 * derived from it so a manager is never shown a review they would be refused, and never
 * hidden from a decision the group would accept. A role in a request body counts for
 * nothing here or on the server.
 */
export function canManageCircle(circle: Circle, userId: string): boolean {
  const access = circleAccess(circle, userId);
  return access !== null && access.status === 'active' && (access.role === 'admin' || access.role === 'co-admin');
}
const TuriwaContext = createContext<TuriwaContextValue | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

// A member exactly as the account stored them. Nothing here is invented: a group
// with no saved roster has no members to show, and the screens say so.
function displayName(name: string, user: AuthUser | null): string {
  const trimmed = name.trim();
  const mine = (user?.name ?? '').trim().toLowerCase();
  if (mine && trimmed.toLowerCase() === 'you') return mine;
  return trimmed;
}

function membersFrom(raw: Partial<Circle>, user: AuthUser | null): CircleMember[] {
  return (raw.membersList ?? [])
    .filter((member) => member && typeof member.name === 'string' && member.name.trim() !== '')
    .map((member) => ({
      ...member,
      name: displayName(member.name, user),
      role: member.role ?? (member.id && member.id === raw.createdBy ? 'admin' : 'member'),
      // Rows stored before invites had a state are people the group already has.
      status: member.status ?? 'active',
    }));
}

function normalizeCircle(raw: Partial<Circle> & { monthly?: number }, user: AuthUser | null): Circle {
  const membersList = membersFrom(raw, user);
  const active = membersList.filter((member) => member.status === 'active').length;

  return {
    id: raw.id ?? '',
    joinCode: raw.joinCode ?? '',
    name: raw.name ?? '',
    // Someone the app cannot name is not a member, and an invite nobody has
    // answered is not either, so the headcount is the active roster.
    members: active,
    pendingInvites: membersList.filter((member) => member.status === 'pending').length,
    target: raw.target ?? 0,
    contribution: raw.contribution ?? raw.monthly ?? 0,
    frequency: raw.frequency ?? 'Monthly',
    joiningFee: raw.joiningFee ?? 0,
    welfare: raw.welfare ?? 0,
    // A group opened before fines existed charges none, which is what zero means.
    lateFine: raw.lateFine ?? 0,
    cycleStart: raw.cycleStart,
    loanInterestPercent: raw.loanInterestPercent ?? 5,
    loanInterestPeriod: raw.loanInterestPeriod ?? 'Month',
    createdBy: raw.createdBy ?? null,
    // Only the record of who opened the group makes somebody an admin. Falling back
    // to the viewer would hand the admin badge, the approvals hub and "you decide on
    // these" to whoever happens to be looking at a group whose founder is unrecorded.
    adminId: raw.createdBy ?? '',
    coAdminIds: membersList.filter((member) => member.status === 'active' && member.role === 'co-admin').map((member) => member.id),
    membersList,
    color: raw.color ?? 'green',
  };
}

// Ledger rows cached before a field the arithmetic reads existed come back from storage
// without it. `createdAt` is what places a row in a month, so an old row is given an
// empty one: it then belongs to no period, which the record genuinely does not say,
// rather than being guessed into the current month or crashing the screen.
function normalizeContribution(raw: Partial<Contribution>): Contribution {
  return {
    // Preserve unknown/missing kinds, never invent a Contribution from an old row.
    ...(raw as Contribution),
    createdAt: raw.createdAt ?? '',
    attributedMemberId: raw.attributedMemberId ?? null,
  };
}

// Loans cached before compounding carried no total, and their balance counted down
// from the principal alone. Reading them through this keeps the repayment bar sane.
function normalizeLoan(loan: Loan): Loan {
  // `??` and not `||`, because a paid-off loan's balance is zero: reading that as
  // "missing" hands the whole amount back to a screen that also says it was repaid.
  const totalPayable = loan.totalPayable ?? loan.principal;
  return {
    ...loan,
    applicantId: loan.applicantId ?? null,
    applicantName: loan.applicantName ?? 'You',
    requestedPrincipal: loan.requestedPrincipal ?? loan.principal,
    totalPayable,
    months: loan.months || LOAN_MONTHS,
    requestedMonths: loan.requestedMonths || loan.months || LOAN_MONTHS,
    interestPeriod: loan.interestPeriod ?? 'Month',
    balance: Math.min(loan.balance ?? totalPayable, totalPayable),
    // A loan cached by an older build has no machine-readable due day. Keeping it null
    // means "the record does not say", which is not the same as "it is late".
    dueOn: loan.dueOn ?? null,
    submittedAt: loan.submittedAt ?? '',
    reviewedBy: loan.reviewedBy ?? null,
    reviewerName: loan.reviewerName ?? null,
    reviewedAt: loan.reviewedAt ?? null,
    rejectionReason: loan.rejectionReason ?? null,
  };
}

// The whole money model in one place: pick the rows, get the figures. Running it over
// one circle's rows is what keeps that circle's totals from ever being read as another
// circle's, and running it over every row is the fund view the statement keeps.
function buildFinance(circles: Circle[], contributions: Contribution[], loans: Loan[]): Finance {
  const completed = contributions.filter((item) => item.status === 'Complete' && api.LEDGER_TYPES.includes(item.type));
  const kind = (item: Contribution) => item.type;
  const total = (items: Contribution[]) => items.reduce((sum, item) => sum + item.amount, 0);
  const ofKind = (test: (type: api.LedgerType) => boolean) => total(completed.filter((item) => test(kind(item))));
  const contributed = ofKind((type) => type === 'Contribution');
  const repaid = ofKind((type) => type === 'Repayment');
  const fines = ofKind((type) => type === 'Fine');
  const outflow = ofKind(api.isOutflow);
  const setAside = ofKind(api.isSetAside);
  const paidOut = ofKind(api.isLentOut);
  // Money in is what the fund received: what members paid, what borrowers gave
  // back and the fines members handed over. Named kinds only, so a kind added
  // later cannot quietly count as cash in.
  const inflow = contributed + repaid + fines;
  // The fund's cash, read as the sum of the ledger. Nothing else is subtracted:
  // what borrowers still owe (`outstanding`) is a claim on the future, not money in
  // the tin now, and the cash a loan handed over is already a row.
  const netBalance = inflow - outflow - setAside - paidOut;
  // A loan only stops tying up the fund once it is repaid, so the outstanding
  // figure covers every group loan still open rather than just the first one.
  const openLoans = loans.filter((loan) => loan.status === 'Active' || loan.status === 'Pending');
  // Only money that actually left the fund is owed to it. A request nobody has
  // approved is a question, not a debt, so it never enters this total.
  const outstanding = loans
    .filter((loan) => loan.status === 'Active')
    .reduce((sum, loan) => sum + loan.balance, 0);
  const byCircle = new Map<string, number>();
  for (const item of completed) {
    byCircle.set(item.circleId, (byCircle.get(item.circleId) ?? 0) + api.entryDelta(kind(item)) * item.amount);
  }
  // A row whose group is not in this account's list is still the account's ledger,
  // so it stays in the totals and is shown as its own bucket: leaving it out would
  // break the one identity every screen is built on, that the groups add up to the
  // fund. It happens when a cache holds a row for a group since deleted.
  const known = new Set(circles.map((circle) => circle.id));
  const unassigned = [...byCircle.entries()]
    .filter(([circleId]) => !known.has(circleId))
    .reduce((sum, [, value]) => sum + value, 0);
  // What the ledger says each loan moved. The loan's own balance is one figure and
  // its rows are another; the loan screen shows both and says when they disagree,
  // instead of picking one and calling it fact.
  const paidByLoan = new Map<string, number>();
  const returnedByLoan = new Map<string, number>();
  for (const item of completed) {
    if (!item.loanId) continue;
    const bucket = api.isLentOut(kind(item)) ? paidByLoan : returnedByLoan;
    bucket.set(item.loanId, (bucket.get(item.loanId) ?? 0) + item.amount);
  }
  const month = api.currentMonthKey();
  // The plan is what members agreed to hand in, so the month's answer is its
  // contribution rows only. An expense or a disbursed loan is money leaving the
  // fund — a net movement can go negative and still sit under the word "received",
  // which is how a plan comparison ends up reading "-KES 4,866 received".
  const contributedIn = (item: Contribution) =>
    api.monthKey(item) === month && kind(item) === 'Contribution';
  const contributedThisMonth = contributions
    .filter(contributedIn)
    .reduce((sum, item) => sum + item.amount, 0);
  // The same receipts, split by group, so "is this group on track" is answered with
  // its own collection rather than the fund's total.
  const inMonth = new Map<string, number>();
  for (const item of completed) {
    if (!contributedIn(item)) continue;
    inMonth.set(item.circleId, (inMonth.get(item.circleId) ?? 0) + item.amount);
  }
  // A loan's balance and the rows that loan wrote are two accounts of the same money.
  // They only disagree when one side was written without the other, so the gap is the
  // figure the treasurer has to check, and the loans with no group are cash no ledger
  // carries at all.
  let loanGaps = 0;
  const overdueLoans: Loan[] = [];
  const unlinkedLoans: Loan[] = [];
  // A request nobody has approved has no balance to be late on and no rows to
  // disagree with, so only a running loan can show up here.
  for (const loan of loans) {
    if (loan.status !== 'Active') continue;
    if (api.isOverdue(loan)) overdueLoans.push(loan);
    if (!loan.circleId) {
      unlinkedLoans.push(loan);
      continue;
    }
    loanGaps += Math.abs(api.repaidOnRecord(loan) - (returnedByLoan.get(loan.id) ?? 0));
  }
  return {
    contributed,
    repaid,
    fines,
    inflow,
    outflow,
    setAside,
    paidOut,
    lentOut: paidOut - repaid,
    openLoans,
    outstanding,
    netBalance,
    // The most the fund could hand over is the cash it is holding. This is the same
    // number the API refuses a loan above, so the figure on screen and the rule that
    // enforces it cannot disagree.
    lendable: Math.max(netBalance, 0),
    unassigned,
    contributedThisMonth,
    overdueLoans,
    overdueOwed: overdueLoans.reduce((sum, loan) => sum + loan.balance, 0),
    unlinkedLoans,
    loanGaps,
    plannedThisMonth: circles.reduce((sum, circle) => sum + api.plannedPerMonth(circle), 0),
    // Only loans that actually took cash earn anything: a request the group has
    // not decided on is a quote, not money the fund moved.
    interestEarned: loans
      .filter((loan) => loan.status === 'Active' || loan.status === 'Paid off')
      .reduce((sum, loan) => sum + (loan.totalPayable - loan.principal), 0),
    // Money actually borrowed, so a request nobody has approved is not counted as
    // cash the member has taken.
    totalBorrowed: loans
      .filter((loan) => loan.status === 'Active' || loan.status === 'Paid off')
      .reduce((sum, loan) => sum + loan.principal, 0),
    savedFor: (circleId: string) => byCircle.get(circleId) ?? 0,
    contributedForThisMonth: (circleId: string) => inMonth.get(circleId) ?? 0,
    returnedFor: (loanId: string) => returnedByLoan.get(loanId) ?? 0,
  };
}

export function TuriwaProvider({ children }: { children: React.ReactNode }) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [activeCircleId, setActiveCircleId] = useState('');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferenceRow[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [live, setLive] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const userId = user?.id ?? '';
  const profileName = user?.name ?? 'Member';

  const mounted = useRef(false);
  const sessionRef = useRef<SessionScope>({ generation: 0, token: api.getAuthToken(), user: null });
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const authAttempt = useRef(0);
  const stateRevision = useRef(0);
  const lastNotificationFetch = useRef(0);
  // Rendered callbacks keep their original owner; never capture the new account
  // after awaiting an old account's request.
  const scope = sessionRef.current;
  const isCurrent = useCallback((owner: SessionScope) =>
    mounted.current && owner.generation === sessionRef.current.generation &&
    owner.token === api.getAuthToken() && owner.user?.id === sessionRef.current.user?.id, []);
  const hasSession = (owner: SessionScope) => isCurrent(owner) && !!owner.token && !!owner.user?.id;

  const persistAuth = (next: StoredAuth, owner: SessionScope) => writeStorage(async () => {
    if (isCurrent(owner)) await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
  });

  const runForSession = async <T,>(
    owner: SessionScope,
    request: () => Promise<T>,
    apply?: (result: T) => void | Promise<void>,
  ): Promise<T | undefined> => {
    if (!hasSession(owner)) return;
    try {
      const result = await request();
      if (!hasSession(owner)) return;
      await apply?.(result);
      return hasSession(owner) ? result : undefined;
    } catch (err) {
      if (hasSession(owner)) throw err;
    }
  };

  // The inbox and its throttle belong to a session just like the ledger does.
  const refreshNotificationsFor = useCallback(async (owner: SessionScope, force = false) => {
    if (!isCurrent(owner) || !owner.token || !owner.user?.id) return;
    const now = Date.now();
    if (!force && now - lastNotificationFetch.current < 10_000) return;
    lastNotificationFetch.current = now;
    try {
      const centre = await api.fetchNotifications();
      if (!isCurrent(owner)) return;
      setNotifications(centre.notifications);
      setUnreadCount(centre.unreadCount);
      setNotificationPreferences(centre.preferences);
    } catch {
      // Retain this account's list while offline; stale errors have no side effects.
    }
  }, [isCurrent]);
  const refreshNotifications = (force = false) => refreshNotificationsFor(scope, force);

  const markNotificationRead = async (notificationId: string) => {
    if (!hasSession(scope)) return;
    const target = notifications.find((item) => item.id === notificationId);
    setNotifications((prev) => prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
    if (target && !target.read) setUnreadCount((count) => Math.max(count - 1, 0));
    try {
      await api.markNotificationRead(notificationId);
    } catch {
      // The optimistic mark is undone by the next fetch, which reads the server.
    }
  };

  const markAllNotificationsRead = async () => {
    if (!hasSession(scope)) return;
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      // Nothing to undo locally: the next fetch decides what is actually read.
    }
  };

  const saveNotificationPreferences = async (patch: NotificationPreferencePatch) => {
    await runForSession(scope, () => api.saveNotificationPreferences(patch), () => refreshNotificationsFor(scope, true));
  };

  const applyState = async (state: api.AppState, owner: SessionScope) => {
    if (!hasSession(owner)) return;
    const id = owner.user!.id;
    const normalizedCircles = state.circles.map((c) => normalizeCircle(c, owner.user));
    const normalizedLoans = state.loans.map(normalizeLoan);
    const normalizedRows = state.contributions.map(normalizeContribution);
    owner.stateReceived = true;
    stateRevision.current += 1;
    setCircles(normalizedCircles);
    setContributions(normalizedRows);
    setLoans(normalizedLoans);
    setLive(true);
    setLiveError('');
    void refreshNotificationsFor(owner);
    await writeStorage(async () => {
      if (!hasSession(owner)) return;
      await Promise.all([
        AsyncStorage.setItem(cacheKey(id, 'circles'), JSON.stringify(normalizedCircles)),
        AsyncStorage.setItem(cacheKey(id, 'contributions'), JSON.stringify(normalizedRows)),
        AsyncStorage.setItem(cacheKey(id, 'loans'), JSON.stringify(normalizedLoans)),
      ]);
    });
  };

  const mutateState = async (request: () => Promise<api.AppState>) => {
    await runForSession(scope, request, (state) => applyState(state, scope));
  };

  const clearData = () => {
    stateRevision.current += 1;
    lastNotificationFetch.current = 0;
    setCircles([]);
    setContributions([]);
    setLoans([]);
    setActiveCircleId('');
    setNotifications([]);
    setUnreadCount(0);
    setNotificationPreferences([]);
    setLive(false);
    setLiveError('');
    setRefreshing(false);
  };

  const replaceSession = (token: string | null, nextUser: AuthUser | null): SessionScope => {
    const next = { generation: sessionRef.current.generation + 1, token, user: nextUser };
    sessionRef.current = next;
    api.setAuthToken(token);
    clearData();
    setSessionGeneration(next.generation);
    setUser(nextUser);
    setSignedIn(!!token);
    return next;
  };

  const loadCache = async (owner: SessionScope) => {
    if (!hasSession(owner) || owner.stateReceived) return;
    const id = owner.user!.id;
    const revision = stateRevision.current;
    const [storedCircles, storedContributions, storedLoans, storedActiveCircle] = await Promise.all([
      AsyncStorage.getItem(cacheKey(id, 'circles')),
      AsyncStorage.getItem(cacheKey(id, 'contributions')),
      AsyncStorage.getItem(cacheKey(id, 'loans')),
      AsyncStorage.getItem(cacheKey(id, 'active-circle')),
    ]);
    // Neither another account nor a newer network frame can be replaced by this read.
    if (!hasSession(owner) || revision !== stateRevision.current) return;
    if (storedActiveCircle) setActiveCircleId(storedActiveCircle);
    if (storedCircles) {
      setCircles(
        (JSON.parse(storedCircles) as (Partial<Circle> & { monthly?: number })[]).map((c) =>
          normalizeCircle(c, owner.user),
        ),
      );
    }
    if (storedContributions) {
      setContributions((JSON.parse(storedContributions) as Partial<Contribution>[]).map(normalizeContribution));
    }
    if (storedLoans) setLoans((JSON.parse(storedLoans) as Loan[]).map(normalizeLoan));
  };

  useEffect(() => {
    let active = true;
    mounted.current = true;
    let owner = sessionRef.current;
    const current = () => active && isCurrent(owner);
    AsyncStorage.getItem(AUTH_KEY).then(async (storedAuth) => {
      if (!current()) return;
      await writeStorage(async () => {
        if (current()) await Promise.all(LEGACY_CACHE_KEYS.map((key) => AsyncStorage.removeItem(key)));
      });
      if (!current()) return;

      const auth = storedAuth ? (JSON.parse(storedAuth) as StoredAuth) : null;
      if (auth?.token) {
        owner = replaceSession(auth.token, auth.user ?? null);
        await loadCache(owner);
        if (!current()) return;
      } else if (auth?.name) {
        setUser({ id: '', name: auth.name, phone: null, email: null, hasPassword: true, twoFactorEnabled: false, twoFactorPending: false, backupCodesLeft: 0, createdAt: '' });
      }
      setHydrated(true);

      if (auth?.token) {
        try {
          const result = await withTimeout(api.fetchMe(), 3500);
          if (!current()) return;
          if (result) {
            if (owner.user?.id !== result.user.id) {
              owner = replaceSession(auth.token, result.user);
              await loadCache(owner);
              if (!current()) return;
            } else {
              owner.user = result.user;
              setUser(result.user);
            }
            await persistAuth({ signedIn: true, token: owner.token, user: result.user }, owner);
          }
        } catch (err) {
          if (!current()) return;
          if (err instanceof api.ApiError && err.status === 401) {
            owner = replaceSession(null, null);
            await persistAuth({ signedIn: false }, owner);
          }
        }
      }
      if (current()) setAuthHydrated(true);
    }).catch(() => {
      if (!current()) return;
      setHydrated(true);
      setAuthHydrated(true);
    });
    return () => {
      active = false;
      mounted.current = false;
      authAttempt.current += 1;
      sessionRef.current = { ...sessionRef.current, generation: sessionRef.current.generation + 1 };
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !authHydrated || !signedIn || !hasSession(scope)) return;
    let active = true;
    const onError = (err: unknown) => {
      if (active && isCurrent(scope)) {
        setLiveError(err instanceof Error ? err.message : 'The Turiwa API did not answer.');
      }
    };
    const unsubscribe = api.subscribeToState(
      (state) => {
        if (active && isCurrent(scope)) void applyState(state, scope).catch(onError);
      },
      onError,
    );
    return () => { active = false; unsubscribe(); };
  }, [hydrated, authHydrated, signedIn, sessionGeneration]);

  const refresh = async () => {
    if (!hasSession(scope)) return;
    setRefreshing(true);
    try {
      await runForSession(scope, api.fetchState, (state) => applyState(state, scope));
    } catch {
      // offline cache retained
    } finally {
      if (hasSession(scope)) setRefreshing(false);
    }
  };

  const addContribution = async (amount: number, note: string, circleId?: string, entry?: LedgerEntry, metadata?: ContributionMetadata) => {
    // A null member means the row is not attributed to a person (a manager chose
    // Circle General). Replacing it with the recorder's name would turn group
    // spending into the treasurer's personal contribution.
    // With no group named on the sheet the money goes to the circle the person is
    // working in, not to whichever the list happens to start with: the first circle is
    // not the one on screen after a switch.
    await mutateState(() => api.addContribution(
      amount,
      note,
      circleId ?? activeCircle?.id ?? circles[0]?.id,
      entry ?? { type: 'Contribution', member: null },
      metadata,
    ));
  };

  const createCircle = async (draft: GroupDraft) => {
    await mutateState(() => api.createCircle(draft));
  };

  const joinCircle = async (code: string) => {
    await mutateState(() => api.joinCircle(code));
  };

  // The API answers with the state after the group and its ledger are gone, so the
  // screens drop the closed group from the same response that removed it.
  const deleteCircle = async (circleId: string) => {
    await mutateState(() => api.deleteCircle(circleId));
  };

  // The fine rule and the fines themselves are written by the API, so the screens
  // show the group's record rather than a local guess that the next poll replaces.
  const setCircleFine = async (circleId: string, lateFine: number) => {
    await mutateState(() => api.setCircleFine(circleId, lateFine));
  };

  const applyFine = async (circleId: string, memberId: string) => {
    await mutateState(() => api.applyFine(circleId, memberId));
  };

  const applyForLoan = async (amount: number, purpose: string, circleId: string, preferredMonths: number, applicationKey?: string) => {
    await mutateState(() => api.applyForLoan(amount, purpose, circleId, preferredMonths, applicationKey));
  };

  const repayLoan = async (amount: number, loanId?: string, idempotencyKey?: string, audit?: { method?: string; reference?: string }) => {
    if (!hasSession(scope)) return;
    if (!loanId) throw new Error('Choose the loan you are repaying and try again.');
    const target = loans.find((loan) => loan.id === loanId);
    if (!target || target.status !== 'Active') throw new Error('This loan is no longer active. Refresh the loan list and try again.');
    await mutateState(() => api.repayLoan(target.id, amount, idempotencyKey, audit));
  };

  // Administrator approval of pending loans. The server's answer is the state: a
  // loan that was not approved must not look approved on screen.
  const approveLoan = async (loanId: string, terms: { amount: number; months: number; interestRate: number }) => {
    await mutateState(() => api.approveLoan(loanId, terms));
  };

  const rejectLoan = async (loanId: string, reason: string) => {
    await mutateState(() => api.rejectLoan(loanId, reason));
  };

  const removeCircleMember = async (circleId: string, memberId: string) => {
    await mutateState(() => api.removeCircleMember(circleId, memberId));
  };

  const setCircleMemberRole = async (circleId: string, memberId: string, role: 'member' | 'co-admin') => {
    await mutateState(() => api.setCircleMemberRole(circleId, memberId, role));
  };

  const transferPrimaryAdmin = async (circleId: string, memberId: string) => {
    await mutateState(() => api.transferPrimaryAdmin(circleId, memberId));
  };

  const openSession = async (session: api.AuthSession) => {
    const owner = replaceSession(session.token, session.user);
    setHydrated(true);
    setAuthHydrated(true);
    await runForSession(owner, async () => {
      await persistAuth({ signedIn: true, token: owner.token, user: session.user }, owner);
      await loadCache(owner);
      void refreshNotificationsFor(owner, true);
    });
  };

  const authenticate = async (request: () => Promise<api.AuthSession>, signal?: AbortSignal) => {
    const owner = sessionRef.current;
    const attempt = ++authAttempt.current;
    const current = () => isCurrent(owner) && attempt === authAttempt.current && !signal?.aborted;
    if (!current()) return;
    let session: api.AuthSession;
    try {
      session = await request();
    } catch (err) {
      if (current()) throw err;
      return;
    }
    if (current()) await openSession(session);
  };

  const signIn = async (phone: string, password: string) => {
    await authenticate(() => api.signIn(phone, password));
  };

  const signInWithGoogle = async (idToken: string) => {
    await authenticate(() => api.signInWithGoogle(idToken));
  };

  const createAccount = async (name: string, phone: string, password: string, verificationToken: string, signal?: AbortSignal) => {
    if (!verificationToken) throw new Error('Verify your phone number before creating your account.');
    await authenticate(() => api.signUp(name, phone, password, verificationToken), signal);
  };

  const signOut = async () => {
    // Dispatch with the departing token, but invalidate local work immediately,
    // not after a slow or unreachable server has answered.
    if (!isCurrent(scope)) return;
    const signingOut = api.signOut();
    authAttempt.current += 1;
    const owner = replaceSession(null, null);
    setHydrated(true);
    setAuthHydrated(true);
    try {
      await Promise.all([signingOut, persistAuth({ signedIn: false }, owner)]);
    } catch (err) {
      if (isCurrent(owner)) throw err;
    }
  };

  // Auth-user responses must match both the session and the account they update.
  const persistUser = async (next: AuthUser, owner: SessionScope) => {
    if (!hasSession(owner) || next.id !== owner.user?.id) return;
    owner.user = next;
    setUser(next);
    await persistAuth({ signedIn: true, token: owner.token, user: next }, owner);
  };

  const updateProfileName = async (name: string) => {
    await runForSession(scope, () => api.updateName(name), (result) => persistUser(result.user, scope));
  };

  const activateTwoFactor = async (code: string) => {
    const result = await runForSession(scope, () => api.activateTwoFactor(code), (value) => persistUser(value.user, scope));
    return result?.backupCodes ?? [];
  };

  const disableTwoFactor = async (code: string, password?: string) => {
    await runForSession(scope, () => api.disableTwoFactor(code, password), (result) => persistUser(result.user, scope));
  };

  const deleteAccount = async (password: string, code: string) => {
    if (!hasSession(scope)) return;
    const deletedUserId = scope.user!.id;
    try {
      await api.deleteAccount(password, code);
    } catch (err) {
      if (hasSession(scope)) throw err;
      return;
    }
    // A late deletion response must not sign out the next account. Cache removal
    // still belongs to the deleted id, queued behind its already dispatched writes.
    let signedOutOwner: SessionScope | undefined;
    if (hasSession(scope)) {
      authAttempt.current += 1;
      signedOutOwner = replaceSession(null, null);
    }
    try {
      await writeStorage(async () => {
        if (signedOutOwner && isCurrent(signedOutOwner)) {
          await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ signedIn: false }));
        }
        await Promise.all(
          (['circles', 'contributions', 'loans', 'active-circle'] as const).map((name) =>
            AsyncStorage.removeItem(cacheKey(deletedUserId, name)),
          ),
        );
      });
    } catch (err) {
      if (signedOutOwner && isCurrent(signedOutOwner)) throw err;
    }
  };

  const nextStopAfterAuth = async () => {
    // Called by the pre-login render after authentication has completed.
    const owner = sessionRef.current;
    try {
      const state = await runForSession(owner, api.fetchState);
      // Only the still-current account with no circles needs create-or-join.
      return state && state.circles.length === 0 ? ('/(onboarding)/create-group' as const) : ('/(tabs)' as const);
    } catch {
      return '/(tabs)' as const;
    }
  };

  const activeCircle = useMemo(
    () => circles.find((circle) => circle.id === activeCircleId) ?? null,
    [circles, activeCircleId],
  );
  const activeRole = useMemo(
    () => (activeCircle ? circleAccess(activeCircle, userId)?.role ?? null : null),
    [activeCircle, userId],
  );

  // Switching is a client-side move between circles this account already has, so the
  // list the API returned is the only thing that can be pointed at. An id typed into a
  // URL, the console or a request body selects nothing here — and the API scopes every
  // read to the caller's own memberships regardless.
  const setActiveCircle = async (circleId: string) => {
    if (!hasSession(scope)) return false;
    const target = circles.find((circle) => circle.id === circleId);
    const access = target ? circleAccess(target, userId) : null;
    if (!target || !access || access.status !== 'active') return false;
    stateRevision.current += 1;
    setActiveCircleId(circleId);
    try {
      await writeStorage(async () => {
        if (hasSession(scope)) await AsyncStorage.setItem(cacheKey(userId, 'active-circle'), circleId);
      });
    } catch (err) {
      if (hasSession(scope)) throw err;
    }
    return hasSession(scope);
  };

  // The stored choice of circle is a hint about where the person was last working,
  // never an authorisation. Every frame of the account's circles is checked against
  // it, so a group that was deleted, or one whose membership has since gone, cannot
  // stay the active one: the app moves to another circle the API still returns.
  useEffect(() => {
    if (!hasSession(scope)) return;
    if (circles.some((circle) => circle.id === activeCircleId)) return;
    const next = circles[0]?.id ?? '';
    if (next !== activeCircleId) setActiveCircleId(next);
    if (next) void writeStorage(async () => {
      if (hasSession(scope)) await AsyncStorage.setItem(cacheKey(userId, 'active-circle'), next);
    }).catch(() => { /* The stored selection is only a hint. */ });
  }, [circles, userId, activeCircleId, sessionGeneration]);

  const finance = useMemo(() => buildFinance(circles, contributions, loans), [circles, contributions, loans]);

  // One circle's own books. The scope selects which ledger rows are summed, so the
  // figures cannot be the previous circle's numbers wearing the new circle's name:
  // switching id changes the rows, not just the label beside them.
  const activeFinance = useMemo(() => {
    if (!activeCircle) return null;
    const id = activeCircle.id;
    return buildFinance(
      [activeCircle],
      contributions.filter((row) => row.circleId === id),
      loans.filter((loan) => loan.circleId === id),
    );
  }, [activeCircle, contributions, loans]);

  const unreadByCircle = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of notifications) {
      if (item.read || !item.circleId) continue;
      counts[item.circleId] = (counts[item.circleId] ?? 0) + 1;
    }
    return counts;
  }, [notifications]);

  const value = useMemo(
    () => ({
      circles,
      contributions,
      loans,
      finance,
      activeCircle,
      activeCircleId,
      activeRole,
      activeFinance,
      unreadByCircle,
      setActiveCircle,
      notifications,
      unreadCount,
      notificationPreferences,
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      saveNotificationPreferences,
      authHydrated,
      signedIn,
      profileName,
      user,
      live,
      liveError,
      refreshing,
      refresh,
      addContribution,
      createCircle,
      joinCircle,
      deleteCircle,
      setCircleFine,
      applyFine,
      applyForLoan,
      repayLoan,
      approveLoan,
      rejectLoan,
      removeCircleMember,
      setCircleMemberRole,
      transferPrimaryAdmin,
      signIn,
      signInWithGoogle,
      createAccount,
      signOut,
      updateProfileName,
      activateTwoFactor,
      disableTwoFactor,
      deleteAccount,
      nextStopAfterAuth,
      hydrated,
    }),
    [
      circles,
      contributions,
      loans,
      finance,
      activeCircle,
      activeCircleId,
      activeRole,
      activeFinance,
      unreadByCircle,
      notifications,
      unreadCount,
      notificationPreferences,
      authHydrated,
      signedIn,
      sessionGeneration,
      profileName,
      user,
      live,
      liveError,
      hydrated,
      refreshing,
    ],
  );

  return <TuriwaContext.Provider value={value}>{children}</TuriwaContext.Provider>;
}

export function useTuriwa() {
  const value = useContext(TuriwaContext);
  if (!value) throw new Error('useTuriwa must be used inside TuriwaProvider');
  return value;
}

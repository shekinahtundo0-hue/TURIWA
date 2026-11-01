import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import { LOAN_MONTHS } from '@/lib/loanMath';
import type { AuthUser, Circle, CircleMember, CircleRole, Contribution, GroupDraft, LedgerEntry, LedgerType, Loan } from '@/lib/api';

export type { AuthUser, Circle, CircleMember, CircleRole, Contribution, GroupDraft, LedgerEntry, LedgerType, Loan };

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
  authHydrated: boolean;
  signedIn: boolean;
  profileName: string;
  user: AuthUser | null;
  live: boolean;
  /** Why the app is not showing the database's figures right now, empty while all is well. */
  liveError: string;
  refreshing: boolean;
  refresh: () => Promise<void>;
  addContribution: (amount: number, note: string, circleId?: string, entry?: LedgerEntry) => Promise<void>;
  createCircle: (draft: GroupDraft) => Promise<void>;
  joinCircle: (code: string) => Promise<void>;
  deleteCircle: (circleId: string) => Promise<void>;
  setCircleFine: (circleId: string, lateFine: number) => Promise<void>;
  applyFine: (circleId: string, memberId: string) => Promise<void>;
  applyForLoan: (amount: number, purpose: string, circleId?: string) => Promise<void>;
  repayLoan: (amount: number, loanId?: string) => Promise<void>;
  approveLoan: (loanId: string) => Promise<void>;
  rejectLoan: (loanId: string) => Promise<void>;
  signIn: (phone: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  createAccount: (name: string, phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  activateTwoFactor: (code: string) => Promise<string[]>;
  disableTwoFactor: (code: string, password?: string) => Promise<void>;
  deleteAccount: (password: string, code: string) => Promise<void>;
  nextStopAfterAuth: () => Promise<'/(tabs)' | '/(onboarding)/create-group'>;
  hydrated: boolean;
};

const AUTH_KEY = '@turiwa/auth';

function cacheKey(userId: string, name: 'circles' | 'contributions' | 'loans') {
  return `@turiwa/${userId}/${name}`;
}
const LEGACY_CACHE_KEYS = ['@turiwa/circles', '@turiwa/contributions', '@turiwa/loans'];
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
    pendingInvites: membersList.length - active,
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
    coAdminIds: membersList.filter((member) => member.role === 'co-admin').map((member) => member.id),
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
    ...(raw as Contribution),
    createdAt: raw.createdAt ?? '',
    type: raw.type ?? 'Contribution',
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
    totalPayable,
    months: loan.months || LOAN_MONTHS,
    interestPeriod: loan.interestPeriod ?? 'Month',
    balance: Math.min(loan.balance ?? totalPayable, totalPayable),
    // A loan cached by an older build has no machine-readable due day. Keeping it null
    // means "the record does not say", which is not the same as "it is late".
    dueOn: loan.dueOn ?? null,
  };
}

export function TuriwaProvider({ children }: { children: React.ReactNode }) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [live, setLive] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const userId = user?.id ?? '';
  const profileName = user?.name ?? 'Member';

  const persistAuth = async (next: StoredAuth) => {
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
  };

  const applyState = async (state: api.AppState) => {
    const normalizedCircles = state.circles.map((c) => normalizeCircle(c, user));
    const normalizedLoans = state.loans.map(normalizeLoan);
    const normalizedRows = state.contributions.map(normalizeContribution);
    setCircles(normalizedCircles);
    setContributions(normalizedRows);
    setLoans(normalizedLoans);
    setLive(true);
    setLiveError('');
    if (!userId) return;
    await Promise.all([
      AsyncStorage.setItem(cacheKey(userId, 'circles'), JSON.stringify(normalizedCircles)),
      AsyncStorage.setItem(cacheKey(userId, 'contributions'), JSON.stringify(normalizedRows)),
      AsyncStorage.setItem(cacheKey(userId, 'loans'), JSON.stringify(normalizedLoans)),
    ]);
  };

  const clearData = () => {
    setCircles([]);
    setContributions([]);
    setLoans([]);
    setLive(false);
  };

  const loadCache = async (id: string) => {
    const [storedCircles, storedContributions, storedLoans] = await Promise.all([
      AsyncStorage.getItem(cacheKey(id, 'circles')),
      AsyncStorage.getItem(cacheKey(id, 'contributions')),
      AsyncStorage.getItem(cacheKey(id, 'loans')),
    ]);
    if (storedCircles) {
      setCircles(
        (JSON.parse(storedCircles) as (Partial<Circle> & { monthly?: number })[]).map((c) =>
          normalizeCircle(c, user),
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
    AsyncStorage.getItem(AUTH_KEY).then(async (storedAuth) => {
      await Promise.all(LEGACY_CACHE_KEYS.map((key) => AsyncStorage.removeItem(key)));
      if (!active) return;

      const auth = storedAuth ? (JSON.parse(storedAuth) as StoredAuth) : null;
      if (auth?.token) {
        api.setAuthToken(auth.token);
        setSignedIn(true);
        if (auth.user) setUser(auth.user);
        if (auth.user?.id) await loadCache(auth.user.id);
      } else if (auth?.name) {
        setUser({ id: '', name: auth.name, phone: null, email: null, hasPassword: true, twoFactorEnabled: false, twoFactorPending: false, backupCodesLeft: 0, createdAt: '' });
      }
      setHydrated(true);

      if (auth?.token) {
        try {
          const result = await withTimeout(api.fetchMe(), 3500);
          if (!active) return;
          if (result) {
            setUser(result.user);
            await persistAuth({ signedIn: true, token: auth.token, user: result.user });
          }
        } catch (err) {
          if (!active) return;
          if (err instanceof api.ApiError && err.status === 401) {
            api.setAuthToken(null);
            setSignedIn(false);
            setUser(null);
            clearData();
            await persistAuth({ signedIn: false });
          }
        }
      }
      if (active) setAuthHydrated(true);
    }).catch(() => {
      setHydrated(true);
      setAuthHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    return api.subscribeToState(
      (state) => {
        void applyState(state);
      },
      (err) => {
        setLiveError(err instanceof Error ? err.message : 'The Turiwa API did not answer.');
      },
    );
  }, [hydrated, signedIn, userId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const state = await api.fetchState();
      if (state) await applyState(state);
    } catch {
      // offline cache retained
    } finally {
      setRefreshing(false);
    }
  };

  const addContribution = async (amount: number, note: string, circleId?: string, entry?: LedgerEntry) => {
    // Whoever records a ledger entry is paying into the group as themselves, so an
    // entry with no chosen member is attributed to this account rather than to a
    // made-up name.
    const member = entry?.member ?? user?.name?.trim() ?? 'You';
    const payload: LedgerEntry = entry ? { ...entry, member } : { type: 'Contribution', member };
    await applyState(await api.addContribution(amount, note, circleId ?? circles[0]?.id, payload));
  };

  const createCircle = async (draft: GroupDraft) => {
    const res = await api.createCircle(draft);
    await applyState(res);
  };

  const joinCircle = async (code: string) => {
    await applyState(await api.joinCircle(code));
  };

  // The API answers with the state after the group and its ledger are gone, so the
  // screens drop the closed group from the same response that removed it.
  const deleteCircle = async (circleId: string) => {
    await applyState(await api.deleteCircle(circleId));
  };

  // The fine rule and the fines themselves are written by the API, so the screens
  // show the group's record rather than a local guess that the next poll replaces.
  const setCircleFine = async (circleId: string, lateFine: number) => {
    await applyState(await api.setCircleFine(circleId, lateFine));
  };

  const applyFine = async (circleId: string, memberId: string) => {
    await applyState(await api.applyFine(circleId, memberId));
  };

  const applyForLoan = async (amount: number, purpose: string, circleId?: string) => {
    await applyState(await api.applyForLoan(amount, purpose, circleId));
  };

  const repayLoan = async (amount: number, loanId?: string) => {
    const target = loans.find((loan) => loan.id === loanId) ?? loans.find((loan) => loan.status === 'Active' || loan.status === 'Pending');
    if (!target) return;
    await applyState(await api.repayLoan(target.id, amount));
  };

  // Administrator approval of pending loans. The server's answer is the state: a
  // loan that was not approved must not look approved on screen.
  const approveLoan = async (loanId: string) => {
    await applyState(await api.approveLoan(loanId));
  };

  const rejectLoan = async (loanId: string) => {
    await applyState(await api.rejectLoan(loanId));
  };

  const openSession = async (session: api.AuthSession) => {
    api.setAuthToken(session.token);
    clearData();
    setUser(session.user);
    setSignedIn(true);
    await persistAuth({ signedIn: true, token: session.token, user: session.user });
    await loadCache(session.user.id);
  };

  const signIn = async (phone: string, password: string) => {
    await openSession(await api.signIn(phone, password));
  };

  const signInWithGoogle = async (idToken: string) => {
    await openSession(await api.signInWithGoogle(idToken));
  };

  const createAccount = async (name: string, phone: string, password: string) => {
    await openSession(await api.signUp(name, phone, password));
  };

  const signOut = async () => {
    await api.signOut();
    api.setAuthToken(null);
    setSignedIn(false);
    setUser(null);
    clearData();
    await persistAuth({ signedIn: false });
  };

  const updateProfileName = async (name: string) => {
    const { user: updated } = await api.updateName(name);
    const token = api.getAuthToken();
    setUser(updated);
    await persistAuth({ signedIn: true, token, user: updated });
  };

  // Auth-user fields such as two-factor state come straight from the API, so the
  // stored copy is replaced rather than patched locally.
  const persistUser = async (next: AuthUser) => {
    setUser(next);
    await persistAuth({ signedIn: true, token: api.getAuthToken(), user: next });
    return next;
  };

  const activateTwoFactor = async (code: string) => {
    const result = await api.activateTwoFactor(code);
    await persistUser(result.user);
    return result.backupCodes;
  };

  const disableTwoFactor = async (code: string, password?: string) => {
    const result = await api.disableTwoFactor(code, password);
    await persistUser(result.user);
  };

  const deleteAccount = async (password: string, code: string) => {
    const deletedUserId = userId;
    await api.deleteAccount(password, code);
    api.setAuthToken(null);
    setSignedIn(false);
    setUser(null);
    clearData();
    await persistAuth({ signedIn: false });
    if (deletedUserId) {
      await Promise.all(
        (['circles', 'contributions', 'loans'] as const).map((name) =>
          AsyncStorage.removeItem(cacheKey(deletedUserId, name)),
        ),
      );
    }
  };

  const nextStopAfterAuth = async () => {
    if (!api.getAuthToken()) return '/(tabs)' as const;
    try {
      const state = await api.fetchState();
      // A member who joined somebody else's circle has a circle on their record, so they
      // belong in the app. Only an account with none at all needs the create-or-join step.
      return state.circles.length > 0 ? ('/(tabs)' as const) : ('/(onboarding)/create-group' as const);
    } catch {
      return '/(tabs)' as const;
    }
  };

  const finance = useMemo<Finance>(() => {
    const kind = (item: Contribution) => item.type ?? 'Contribution';
    const total = (items: Contribution[]) => items.reduce((sum, item) => sum + item.amount, 0);
    const ofKind = (test: (type: api.LedgerType) => boolean) => total(contributions.filter((item) => test(kind(item))));
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
    for (const item of contributions) {
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
    for (const item of contributions) {
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
    for (const item of contributions) {
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
  }, [circles, contributions, loans]);

  const value = useMemo(
    () => ({
      circles,
      contributions,
      loans,
      finance,
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
      authHydrated,
      signedIn,
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

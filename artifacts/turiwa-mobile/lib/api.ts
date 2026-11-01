import Constants from 'expo-constants';
import { Platform } from 'react-native';

// The smallest loan the app will accept, and the largest any money figure may be
// before the ledger stops you. Both are enforced by the API as well as here.
export const MIN_LOAN = 1000;
export const MAX_KES = 10_000_000;

// One money format for the whole app, pinned to the locale the groups use: a bare
// toLocaleString() follows the device, which can print 1.400 or Arabic-Indic digits,
// and then two figures on the same screen stop looking like they belong together.
const KE = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });
/** The digits only, for a component that puts its own "KES" in front. */
export const kes = (value: number) => KE.format(Math.abs(Math.round(value || 0)));
/** "KES 1,500", or "−KES 1,500" when the fund is under. */
export const kesLabel = (value: number) => `${value < 0 ? '−' : ''}KES ${kes(value)}`;

export type Frequency = 'Weekly' | 'Bi-weekly' | 'Monthly';

export const FREQUENCIES: { value: Frequency; short: string; periodsPerYear: number }[] = [
  { value: 'Weekly', short: 'Wee', periodsPerYear: 52 },
  { value: 'Bi-weekly', short: 'Bi-Wk', periodsPerYear: 26 },
  { value: 'Monthly', short: 'Mon', periodsPerYear: 12 },
];

// Reads inside "every ___": KES 2,000 every week / every two weeks / every month.
export const frequencyNoun = (value: Frequency) =>
  value === 'Weekly' ? 'week' : value === 'Bi-weekly' ? 'two weeks' : 'month';

// The cycle a contribution falls due in, as the app says it when naming the cycle
// that is running: "this week", "this fortnight", "this month".
export const cycleNoun = (value: Frequency) =>
  value === 'Weekly' ? 'week' : value === 'Bi-weekly' ? 'fortnight' : 'month';

export const periodsPerYear = (value: Frequency) =>
  FREQUENCIES.find((item) => item.value === value)?.periodsPerYear ?? 12;

/** What a group plans to take in a calendar month: one member's cycle amount, times
 *  the members, times the cycles that fit in a month. `contribution` is stored per
 *  member, so a figure built without the headcount describes one person and not the
 *  group, and a rate per cycle converts by cycles-per-month, never the other way. */
export const plannedPerMonth = (circle: { contribution: number; members: number; frequency: Frequency }) =>
  Math.round((circle.contribution * circle.members * periodsPerYear(circle.frequency)) / 12);

export type GroupDraft = {
  name: string;
  contribution: number;
  frequency: Frequency;
  joiningFee: number;
  welfare: number;
  lateFine: number;
  loanInterestPercent: number;
  loanInterestPeriod: InterestPeriod;
};

// A group quotes its rate per month or per annum; interest compounds on the
// outstanding balance every month of the loan.
export type InterestPeriod = 'Month' | 'Year';

export const INTEREST_PERIODS: { value: InterestPeriod; label: string; short: string }[] = [
  { value: 'Month', label: 'Per month', short: '/ mo' },
  { value: 'Year', label: 'Per annum', short: '/ yr' },
];

export const periodNoun = (value: InterestPeriod) => (value === 'Year' ? 'per annum' : 'per month');

/** "10% a month" / "10% a year" — how a group describes the rate it set. */
export const interestLabel = (percent: number, value: InterestPeriod) =>
  `${percent}% ${value === 'Year' ? 'a year' : 'a month'}`;

export const periodShort = (value: InterestPeriod) => (value === 'Year' ? 'p.a.' : 'p.m.');

/** "1 member" / "12 members" — a headcount of the people the group has. */
export const memberLabel = (count: number) => `${count} ${count === 1 ? 'member' : 'members'}`;

/** "8 members · 1 invite pending" — the headcount and the unanswered invites, which
 *  are different things and are never added together. */
export const headcountLabel = (circle: { members: number; pendingInvites?: number }) => {
  const head = memberLabel(circle.members);
  if (!circle.pendingInvites) return head;
  return `${head} · ${circle.pendingInvites} invite${circle.pendingInvites === 1 ? '' : 's'} pending`;
};

export type CircleRole = 'admin' | 'co-admin' | 'member';

// The kinds of ledger entry the group keeps. Contributions and repayments bring
// cash in, an expense is a deduction, welfare is set aside — still held by the
// group but earmarked — a fine is money a member handed over for missing a
// contribution, and a loan disbursement is cash the fund handed to a member and
// expects back as repayments.
export const LEDGER_TYPES = ['Contribution', 'Expense', 'Repayment', 'Welfare', 'Fine', 'LoanDisbursement'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];
// A loan disbursement is written by the loan it belongs to and a fine by the admin
// action on a circle, never typed in by hand: a typed fine would name no member and
// no cycle, and a typed payout no loan backs.
export const RECORDABLE_LEDGER_TYPES = LEDGER_TYPES.filter((type) => type !== 'LoanDisbursement' && type !== 'Fine');
export const isOutflow = (type: LedgerType) => type === 'Expense';
export const isSetAside = (type: LedgerType) => type === 'Welfare';
/** Money the fund handed over for a loan and is waiting to receive back. */
export const isLentOut = (type: LedgerType) => type === 'LoanDisbursement';
/** An entry the API wrote for a loan, rather than somebody typing it in. */
export const isLoanEntry = (item: { loanId: string | null }) => item.loanId !== null;
/** An entry's effect on the money the group can still spend: an expense, a welfare
 *  set-aside and the cash a loan hands over all reduce it, everything else adds. */
export const entryDelta = (type: LedgerType) => (isOutflow(type) || isSetAside(type) || isLentOut(type) ? -1 : 1);

/** A running loan whose recorded due day has passed. A loan with no due day on record
 *  is not called overdue — the app does not know — and a request nobody has approved
 *  has no money out to be late on. */
export const isOverdue = (loan: { status: string; balance: number; dueOn: string | null }, today = isoToday()) =>
  loan.status === 'Active' && loan.balance > 0 && loan.dueOn !== null && loan.dueOn < today;

/** What a loan's own balance says has come back. The rows the loan wrote say it from
 *  the other side; when the two disagree the app shows both rather than choosing. */
export const repaidOnRecord = (loan: { totalPayable: number; balance: number }) =>
  Math.max(loan.totalPayable - loan.balance, 0);

/** What the ledger sheet records: the kind of entry plus who it is attributed to. */
export type LedgerEntry = { type: LedgerType; member: string | null };

export type CircleMember = {
  id: string;
  name: string;
  phone?: string;
  role: CircleRole;
  // An invite the person has not accepted is on the group's list but is not one of
  // its members, so the headcount and the list say different things on purpose.
  status: 'pending' | 'active';
  joinedDate: string;
  totalContributed: number;
  /** What this member has paid towards the contribution cycle running now. */
  paidThisPeriod?: number;
  /** Active, has the group's contribution due, and has not reached it this cycle. */
  lateThisPeriod?: boolean;
  /** The admin already recorded this cycle's fine for them. */
  finedThisPeriod?: boolean;
};

export type Circle = {
  id: string;
  joinCode: string;
  name: string;
  members: number;
  // Roster rows waiting on an answer, counted beside the headcount, never in it.
  pendingInvites?: number;
  target: number;
  contribution: number;
  frequency: Frequency;
  joiningFee: number;
  welfare: number;
  /** What the admin charges for a missed contribution; zero means no fine. */
  lateFine: number;
  /** The first day of the contribution cycle running now, as `2026-10-26`. */
  cycleStart?: string;
  loanInterestPercent: number;
  loanInterestPeriod: InterestPeriod;
  createdBy: string | null;
  adminId?: string;
  coAdminIds?: string[];
  membersList?: CircleMember[];
  color: 'green' | 'gold' | 'blue';
};

export type Contribution = {
  id: string;
  circleId: string;
  amount: number;
  date: string;
  // When the row was written, from the database. A screen that has to place an entry
  // in time — a month's total, a list in order, a spreadsheet — reads this, because
  // `date` is a label an older build could have stored.
  createdAt: string;
  note: string;
  status: 'Complete' | 'Pending';
  type: LedgerType;
  member: string | null;
  // Set when the entry is a loan's own money: the payout the fund made or an
  // instalment it received. It tells the ledger which loan the row belongs to.
  loanId: string | null;
};

/** The date to show for a ledger row: "Just now" inside the first minute, then the
 *  day the database wrote it. The stored label is kept only when it says something
 *  the timestamp cannot — an older row's date, or "On file" for money a loan moved
 *  before the ledger knew about it. */
export const entryDate = (item: Pick<Contribution, 'date' | 'createdAt'>) => {
  const written = new Date(item.createdAt).getTime();
  if (Number.isNaN(written)) return item.date;
  if (Date.now() - written < 60_000) return 'Just now';
  if (!item.date || item.date === 'Just now') {
    return new Date(written).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return item.date;
};

/** The calendar month a row falls in, as `2026-10`, so a period total is a sum of
 *  rows rather than a claim about them. */
export const monthKey = (item: Pick<Contribution, 'createdAt'>) => item.createdAt.slice(0, 7);

/** `2026-10` for the month that is now, in the device's own timezone. */
export const currentMonthKey = (at: Date = new Date()) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;

/** "Oct 2026" from `2026-10` — a period a person reads, not a sort key. */
export const monthLabel = (key: string) => {
  const [year, month] = key.split('-');
  const name = Number(month) > 0
    ? new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-GB', { month: 'short' })
    : '';
  return `${name} ${year}`;
};

/** Today as `2026-10-15`, from the device's own calendar. `toISOString()` would read
 *  the clock in UTC and call a loan due today overdue before the day is out. */
export const isoToday = (at: Date = new Date()) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

/** The last twelve month keys, oldest first — the periods a statement can be drawn
 *  for, whether or not the group has rows in them. */
export const recentMonthKeys = (count = 12, at: Date = new Date()): string[] =>
  Array.from(
    { length: count },
    (_, index) => currentMonthKey(new Date(at.getFullYear(), at.getMonth() - (count - 1 - index), 1)),
  );

export type Loan = {
  id: string;
  // The group a loan was taken through. Loans saved before the group was recorded
  // have none, and the screens then quote the rate without naming a group.
  circleId: string | null;
  principal: number;  balance: number;
  monthlyRepayment: number;
  // Principal plus the interest it compounds to over the term. `balance` counts
  // down from this, so repaying it in full clears the loan.
  totalPayable: number;
  months: number;
  interestRate: number;
  interestPeriod: InterestPeriod;
  dueDate: string;
  // The same day as `dueDate` in `2026-10-15` form, or null for a loan written before
  // the app stored one. "Overdue" is a comparison, and a comparison needs a date.
  dueOn: string | null;
  purpose: string;
  status: 'Active' | 'Pending' | 'Paid off' | 'Rejected';
};

export type AppState = {
  version: number;
  circles: Circle[];
  contributions: Contribution[];
  loans: Loan[];
};

export type AuthUser = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  twoFactorPending: boolean;
  backupCodesLeft: number;
  createdAt: string;
};

export type AuthSession = {
  user: AuthUser;
  token: string;
};

export type TwoFactorEnrollment = {
  secret: string;
  otpauthUri: string;
  accountLabel: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function defaultApiBase(): string {
  // A deployed web build is served by the same host that answers `/api`, so it has
  // nowhere else to go: the address in app.json points a phone emulator at a developer's
  // machine, and a browser following it would look for an API on its own laptop.
  if (Platform.OS === 'web') return '';
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  if (extra?.apiUrl) return extra.apiUrl;
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  return 'http://localhost:5000';
}

// `EXPO_PUBLIC_API_URL` is inlined into the bundle at build time, and `.env.local` points it at a
// developer's laptop for the emulator loop. A production web export is always served by the host
// that answers `/api`, so that laptop address must not travel with it; under `expo start` the dev
// server has no `/api` of its own and the configured URL is the only way to reach one.
function webApiBase(): string {
  if (process.env.NODE_ENV === 'production') return '';
  return process.env.EXPO_PUBLIC_API_URL ?? '';
}

export const API_BASE = (Platform.OS === 'web' ? webApiBase() : (process.env.EXPO_PUBLIC_API_URL ?? defaultApiBase())).replace(/\/+$/, '');

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string };
    if (data?.message) return data.message;
  } catch {
    // ignore
  }
  return `Could not reach Turiwa (${response.status})`;
}

// Whatever screen started the call keeps its spinner until this promise settles, so a request
// the network never answers must not stay pending: it would leave "Connecting…" on screen for
// good. The bearer exchange after a Google sign-in is the slow one this exists for.
const REQUEST_TIMEOUT_MS = 25_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const where = API_BASE || (Platform.OS === 'web' ? window.location.origin : 'the configured API');
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    if (controller.signal.aborted) {
      throw new Error(`The Turiwa API at ${where} did not answer in time. Check the connection and try again.`);
    }
    throw new Error(`Cannot reach the Turiwa API at ${where}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fetchState() {
  return request<AppState>('/state');
}

export function addContribution(
  amount: number,
  note: string,
  circleId?: string,
  entry?: { type?: LedgerType; member?: string | null },
) {
  return request<AppState>('/contributions', {
    method: 'POST',
    body: JSON.stringify({ amount, note, circleId, type: entry?.type ?? 'Contribution', member: entry?.member ?? null }),
  });
}

export function createCircle(draft: GroupDraft) {
  return request<AppState>('/circles', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export function joinCircle(code: string) {
  return request<AppState>('/circles/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// Closing a group takes its ledger and loans with it. The API refuses to leave the
// account with no circle at all, so the last group cannot be deleted from anywhere.
export function deleteCircle(circleId: string) {
  return request<AppState>(`/circles/${encodeURIComponent(circleId)}`, {
    method: 'DELETE',
  });
}

// The admin's fine rule is part of the group's record, so it travels with the state
// the screens already read rather than living only on the phone that set it.
export function setCircleFine(circleId: string, lateFine: number) {
  return request<AppState>(`/circles/${encodeURIComponent(circleId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ lateFine }),
  });
}

// Recording a fine writes one ledger row for the member and cycle the API checked,
// so the same member cannot be fined twice for one missed contribution.
export function applyFine(circleId: string, memberId: string) {
  return request<AppState>(`/circles/${encodeURIComponent(circleId)}/fines`, {
    method: 'POST',
    body: JSON.stringify({ memberId }),
  });
}

export function applyForLoan(amount: number, purpose: string, circleId?: string) {
  return request<AppState>('/loans', {
    method: 'POST',
    body: JSON.stringify({ amount, purpose, circleId }),
  });
}

export function repayLoan(loanId: string, amount: number) {
  return request<AppState>(`/loans/${loanId}/repay`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export function approveLoan(loanId: string) {
  return request<AppState>(`/loans/${loanId}/approve`, {
    method: 'POST',
  });
}

export function rejectLoan(loanId: string) {
  return request<AppState>(`/loans/${loanId}/reject`, {
    method: 'POST',
  });
}

export function signIn(phone: string, password: string) {  return request<AuthSession>('/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });
}

// The API verifies the Firebase ID token server-side and answers with Turiwa's own
// bearer session, so Google sign-in reuses every existing authenticated call.
export function signInWithGoogle(idToken: string) {
  return request<AuthSession>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

export function signUp(name: string, phone: string, password: string) {
  return request<AuthSession>('/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({ name, phone, password }),
  });
}

export async function signOut(): Promise<void> {
  try {
    await request<void>('/auth/sign-out', { method: 'POST' });
  } catch {
    // Signing out locally even if the server is unreachable.
  }
}

export function fetchMe() {
  return request<{ user: AuthUser }>('/auth/me');
}

export function requestSignUpCode(phone: string) {
  return request<{ code?: string; expiresInMinutes: number }>('/auth/otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function verifySignUpCode(phone: string, code: string) {
  return request<{ ok: boolean }>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

export function requestResetCode(phone: string) {
  return request<{ ok: boolean; delivered: boolean; code?: string; expiresInMinutes?: number }>(
    '/auth/password/reset-code',
    {
      method: 'POST',
      body: JSON.stringify({ phone }),
    },
  );
}

export function resetPassword(phone: string, code: string, password: string) {
  return request<{ ok: boolean }>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ phone, code, password }),
  });
}

export function updateName(name: string) {
  return request<{ user: AuthUser }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<{ ok: boolean }>('/auth/password/change', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function enrollTwoFactor() {
  return request<TwoFactorEnrollment>('/auth/2fa/enroll', { method: 'POST' });
}

export function activateTwoFactor(code: string) {
  return request<{ user: AuthUser; backupCodes: string[] }>('/auth/2fa/activate', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function disableTwoFactor(code: string, password?: string) {
  return request<{ user: AuthUser }>('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ code, password }),
  });
}

// Irreversible: the API drops the account's groups, contributions, loans,
// sessions and user row in one pass, so nothing is left to restore.
export async function deleteAccount(password: string, code: string): Promise<void> {
  await request<void>('/auth/account', {
    method: 'DELETE',
    body: JSON.stringify({ password, code }),
  });
}

// `onError` exists because a failed refresh used to be invisible: the screens kept the last
// cached figures and the header went on saying it was connecting, for ever.
export function subscribeToState(
  onState: (state: AppState) => void,
  onError?: (err: unknown) => void,
): () => void {
  const query = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
  const url = `${API_BASE}/api/events${query}`;
  let closed = false;
  let source: EventSource | null = null;
  // `new EventSource()` returns an object whether or not the server ever accepts the
  // stream, so the push connection is tracked on its own, not by `source` being set.
  let streaming = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const poll = async () => {
    if (closed) return;
    try {
      onState(await fetchState());
    } catch (err) {
      // Keep the last known state while reconnecting, but let the screen say so.
      onError?.(err);
    }
  };

  // A host that cannot hold a request open answers the stream with an error, and polling
  // at the connected rate there would leave a screen twenty seconds behind the group.
  const reschedule = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(poll, streaming ? 20000 : 3000);
  };

  if (typeof EventSource !== 'undefined') {
    try {
      source = new EventSource(url);
      source.onopen = () => {
        streaming = true;
        reschedule();
      };
      source.onerror = () => {
        streaming = false;
        reschedule();
      };
      source.addEventListener('state', (event) => {
        try {
          onState(JSON.parse((event as MessageEvent).data) as AppState);
        } catch {
          // ignore malformed frames
        }
      });
    } catch {
      source = null;
    }
  }

  reschedule();
  void poll();

  return () => {
    closed = true;
    if (timer) clearInterval(timer);
    source?.close();
  };
}

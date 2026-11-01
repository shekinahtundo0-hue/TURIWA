import { desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  appMetaTable,
  circlesTable,
  contributionsTable,
  getDb,
  loansTable,
  usersTable,
  type Circle,
  type InterestPeriod,
  type MemberRole,
  type MemberStatus,
  type User,
} from "@workspace/db";
import { publish } from "./realtime";
import { asInterestPeriod } from "./loanMath";
import { cycleStart, writtenAt } from "./fines";
import { isoDay } from "./money";

export type Frequency = "Weekly" | "Bi-weekly" | "Monthly";

export const FREQUENCIES: Frequency[] = ["Weekly", "Bi-weekly", "Monthly"];

// The six ledger kinds. Contributions and repayments bring cash into the fund;
// an expense is a deduction; welfare is set aside for the members, so it leaves
// the spendable balance without being spent; a fine is money a member handed over
// for missing a contribution, so it is cash in; a loan disbursement is the fund
// handing cash to a member, which comes back as repayments.
export const LEDGER_TYPES = ["Contribution", "Expense", "Repayment", "Welfare", "Fine", "LoanDisbursement"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

// Only these can be typed into the ledger by hand. A disbursement is written by
// the API when a loan's money actually moves, so nobody can record a payout that
// no loan backs, or leave one out and make the fund look larger than it is. A fine
// is written by the admin action on a circle, so it always names a member and the
// cycle they missed.
export const RECORDABLE_LEDGER_TYPES = LEDGER_TYPES.filter(
  (type) => type !== "LoanDisbursement" && type !== "Fine",
);
export type RecordableLedgerType = (typeof RECORDABLE_LEDGER_TYPES)[number];

const OUTFLOWS: LedgerType[] = ["Expense", "LoanDisbursement"];
const SET_ASIDE: LedgerType[] = ["Welfare"];

export const isOutflow = (type: LedgerType) => OUTFLOWS.includes(type);
export const isSetAside = (type: LedgerType) => SET_ASIDE.includes(type);
/** An entry's effect on the cash the group can still hold. */
export const entryDelta = (type: LedgerType) => (isOutflow(type) || isSetAside(type) ? -1 : 1);

/** One group's cash, read off its own ledger: what came in, less what it spent, less
 *  what it set aside, less what it handed over as loans. The API refuses a loan above
 *  this, so the ceiling a member sees is the rule that stops them rather than a number
 *  only their phone believes. */
export async function circleCash(circleId: string, executor: Pick<ReturnType<typeof getDb>, "select"> = getDb()): Promise<number> {
  const rows = await executor
    .select({ amount: contributionsTable.amount, type: contributionsTable.type })
    .from(contributionsTable)
    .where(eq(contributionsTable.circleId, circleId));
  return rows.reduce((sum, row) => sum + entryDelta(asLedgerType(row.type)) * row.amount, 0);
}

export type RosterEntry = {
  id: string;
  name: string;
  phone: string | null;
  role: MemberRole;
  status: MemberStatus;
  joinedDate: string;
  totalContributed: number;
  /** What this member has paid towards the contribution cycle running now. */
  paidThisPeriod: number;
  /** Active, has the group's contribution due, and has not reached it this cycle. */
  lateThisPeriod: boolean;
  /** The admin already recorded this cycle's fine for them. */
  finedThisPeriod: boolean;
};

export type AppState = {
  version: number;
  circles: Array<{
    id: string;
    name: string;
    members: number;
    // Roster rows the group has stored but nobody has accepted yet — counted beside
    // the headcount, never inside it.
    pendingInvites: number;
    membersList: RosterEntry[];
    target: number;
    contribution: number;
    frequency: Frequency;
    joiningFee: number;
    welfare: number;
    /** What the admin set as the fine for a missed contribution; zero for none. */
    lateFine: number;
    /** The first day of the contribution cycle running now, as `2026-10-26`. */
    cycleStart: string;
    loanInterestPercent: number;
    loanInterestPeriod: InterestPeriod;
    createdBy: string | null;
    color: "green" | "gold" | "blue";
  }>;
  contributions: Array<{
    id: string;
    circleId: string;
    amount: number;
    date: string;
    note: string;
    status: "Complete" | "Pending";
    type: LedgerType;
    member: string | null;
    loanId: string | null;
    // When the row was written, as the database recorded it. The `date` column is
    // what a saver typed or an older build stored, so a screen that needs to put an
    // entry in time — a month's total, a list in order — reads this instead.
    createdAt: string;
  }>;
  loans: Array<{
    id: string;
    applicantId: string | null;
    applicantName: string;
    circleId: string | null;
    principal: number;
    requestedPrincipal: number;
    balance: number;
    monthlyRepayment: number;
    totalPayable: number;
    months: number;
    requestedMonths: number;
    interestRate: number;
    interestPeriod: InterestPeriod;
    dueDate: string;
    // The same day in `2026-09-30` form, or null for a loan written before the app
    // stored one. An overdue figure needs a date it can compare, not a label.
    dueOn: string | null;
    purpose: string;
    status: "Active" | "Pending" | "Paid off" | "Rejected";
    submittedAt: string;
    reviewedBy: string | null;
    reviewerName: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
  }>;
};

async function readVersion(): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(appMetaTable).where(eq(appMetaTable.key, "version"));
  return Number(rows[0]?.value ?? 1);
}

async function bumpVersion(): Promise<number> {
  const db = getDb();
  const next = (await readVersion()) + 1;
  await db.execute(
    sql`INSERT INTO app_meta (key, value) VALUES ('version', ${String(next)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
  return next;
}

function asColor(value: string): "green" | "gold" | "blue" {
  if (value === "gold" || value === "blue") return value;
  return "green";
}

export function asFrequency(value: string): Frequency {
  return FREQUENCIES.includes(value as Frequency) ? (value as Frequency) : "Monthly";
}

function asContributionStatus(value: string): "Complete" | "Pending" {
  return value === "Pending" ? "Pending" : "Complete";
}

function asLedgerType(value: string): LedgerType {
  return LEDGER_TYPES.includes(value as LedgerType) ? (value as LedgerType) : "Contribution";
}

function asLoanStatus(value: string): "Active" | "Pending" | "Paid off" | "Rejected" {
  if (value === "Pending" || value === "Paid off" || value === "Rejected") return value;
  return "Active";
}

// Who a ledger row belongs to. An entry follows the member it names; only when it
// names nobody does the account that recorded it own the row.
function attributedMemberId(circle: Circle | undefined, item: { member: string | null; userId: string | null }): string | null {
  const named = (item.member ?? "").trim().toLowerCase();
  const listed = named
    ? circle?.membersList?.find((member) => member.name.trim().toLowerCase() === named)
    : undefined;
  return listed?.id ?? item.userId ?? null;
}

// Who is in the group, as the group's own record says. A circle saved before rosters
// were stored knows only the member who opened it, and that member is the admin — so
// the list starts there rather than showing an empty group to the one person who is
// certainly inside it.
function rosterOf(
  circle: Circle,
  owner: User | undefined,
  paidIn: Map<string, number>,
  paidThisCycle: Map<string, number>,
  finedThisCycle: Set<string>,
): RosterEntry[] {
  const key = (memberId: string) => `${circle.id}:${memberId}`;
  const entryFor = (member: {
    id: string;
    name: string;
    phone: string | null;
    role: MemberRole;
    status: MemberStatus;
    joinedDate: string;
  }): RosterEntry => {
    const paidThisPeriod = paidThisCycle.get(key(member.id)) ?? 0;
    return {
      id: member.id,
      name: member.name,
      phone: member.phone ?? null,
      role: member.role,
      // Rows saved before invites carried a state are people the group already has.
      status: member.status ?? "active",
      joinedDate: member.joinedDate,
      totalContributed: paidIn.get(key(member.id)) ?? 0,
      paidThisPeriod,
      // A member is behind when the group asks for a contribution and they have not
      // reached it this cycle. The admin decides whether that costs them a fine; the
      // app only reports the shortfall it can see in the ledger.
      lateThisPeriod: (member.status ?? "active") === "active" && circle.contribution > 0 && paidThisPeriod < circle.contribution,
      finedThisPeriod: finedThisCycle.has(key(member.id)),
    };
  };
  const stored = (circle.membersList ?? []).map((member) => entryFor(member));
  if (stored.length > 0 || !circle.createdBy) return stored;
  return [
    entryFor({
      id: circle.createdBy,
      name: owner?.name ?? "Group admin",
      phone: owner?.phone ?? null,
      role: "admin",
      status: "active",
      joinedDate: "",
    }),
  ];
}

// Members see the circles they belong to, the shared circle ledger and loans in
// those circles, plus their own standalone loans.
export async function getState(userId: string): Promise<AppState> {
  const db = getDb();
  const [allCircles, version, [owner]] = await Promise.all([
    db
      .select()
      .from(circlesTable)
      .where(
        or(
          eq(circlesTable.createdBy, userId),
          sql`${circlesTable.membersList} @> ${JSON.stringify([{ id: userId }])}::jsonb AND NOT (${circlesTable.membersList} @> ${JSON.stringify([{ id: userId, status: "pending" }])}::jsonb) AND NOT (${circlesTable.membersList} @> ${JSON.stringify([{ id: userId, status: "removed" }])}::jsonb)`,
        ),
      ),
    readVersion(),
    db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1),
  ]);
  const circleIds = allCircles.map((circle) => circle.id);
  const administeredCircleIds = allCircles
    .filter((circle) => circle.createdBy === userId || circle.membersList?.some(
      (member) => member.id === userId && (member.status ?? "active") === "active" &&
        (member.role === "admin" || member.role === "co-admin"),
    ))
    .map((circle) => circle.id);
  const [contributions, loans] = await Promise.all([
    circleIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(contributionsTable)
          .where(inArray(contributionsTable.circleId, circleIds))
          .orderBy(desc(contributionsTable.createdAt)),
    administeredCircleIds.length === 0
      ? db.select().from(loansTable).where(eq(loansTable.userId, userId))
      : db
          .select()
          .from(loansTable)
          .where(or(eq(loansTable.userId, userId), inArray(loansTable.circleId, administeredCircleIds))),
  ]);
  const relatedUserIds = [...new Set([
    ...loans.map((loan) => loan.userId).filter((id): id is string => Boolean(id)),
    ...loans.map((loan) => loan.reviewedBy).filter((id): id is string => Boolean(id)),
  ])];
  const relatedUsers = relatedUserIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, relatedUserIds))
    : [];
  const relatedNames = new Map(relatedUsers.map((user) => [user.id, user.name]));

  // What each member has actually paid into each group, counted from the ledger.
  // An entry follows the member it is attributed to — the person the group says
  // handed the cash over — and falls back to the account that recorded it only when
  // it names nobody. Keying every entry by its recorder would put the whole group's
  // money in the treasurer's column and leave the rest of the roster on zero.
  const circlesById = new Map(allCircles.map((circle) => [circle.id, circle]));
  const paidIn = new Map<string, number>();
  for (const item of contributions) {
    if (asLedgerType(item.type) !== "Contribution" || asContributionStatus(item.status) !== "Complete") continue;
    const paidBy = attributedMemberId(circlesById.get(item.circleId), item);
    if (!paidBy) continue;
    const key = `${item.circleId}:${paidBy}`;
    paidIn.set(key, (paidIn.get(key) ?? 0) + item.amount);
  }

  // The cycle a fine would be charged for: a weekly group restarts on Monday, a
  // fortnightly group counts from its first record, and a monthly group on the 1st.
  const firstRecord = new Map<string, Date>();
  for (const item of contributions) {
    const at = writtenAt(item.createdAt);
    if (!at) continue;
    const seen = firstRecord.get(item.circleId);
    if (!seen || at < seen) firstRecord.set(item.circleId, at);
  }
  const cycleStartByCircle = new Map<string, Date>();
  for (const circle of allCircles) {
    cycleStartByCircle.set(
      circle.id,
      cycleStart(asFrequency(circle.frequency), firstRecord.get(circle.id) ?? null),
    );
  }
  const paidThisCycle = new Map<string, number>();
  const finedThisCycle = new Set<string>();
  for (const item of contributions) {
    const start = cycleStartByCircle.get(item.circleId);
    const at = writtenAt(item.createdAt);
    if (!start || !at || at < start) continue;
    if (asContributionStatus(item.status) !== "Complete") continue;
    const type = asLedgerType(item.type);
    if (type !== "Contribution" && type !== "Fine") continue;
    const by = attributedMemberId(circlesById.get(item.circleId), item);
    if (!by) continue;
    const key = `${item.circleId}:${by}`;
    if (type === "Fine") finedThisCycle.add(key);
    else paidThisCycle.set(key, (paidThisCycle.get(key) ?? 0) + item.amount);
  }

  return {
    version,
    circles: allCircles.map((circle) => {
      const membersList = rosterOf(circle, owner, paidIn, paidThisCycle, finedThisCycle);
      const active = membersList.filter((member) => member.status === "active").length;
      const pendingInvites = membersList.filter((member) => member.status === "pending").length;
      return {
        id: circle.id,
        joinCode: circle.joinCode ?? "",
        name: circle.name,
        // The headcount is the roster's active entries, so the two can never
        // disagree on screen. An invite nobody has accepted is not a member yet,
        // and is reported beside it rather than counted inside it.
        members: active,
        pendingInvites,
        membersList,
        target: circle.target,
        contribution: circle.contribution,
        frequency: asFrequency(circle.frequency),
        joiningFee: circle.joiningFee,
        welfare: circle.welfare,
        lateFine: circle.lateFine ?? 0,
        cycleStart: isoDay(cycleStartByCircle.get(circle.id) ?? new Date()),
        loanInterestPercent: circle.loanInterestPercent,
        loanInterestPeriod: asInterestPeriod(circle.loanInterestPeriod),
        createdBy: circle.createdBy ?? null,
        color: asColor(circle.color),
      };
    }),
    contributions: contributions.map((item) => ({
      id: item.id,
      circleId: item.circleId,
      amount: item.amount,
      date: item.date,
      note: item.note,
      status: asContributionStatus(item.status),
      type: asLedgerType(item.type),
      member: item.member ?? null,
      loanId: item.loanId ?? null,
      createdAt: (item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt)).toISOString(),
    })),
    loans: loans.map((loan) => ({
      id: loan.id,
      applicantId: loan.userId ?? null,
      applicantName: loan.userId ? relatedNames.get(loan.userId) ?? "Circle member" : "Member",
      // Null for loans saved before the group was recorded; the screens then say the
      // rate without naming a group rather than naming a guess.
      circleId: loan.circleId ?? null,
      principal: loan.principal,
      requestedPrincipal: loan.requestedPrincipal || loan.principal,
      balance: loan.balance,
      monthlyRepayment: loan.monthlyRepayment,
      totalPayable: loan.totalPayable,
      months: loan.months,
      requestedMonths: loan.requestedMonths || loan.months,
      interestRate: loan.interestRate,
      interestPeriod: asInterestPeriod(loan.interestPeriod),
      dueDate: loan.dueDate,
      dueOn: loan.dueOn ?? null,
      purpose: loan.purpose,
      status: asLoanStatus(loan.status),
      submittedAt: (loan.submittedAt instanceof Date ? loan.submittedAt : new Date(loan.submittedAt)).toISOString(),
      reviewedBy: loan.reviewedBy ?? null,
      reviewerName: loan.reviewedBy ? relatedNames.get(loan.reviewedBy) ?? null : null,
      reviewedAt: loan.reviewedAt
        ? (loan.reviewedAt instanceof Date ? loan.reviewedAt : new Date(loan.reviewedAt)).toISOString()
        : null,
      rejectionReason: loan.rejectionReason ?? null,
    })),
  };
}

export async function publishState(userId: string): Promise<AppState> {
  await bumpVersion();
  const state = await getState(userId);
  await publish("state", state, userId);
  const memberIds = new Set(
    state.circles.flatMap((circle) =>
      (circle.membersList ?? [])
        .filter((member) => (member.status ?? "active") === "active")
        .map((member) => member.id),
    ),
  );
  memberIds.delete(userId);
  await Promise.all(
    [...memberIds].map(async (memberId) => {
      await publish("state", await getState(memberId), memberId);
    }),
  );
  return state;
}

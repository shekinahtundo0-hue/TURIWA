import { eq } from "drizzle-orm";
import {
  circlesTable,
  contributionsTable,
  getDb,
  hashPassword,
  loansTable,
  sessionsTable,
  usersTable,
  type CircleMemberRow,
} from "@workspace/db";
import { formatDay, isoDay } from "./money";

// A demonstration group for pilot calls. Everything here is invented and says so in its
// own labels, and it lives in its own database directory, so a demo can never be mistaken
// for a real chama's records.
const DEMO_USER_ID = "demo-treasurer";
const DEMO_CIRCLE_ID = "demo-circle";
export const DEMO_PHONE = "+254700000700";
export const DEMO_PASSWORD = "demo123";

// Six monthly meetings of a group of eight, at KSh 500 a member. Counted back from
// the month the demo is built, so "this month" on a pilot call always has real rows
// in it instead of a fixed date that went stale the day it was written.
const MEETINGS = [
  { paid: ["Achieng", "Otieno", "Wanjiru", "Kiptoo", "Njeri"] },
  { paid: ["Achieng", "Otieno", "Wanjiru", "Njeri"] },
  { paid: ["Achieng", "Otieno", "Kiptoo", "Njeri"] },
  { paid: ["Achieng", "Otieno", "Wanjiru", "Kiptoo"] },
  { paid: ["Achieng", "Wanjiru", "Kiptoo", "Njeri"] },
  { paid: ["Achieng", "Otieno", "Wanjiru", "Kiptoo", "Njeri"] },
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A meeting day some months from now, so a demo loan's due date is in the right
 *  season whenever the workspace is rebuilt rather than a frozen calendar date. */
function monthsFromNow(months: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + months, 10);
}

/** The Nth meeting counting back from this month: the 10th day, 10:00 local. */
function meetingAt(stepsBack: number) {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth() - stepsBack, 10, 10, 0);
  return {
    label: `${MONTH_NAMES[day.getMonth()]} ${day.getFullYear()}`,
    date: `10 ${MONTH_NAMES[day.getMonth()]} ${day.getFullYear()}`,
    day,
  };
}

// What the group spent at three of those meetings: rent, a replacement of chairs,
// and welfare handed to a member's family.
const SPENDING = [
  { stepsBack: 5, amount: 1000, member: "Landlord (synthetic)", note: "Hall rent for the meeting (synthetic)", type: "Expense" },
  { stepsBack: 2, amount: 2400, member: "Furniture supplier (synthetic)", note: "Six chairs replaced after the meeting (synthetic)", type: "Expense" },
  { stepsBack: 1, amount: 1500, member: "Njeri (synthetic)", note: "Welfare sent to a member's family (synthetic)", type: "Welfare" },
];

const ROSTER = [
  "Achieng", "Otieno", "Wanjiru", "Kiptoo", "Njeri", "Mwangi", "Fatuma",
] as const;

export async function seedDemoWorkspace(): Promise<string> {
  const db = getDb();
  const [existing] = await db.select().from(circlesTable).where(eq(circlesTable.id, DEMO_CIRCLE_ID)).limit(1);
  if (existing) return "Demo group already present in this database — nothing added.";

  // The built-in demo seed writes two plausible-looking groups with real Kenyan names and
  // no label saying they are made up. On a pilot call that is exactly the kind of figure
  // a treasurer could mistake for their own book, so a demo workspace clears those
  // fixtures — and only those: if this database holds any account or group that is not one
  // of the built-in fixtures, the seed refuses to run against it.
  const [accounts, groups] = await Promise.all([
    db.select({ id: usersTable.id }).from(usersTable),
    db.select({ id: circlesTable.id }).from(circlesTable),
  ]);
  const fixtureAccounts = new Set(["user-sheila"]);
  const fixtureGroups = new Set(["harambee", "estate"]);
  const holdsOnlyFixtures =
    accounts.every((account) => fixtureAccounts.has(account.id)) &&
    groups.every((group) => fixtureGroups.has(group.id));
  if (!holdsOnlyFixtures) {
    return "Refused: this database holds records that are not the built-in demo fixtures. Point DATABASE_URL at a fresh directory and run --seed-demo again.";
  }
  if (accounts.length > 0 || groups.length > 0) {
    await Promise.all([
      db.delete(sessionsTable),
      db.delete(contributionsTable),
      db.delete(loansTable),
      db.delete(circlesTable),
      db.delete(usersTable),
    ]);
  }

  await db.insert(usersTable).values({
    id: DEMO_USER_ID,
    name: "Demo Treasurer (synthetic)",
    phone: DEMO_PHONE,
    passwordHash: hashPassword(DEMO_PASSWORD),
  });

  // The roster is a column on the group row, and only two roles exist in the app today:
  // the account that opened the group is `admin`, everyone listed beside them is a
  // `member`. A demo showing a co-admin would be showing a permission the build cannot
  // actually grant (Day 2 audit, §2).
  const membersList: CircleMemberRow[] = [
    {
      id: DEMO_USER_ID,
      name: "Demo Treasurer (synthetic)",
      phone: DEMO_PHONE,
      role: "admin",
      status: "active",
      joinedDate: "2026-05-10",
    },
    ...ROSTER.map((name, index) => ({
      id: `demo-member-${index + 1}`,
      name: `${name} (synthetic)`,
      phone: `+2547000007${String(index + 1).padStart(2, "0")}`,
      role: "member" as const,
      // One is stored as not-yet-approved and two members never paid a meeting, so a
      // treasurer can ask the real question ("what does arrears look like?"). The
      // pending row is counted as an invite, beside the headcount and never inside it.
      status: index === 6 ? ("pending" as const) : ("active" as const),
      joinedDate: `2026-05-${10 + index}`,
    })),
  ];

  // An invite nobody has answered is on the roster but is not one of the group's
  // members yet, so the headcount and the goal are worked out from the active rows.
  const activeMembers = membersList.filter((member) => member.status === "active").length;

  await db.insert(circlesTable).values({
    id: DEMO_CIRCLE_ID,
    name: "Kiama Demo Chama (synthetic data)",
    members: activeMembers,
    membersList,
    // One year of the group's own cycle: every member's amount, the members, twelve
    // months. A goal set beside a headcount it does not match is a decoration, not a
    // target.
    target: 500 * activeMembers * 12,
    contribution: 500,
    frequency: "Monthly",
    joiningFee: 200,
    welfare: 100,
    loanInterestPercent: 10,
    loanInterestPeriod: "Month",
    createdBy: DEMO_USER_ID,
    color: "blue",
  });

  const rows = [];
  for (const [index, meeting] of MEETINGS.entries()) {
    const at = meetingAt(MEETINGS.length - 1 - index);
    for (const [paidIndex, member] of meeting.paid.entries()) {
      rows.push({
        id: `demo-c-${at.label.replace(" ", "")}-${paidIndex}`,
        circleId: DEMO_CIRCLE_ID,
        userId: DEMO_USER_ID,
        amount: 500,
        date: at.date,
        note: `${at.label} contribution (synthetic)`,
        status: "Complete",
        type: "Contribution",
        // The roster name, spelled exactly as the roster stores it, so the ledger's
        // member totals attribute to the person rather than to the account.
        member: `${member} (synthetic)`,
        createdAt: new Date(at.day.getTime() + paidIndex * 60_000),
      });
    }
  }
  for (const [index, spent] of SPENDING.entries()) {
    const at = meetingAt(spent.stepsBack);
    rows.push({
      id: `demo-e-${index}`,
      circleId: DEMO_CIRCLE_ID,
      userId: DEMO_USER_ID,
      amount: spent.amount,
      date: at.date,
      note: spent.note,
      status: "Complete",
      type: spent.type,
      member: spent.member,
      createdAt: new Date(at.day.getTime() + 3_600_000),
    });
  }
  await db.insert(contributionsTable).values(rows);

  await db.insert(loansTable).values([
    {
      id: "demo-loan-1",
      userId: DEMO_USER_ID,
      circleId: DEMO_CIRCLE_ID,
      principal: 6000,
      // 6,000 at the group's own 10% a month over six months is 10,629, less one
      // instalment of 1,772 already paid back.
      balance: 10629 - 1772,
      monthlyRepayment: 1772,
      totalPayable: 10629,
      months: 6,
      interestRate: 10,
      interestPeriod: "Month",
      dueDate: formatDay(monthsFromNow(2)),
      dueOn: isoDay(monthsFromNow(2)),
      purpose: "School fees (synthetic)",
      status: "Active",
    },
    {
      // A loan the group is already behind on, so the dashboard's overdue figure has a
      // real row behind it rather than a warning nobody can point at.
      id: "demo-loan-2",
      userId: DEMO_USER_ID,
      circleId: DEMO_CIRCLE_ID,
      principal: 4000,
      // 4,000 compounded the same way is 7,086, less two instalments of 1,181.
      balance: 7086 - 1181 * 2,
      monthlyRepayment: 1181,
      totalPayable: 7086,
      months: 6,
      interestRate: 10,
      interestPeriod: "Month",
      dueDate: formatDay(monthsFromNow(-1)),
      dueOn: isoDay(monthsFromNow(-1)),
      purpose: "Business stock (synthetic)",
      status: "Active",
    },
    {
      id: "demo-loan-3",
      userId: DEMO_USER_ID,
      circleId: DEMO_CIRCLE_ID,
      principal: 2000,
      balance: 3543,
      monthlyRepayment: 591,
      totalPayable: 3543,
      months: 6,
      interestRate: 10,
      interestPeriod: "Month",
      // Only a guess until somebody approves it; the term is counted from the day the
      // money is handed over.
      dueDate: formatDay(monthsFromNow(6)),
      dueOn: isoDay(monthsFromNow(6)),
      purpose: "Top-up before the share-out (synthetic)",
      status: "Pending",
    },
  ]);

  return `Seeded ${membersList.length} roster rows (${activeMembers} members, ${membersList.length - activeMembers} invite pending), ${rows.length} ledger rows and 3 loans into the demo group.`;
}

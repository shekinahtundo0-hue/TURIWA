import { eq, sql } from "drizzle-orm";
import { circlesTable, contributionsTable, loansTable, usersTable } from "./schema";
import type { AppDb } from "./client";

const DEMO_PHONE = "+254712345678";
const DEMO_USER_ID = "user-sheila";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A group's history counting back from today, one row per cycle. A period report needs
// rows that sit in different months; stamping everything with the day the database was
// made would make every "this month" figure equal the whole balance.
function monthlyHistory(circleId: string, amount: number, cycles: number, note = "Monthly contribution") {
  const now = new Date();
  return Array.from({ length: cycles }, (_, index) => {
    const on = new Date(now.getFullYear(), now.getMonth() - (cycles - 1 - index), 8, 9, 0);
    return {
      id: `${circleId}-${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, "0")}`,
      circleId,
      userId: DEMO_USER_ID,
      amount,
      date: `${String(on.getDate()).padStart(2, "0")} ${MONTH_NAMES[on.getMonth()]} ${on.getFullYear()}`,
      note,
      status: "Complete",
      type: "Contribution",
      member: "Sheila",
      createdAt: on,
    };
  });
}

export async function ensureSchema(db: AppDb): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      google_id TEXT UNIQUE,
      password_hash TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Accounts created before Google sign-in exist with NOT NULL phone/password,
  // so widen the existing table instead of only fixing fresh databases.
  await db.execute(sql`ALTER TABLE users ALTER COLUMN phone DROP NOT NULL`);
  await db.execute(sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key ON users (google_id)`);
  // Deleting an account is gated behind an authenticator app, so existing
  // databases need somewhere to keep the secret and the recovery codes.
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes TEXT`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS circles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      members INTEGER NOT NULL,
      target INTEGER NOT NULL,
      contribution INTEGER NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'Monthly',
      joining_fee INTEGER NOT NULL DEFAULT 0,
      welfare INTEGER NOT NULL DEFAULT 0,
      loan_interest_percent INTEGER NOT NULL DEFAULT 5,
      loan_interest_period TEXT NOT NULL DEFAULT 'Month',
      created_by TEXT,
      color TEXT NOT NULL
    )
  `);
  // Groups used to be monthly-only, so the old column name has to survive the
  // upgrade without losing anyone's saved amount.
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'circles' AND column_name = 'monthly')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'circles' AND column_name = 'contribution') THEN
        ALTER TABLE circles RENAME COLUMN monthly TO contribution;
      END IF;
    END $$
  `);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS contribution INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'Monthly'`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS joining_fee INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS welfare INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS loan_interest_percent INTEGER NOT NULL DEFAULT 5`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS loan_interest_period TEXT NOT NULL DEFAULT 'Month'`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS created_by TEXT`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS members_list JSONB`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contributions (
      id TEXT PRIMARY KEY,
      circle_id TEXT NOT NULL,
      user_id TEXT,
      amount INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      circle_id TEXT,
      principal INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      monthly_repayment INTEGER NOT NULL,
      total_payable INTEGER NOT NULL DEFAULT 0,
      months INTEGER NOT NULL DEFAULT 6,
      interest_rate INTEGER NOT NULL,
      interest_period TEXT NOT NULL DEFAULT 'Month',
      due_date TEXT NOT NULL,
      purpose TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  // Rows written before ownership existed get the columns the upgrade needs.
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Contribution'`);
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS member TEXT`);
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS loan_id TEXT`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS circle_id TEXT`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS total_payable INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS months INTEGER NOT NULL DEFAULT 6`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS interest_period TEXT NOT NULL DEFAULT 'Month'`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS due_on TEXT`);
  // A due date written as "15 Apr 2027" can be read back exactly once, so the rows in
  // that shape get the machine-readable date. Anything else keeps no due date rather
  // than a guessed one.
  await db.execute(sql`
    UPDATE loans SET due_on = to_char(to_date(due_date, 'DD Mon YYYY'), 'YYYY-MM-DD')
    WHERE due_on IS NULL AND due_date ~ '^[0-9]{1,2} [A-Za-z]{3} [0-9]{4}$'
  `);
  // Loans written before compounding only knew a flat fee, so they are treated as
  // six-month, per-month-rate loans that repay their stored monthly instalment. That
  // total is never allowed below the principal: a loan cannot be paid back for less
  // than it cost the fund, and an impossible figure breaks every balance derived
  // from it.
  await db.execute(sql`UPDATE loans SET total_payable = GREATEST(monthly_repayment * months, principal) WHERE total_payable = 0`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS loans_user_id_idx ON loans (user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS contributions_circle_id_idx ON contributions (circle_id)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      verified_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    )
  `);
  // Codes issued before this upgrade have nowhere to keep their try count or their
  // age, so the columns arrive together with the fresh table definition.
  await db.execute(sql`ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await db.execute(sql`ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`);
}

export async function seedIfEmpty(db: AppDb, hashPassword: (password: string) => string): Promise<void> {
  const existing = await db.select({ id: circlesTable.id }).from(circlesTable).limit(1);
  if (existing.length === 0) {
    await db.insert(circlesTable).values([
      {
        id: "harambee",
        name: "Harambee Queens",
        // The demo account is the only member this group can actually vouch for.
        members: 1,
        membersList: [{ id: DEMO_USER_ID, name: "Sheila", phone: DEMO_PHONE, role: "admin", status: "active", joinedDate: "2026-01-08" }],
        target: 240000,
        contribution: 2000,
        frequency: "Monthly",
        joiningFee: 1000,
        welfare: 500,
        loanInterestPercent: 10,
        loanInterestPeriod: "Month",
        createdBy: DEMO_USER_ID,
        color: "green",
      },
      {
        id: "estate",
        name: "Greenview Estate",
        members: 1,
        membersList: [{ id: DEMO_USER_ID, name: "Sheila", phone: DEMO_PHONE, role: "admin", status: "active", joinedDate: "2026-03-02" }],
        target: 160000,
        contribution: 1500,
        frequency: "Monthly",
        joiningFee: 500,
        welfare: 300,
        loanInterestPercent: 8,
        loanInterestPeriod: "Year",
        createdBy: DEMO_USER_ID,
        color: "gold",
      },
    ]);
    await db.insert(contributionsTable).values([
      ...monthlyHistory("harambee", 2000, 8),
      ...monthlyHistory("estate", 1500, 8),
    ]);
    await db.insert(loansTable).values([
      {
        id: "loan-1",
        userId: DEMO_USER_ID,
        circleId: "harambee",
        principal: 30000,
        balance: 26573,
        monthlyRepayment: 8858,
        // 30,000 at Harambee Queens' own 10% a month, compounded over six months,
        // with three instalments already paid.
        totalPayable: 53147,
        months: 6,
        interestRate: 10,
        interestPeriod: "Month",
        dueDate: "30 Sep 2026",
        dueOn: "2026-09-30",
        purpose: "School fees",
        status: "Active",
      },
      {
        // A request the group's admin has not decided on yet — the approvals queue
        // is a real place with a real row in it, not an empty shell.
        id: "loan-2",
        userId: DEMO_USER_ID,
        circleId: "estate",
        principal: 12000,
        balance: 12488,
        monthlyRepayment: 2082,
        // 12,000 at Greenview Estate's 8% a year, compounded over six months.
        totalPayable: 12488,
        months: 6,
        interestRate: 8,
        interestPeriod: "Year",
        dueDate: "15 Mar 2027",
        dueOn: "2027-03-15",
        purpose: "Roof repair",
        status: "Pending",
      },
    ]);
  }

  const demoUser = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, DEMO_PHONE)).limit(1);
  if (demoUser.length === 0) {
    await db.insert(usersTable).values({
      id: DEMO_USER_ID,
      name: "Sheila",
      phone: DEMO_PHONE,
      passwordHash: hashPassword("demo123"),
    });
  }

  // Rows saved before ownership was tracked can only belong to the account that has
  // always owned this database, so the upgrade keeps their badges and history
  // working instead of stranding records no one can see.
  await db.execute(sql`UPDATE circles SET created_by = ${DEMO_USER_ID} WHERE created_by IS NULL`);
  await db.execute(sql`UPDATE contributions SET user_id = ${DEMO_USER_ID} WHERE user_id IS NULL`);
  await db.execute(sql`UPDATE loans SET user_id = ${DEMO_USER_ID} WHERE user_id IS NULL`);
}

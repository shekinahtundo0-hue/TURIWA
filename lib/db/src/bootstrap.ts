import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { appMetaTable, circlesTable, contributionsTable, loansTable, usersTable } from "./schema";
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

// The shape of the schema, marked in the database so the statements below run once per shape
// instead of once per process.
//
// They used to run on every boot. Each one is a round trip to Postgres and there are over ninety
// of them, so on a hosted database reached over the network a cold isolate spent that whole time
// inside the first member's request — long enough for the app to give up and show a spinner. A
// serverless host starts a fresh isolate whenever it has been quiet, which is why the same screen
// worked after a second attempt.
//
// The marker lives in app_meta, so it is restored with the data it describes: an older backup
// comes back with its own older marker and the statements run again over it, which is what a
// restore needs.
//
// Bump SCHEMA_SHAPE every time a statement in createSchema changes, otherwise the change is
// never sent to a database that already carries the current marker. `pnpm run check:schema-shape`
// fails when the statements moved and the marker did not.
const SCHEMA_SHAPE_KEY = "schema_shape";
const SCHEMA_SHAPE = "2";

export async function ensureSchema(db: AppDb): Promise<void> {
  // The marker outlinks the statements that used to create it, so it is made here first.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  const marked = await db
    .select({ value: appMetaTable.value })
    .from(appMetaTable)
    .where(eq(appMetaTable.key, SCHEMA_SHAPE_KEY))
    .limit(1);
  if (marked[0]?.value === SCHEMA_SHAPE) return;

  await createSchema(db);

  // Only once the whole shape is in place: a body that failed halfway must be retried in full.
  await db
    .insert(appMetaTable)
    .values({ key: SCHEMA_SHAPE_KEY, value: SCHEMA_SHAPE })
    .onConflictDoUpdate({ target: appMetaTable.key, set: { value: SCHEMA_SHAPE } });
}

async function createSchema(db: AppDb): Promise<void> {
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
      join_code TEXT,
      name TEXT NOT NULL,
      members INTEGER NOT NULL,
      target INTEGER NOT NULL,
      contribution INTEGER NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'Monthly',
      joining_fee INTEGER NOT NULL DEFAULT 0,
      welfare INTEGER NOT NULL DEFAULT 0,
      late_fine INTEGER NOT NULL DEFAULT 0,
      loan_interest_percent INTEGER NOT NULL DEFAULT 5,
      loan_interest_period TEXT NOT NULL DEFAULT 'Month',
      created_by TEXT,
      color TEXT NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS join_code TEXT`);
  // Give existing circles a code without changing their IDs, settings, or ledger.
  // The predicate also makes concurrent API startups harmless.
  const circlesMissingJoinCode = await db
    .select({ id: circlesTable.id })
    .from(circlesTable)
    .where(isNull(circlesTable.joinCode));
  for (const circle of circlesMissingJoinCode) {
    await db
      .update(circlesTable)
      .set({ joinCode: randomBytes(8).toString("hex") })
      .where(and(eq(circlesTable.id, circle.id), isNull(circlesTable.joinCode)));
  }
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS circles_join_code_key ON circles (join_code)`);
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
  // Groups created before fines existed charge none until their admin sets one.
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS late_fine INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS loan_interest_percent INTEGER NOT NULL DEFAULT 5`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS loan_interest_period TEXT NOT NULL DEFAULT 'Month'`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS created_by TEXT`);
  await db.execute(sql`ALTER TABLE circles ADD COLUMN IF NOT EXISTS members_list JSONB`);
  // This application writes memberships through authenticated API handlers. Keep
  // the Co-Admin cap at the database boundary too, so a future server path cannot
  // bypass the row-locked role checks.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION enforce_circle_coadmin_limit() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.members_list IS NOT NULL AND jsonb_typeof(NEW.members_list) = 'array' AND
        (SELECT count(*) FROM jsonb_array_elements(NEW.members_list) AS item
         WHERE item->>'role' = 'co-admin' AND COALESCE(item->>'status', 'active') = 'active') > 2 THEN
        RAISE EXCEPTION 'A circle can have at most two Co-Admins.' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.execute(sql`DROP TRIGGER IF EXISTS circles_coadmin_limit ON circles`);
  await db.execute(sql`CREATE TRIGGER circles_coadmin_limit BEFORE INSERT OR UPDATE OF members_list ON circles FOR EACH ROW EXECUTE FUNCTION enforce_circle_coadmin_limit()`);
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
      status TEXT NOT NULL,
      requested_principal INTEGER NOT NULL DEFAULT 0,
      requested_months INTEGER NOT NULL DEFAULT 6,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      rejection_reason TEXT,
      application_key TEXT
    )
  `);
  // Rows written before ownership existed get the columns the upgrade needs.
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Contribution'`);
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS member TEXT`);
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS loan_id TEXT`);
  // The three audit columns a loan repayment needs. Older rows keep them empty rather
  // than being filled with a guess about who typed what ten months ago.
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS recorded_by TEXT`);
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS method TEXT`);
  await db.execute(sql`ALTER TABLE contributions ADD COLUMN IF NOT EXISTS reference TEXT`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS circle_id TEXT`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS total_payable INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS months INTEGER NOT NULL DEFAULT 6`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS interest_period TEXT NOT NULL DEFAULT 'Month'`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS due_on TEXT`);
  // Preserve each submitted request and its review history when approval terms differ.
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS requested_principal INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS requested_months INTEGER NOT NULL DEFAULT 6`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS reviewed_by TEXT`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await db.execute(sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS application_key TEXT`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS loans_application_key_unique ON loans (application_key) WHERE application_key IS NOT NULL`);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.enforce_circle_coadmin_limit() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.members_list IS NOT NULL AND jsonb_typeof(NEW.members_list) = 'array' AND
        (SELECT count(*) FROM jsonb_array_elements(NEW.members_list) AS item
         WHERE item->>'role' = 'co-admin' AND COALESCE(item->>'status', 'active') = 'active') > 2 THEN
        RAISE EXCEPTION 'A circle can have at most two Co-Admins.' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.execute(sql`DROP TRIGGER IF EXISTS circles_coadmin_limit ON circles`);
  await db.execute(sql`CREATE TRIGGER circles_coadmin_limit BEFORE INSERT OR UPDATE OF members_list ON circles FOR EACH ROW EXECUTE FUNCTION public.enforce_circle_coadmin_limit()`);
  await db.execute(sql`UPDATE loans SET requested_principal = principal WHERE requested_principal = 0`);
  await db.execute(sql`UPDATE loans SET requested_months = months WHERE requested_months = 6 AND months <> 6`);
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
  // Every read of a member's book filters these columns: their own loans plus the loans
  // of the groups they administer (`/state`), the pending queue by status, and the overdue
  // sweep by due day. The ledger rows a loan writes are found by the loan they belong to.
  await db.execute(sql`CREATE INDEX IF NOT EXISTS loans_circle_id_idx ON loans (circle_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS loans_status_idx ON loans (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS loans_due_on_idx ON loans (due_on)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS contributions_loan_id_idx ON contributions (loan_id)`);
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

  // Notifications are written by the API from the event that caused them and read
  // only by the account they name, so the table carries its own recipient column.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      circle_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      entity_id TEXT,
      read_at TIMESTAMP,
      dedupe_key TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS circle_id TEXT`);
  await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT`);
  await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id TEXT`);
  await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC)`);
  // A partial unique index leaves un-deduped notifications free while making a
  // reminder or receipt that carries a key impossible to write twice.
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_unique ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id TEXT NOT NULL,
      circle_id TEXT NOT NULL DEFAULT '',
      contribution_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      loan_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      meeting_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      savings_updates BOOLEAN NOT NULL DEFAULT TRUE,
      vote_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, circle_id)
    )
  `);
  await db.execute(sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS vote_reminders BOOLEAN NOT NULL DEFAULT TRUE`);
  await db.execute(sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS meeting_reminders BOOLEAN NOT NULL DEFAULT TRUE`);
  await db.execute(sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS savings_updates BOOLEAN NOT NULL DEFAULT TRUE`);

  // Circle engagement records remain server mediated: every route checks the
  // current active roster before it reads or changes these rows.
  await db.execute(sql`CREATE TABLE IF NOT EXISTS savings_goals (id TEXT PRIMARY KEY, circle_id TEXT NOT NULL, created_by TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'General', target_amount INTEGER NOT NULL CHECK (target_amount > 0), start_on TEXT NOT NULL, target_on TEXT NOT NULL, frequency TEXT NOT NULL DEFAULT 'Monthly', member_targets JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'active', cancel_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS savings_goals_circle_idx ON savings_goals(circle_id, created_at DESC)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS savings_goal_entries (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES savings_goals(id), contribution_id TEXT NOT NULL UNIQUE REFERENCES contributions(id), user_id TEXT NOT NULL, request_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(goal_id,user_id,request_key))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS circle_meetings (id TEXT PRIMARY KEY, circle_id TEXT NOT NULL, created_by TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ, location TEXT NOT NULL DEFAULT '', meeting_type TEXT NOT NULL DEFAULT 'Regular', status TEXT NOT NULL DEFAULT 'scheduled', minutes TEXT NOT NULL DEFAULT '', attachments JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS meetings_circle_date_idx ON circle_meetings(circle_id, starts_at)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS meeting_attendance (meeting_id TEXT NOT NULL REFERENCES circle_meetings(id), user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'attending', note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(meeting_id,user_id))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS meeting_action_items (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES circle_meetings(id), assigned_to TEXT NOT NULL, title TEXT NOT NULL, due_on TEXT, status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS circle_proposals (id TEXT PRIMARY KEY, circle_id TEXT NOT NULL, created_by TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TIMESTAMPTZ NOT NULL, deadline TIMESTAMPTZ NOT NULL, eligible_user_ids JSONB NOT NULL, anonymous BOOLEAN NOT NULL DEFAULT FALSE, approval_threshold INTEGER NOT NULL DEFAULT 50 CHECK(approval_threshold BETWEEN 1 AND 100), allow_abstentions BOOLEAN NOT NULL DEFAULT FALSE, results_visibility TEXT NOT NULL DEFAULT 'after_close', status TEXT NOT NULL DEFAULT 'open', closed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS proposal_options (id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES circle_proposals(id), label TEXT NOT NULL, position INTEGER NOT NULL)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS proposal_votes (id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES circle_proposals(id), voter_key TEXT NOT NULL, voter_user_id TEXT, option_id TEXT NOT NULL REFERENCES proposal_options(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(proposal_id,voter_key))`);

  // These guards use the API's existing sessions, not a caller-supplied user id. The
  // handler must set_config('turiwa.session_token', req.sessionToken, true) inside
  // the same transaction as the write. They do not replace hosted public-role
  // lockdown: the table owner can still disable triggers or alter these functions.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.turiwa_session_actor() RETURNS text
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
    DECLARE
      actor_id text;
    BEGIN
      SELECT u.id INTO actor_id
      FROM public.sessions AS s JOIN public.users AS u ON u.id = s.user_id
      WHERE s.token = NULLIF(current_setting('turiwa.session_token', true), '')
        AND s.expires_at > clock_timestamp();
      IF actor_id IS NULL THEN
        RAISE EXCEPTION 'A valid, unexpired session token is required.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN actor_id;
    END;
    $$
  `);
  await db.execute(sql`REVOKE EXECUTE ON FUNCTION public.turiwa_session_actor() FROM PUBLIC`);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.enforce_loan_integrity() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
    DECLARE
      actor_id text;
      loan_circle public.circles%ROWTYPE;
      funding boolean;
    BEGIN
      funding := NEW.status NOT IN ('Pending', 'Rejected');
      IF TG_OP = 'UPDATE' THEN
        IF ROW(NEW.user_id, NEW.circle_id) IS DISTINCT FROM ROW(OLD.user_id, OLD.circle_id) THEN
          RAISE EXCEPTION 'Loan borrower and circle are immutable.' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
          (OLD.status = 'Pending' AND NEW.status IN ('Active', 'Rejected')) OR
          (OLD.status = 'Active' AND NEW.status = 'Paid off')
        ) THEN
          RAISE EXCEPTION 'Invalid loan status transition.' USING ERRCODE = 'check_violation';
        END IF;
        funding := OLD.status = 'Pending' AND NEW.status = 'Active';
        IF OLD.status <> 'Pending' AND
          ROW(NEW.reviewed_by, NEW.reviewed_at) IS DISTINCT FROM ROW(OLD.reviewed_by, OLD.reviewed_at) THEN
          RAISE EXCEPTION 'Loan review history is immutable.' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status NOT IN ('Pending', 'Rejected') THEN
          IF ROW(NEW.principal, NEW.total_payable, NEW.monthly_repayment, NEW.months,
                 NEW.interest_rate, NEW.interest_period, NEW.due_date, NEW.due_on,
                 NEW.requested_principal, NEW.requested_months, NEW.submitted_at)
             IS DISTINCT FROM
             ROW(OLD.principal, OLD.total_payable, OLD.monthly_repayment, OLD.months,
                 OLD.interest_rate, OLD.interest_period, OLD.due_date, OLD.due_on,
                 OLD.requested_principal, OLD.requested_months, OLD.submitted_at) THEN
            RAISE EXCEPTION 'Funded loan principal and terms are immutable.' USING ERRCODE = 'check_violation';
          END IF;
          -- Do not revalidate legacy terms or self-review here. Even an old balance
          -- above its recorded total can be repaid, but not increased or made negative.
          IF NEW.balance IS DISTINCT FROM OLD.balance AND (NEW.balance < 0 OR NEW.balance > OLD.balance) THEN
            RAISE EXCEPTION 'Repayments must reduce the balance without going below zero.' USING ERRCODE = 'check_violation';
          END IF;
        END IF;
      ELSE
        IF NEW.status NOT IN ('Pending', 'Active', 'Paid off', 'Rejected') THEN
          RAISE EXCEPTION 'Invalid loan status.' USING ERRCODE = 'check_violation';
        END IF;
        -- Zero is the old column default for a request whose amount was not supplied separately.
        IF NEW.requested_principal = 0 THEN NEW.requested_principal := NEW.principal; END IF;
      END IF;
      IF NEW.status = 'Pending' AND (NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Pending loans cannot claim approval metadata.' USING ERRCODE = 'check_violation';
      END IF;
      IF TG_OP = 'INSERT' OR funding OR NEW.status = 'Pending' THEN
        IF NEW.principal <= 0 OR NEW.monthly_repayment <= 0 OR NEW.total_payable < NEW.principal
          OR NEW.months <= 0 OR NEW.requested_principal <= 0 OR NEW.requested_months <= 0
          OR NEW.interest_rate < 0 OR NEW.interest_period NOT IN ('Month', 'Year')
          OR NEW.balance < 0 OR NEW.balance > NEW.total_payable THEN
          RAISE EXCEPTION 'Invalid loan amounts, balance or terms.' USING ERRCODE = 'check_violation';
        END IF;
      END IF;
      IF NEW.status = 'Paid off' AND NEW.balance <> 0 THEN
        RAISE EXCEPTION 'A paid-off loan must have zero balance.' USING ERRCODE = 'check_violation';
      END IF;
      IF funding THEN
        IF NEW.user_id IS NULL OR NEW.circle_id IS NULL THEN
          RAISE EXCEPTION 'A funded loan must have a borrower and circle.' USING ERRCODE = 'check_violation';
        END IF;
        -- Serialize approval with roster/ownership changes, and check the token after
        -- acquiring the lock so an expired session cannot survive a lock wait.
        SELECT * INTO loan_circle FROM public.circles WHERE id = NEW.circle_id FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'The loan circle does not exist.' USING ERRCODE = 'check_violation';
        END IF;
        actor_id := public.turiwa_session_actor();
        IF actor_id = NEW.user_id THEN
          RAISE EXCEPTION 'A borrower cannot approve their own loan.' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF actor_id IS DISTINCT FROM loan_circle.created_by AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(loan_circle.members_list) = 'array'
            THEN loan_circle.members_list ELSE '[]'::jsonb END) AS member
          WHERE member->>'id' = actor_id AND member->>'role' IN ('admin', 'co-admin')
            AND COALESCE(member->>'status', 'active') = 'active'
        ) THEN
          RAISE EXCEPTION 'Only a current circle manager can approve a loan.' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by IS DISTINCT FROM actor_id THEN
          RAISE EXCEPTION 'The supplied reviewer does not match the authenticated actor.' USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.reviewed_by := actor_id;
        NEW.reviewed_at := clock_timestamp();
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.execute(sql`REVOKE EXECUTE ON FUNCTION public.enforce_loan_integrity() FROM PUBLIC`);
  await db.execute(sql`DROP TRIGGER IF EXISTS loans_integrity ON public.loans`);
  await db.execute(sql`CREATE TRIGGER loans_integrity BEFORE INSERT OR UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.enforce_loan_integrity()`);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.enforce_circle_role_authority() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
    DECLARE
      old_roster jsonb;
      new_roster jsonb;
      needs_primary boolean;
      actor_id text;
    BEGIN
      needs_primary := NEW.created_by IS DISTINCT FROM OLD.created_by;
      IF NEW.members_list IS DISTINCT FROM OLD.members_list THEN
        IF NEW.members_list IS NOT NULL AND jsonb_typeof(NEW.members_list) <> 'array' THEN
          RAISE EXCEPTION 'The circle roster must be an array.' USING ERRCODE = 'check_violation';
        END IF;
        old_roster := CASE WHEN jsonb_typeof(OLD.members_list) = 'array' THEN OLD.members_list ELSE '[]'::jsonb END;
        new_roster := COALESCE(NEW.members_list, '[]'::jsonb);
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(new_roster) AS member
          WHERE jsonb_typeof(member) <> 'object' OR NULLIF(member->>'id', '') IS NULL) OR
          EXISTS (SELECT 1 FROM jsonb_array_elements(new_roster) AS member
            GROUP BY member->>'id' HAVING count(*) > 1) THEN
          RAISE EXCEPTION 'Circle members must have unique, nonempty ids.' USING ERRCODE = 'check_violation';
        END IF;
        -- Compare authority by member id, not array order or display fields. A normal
        -- member can join/leave without a primary token; adding/removing/reactivating
        -- a manager or changing any existing role cannot use that exception.
        SELECT needs_primary OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(old_roster) AS before_member
          FULL JOIN jsonb_array_elements(new_roster) AS after_member
            ON before_member->>'id' = after_member->>'id'
          WHERE COALESCE(before_member->>'role', 'member') IS DISTINCT FROM COALESCE(after_member->>'role', 'member')
            OR ((before_member->>'role' IN ('admin', 'co-admin') OR after_member->>'role' IN ('admin', 'co-admin')
                 OR before_member->>'id' = OLD.created_by OR after_member->>'id' = OLD.created_by)
                AND (before_member IS NULL OR after_member IS NULL OR
                  COALESCE(before_member->>'status', 'active') IS DISTINCT FROM COALESCE(after_member->>'status', 'active')))
        ) INTO needs_primary;
      END IF;
      IF needs_primary THEN
        -- UPDATE already holds the circle row lock. Authority is always OLD.created_by,
        -- never a new owner or a role supplied in this same write.
        actor_id := public.turiwa_session_actor();
        IF actor_id IS DISTINCT FROM OLD.created_by THEN
          RAISE EXCEPTION 'Only the current primary admin can change circle authority.' USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.execute(sql`REVOKE EXECUTE ON FUNCTION public.enforce_circle_role_authority() FROM PUBLIC`);
  await db.execute(sql`DROP TRIGGER IF EXISTS circles_role_authority ON public.circles`);
  await db.execute(sql`CREATE TRIGGER circles_role_authority BEFORE UPDATE ON public.circles FOR EACH ROW EXECUTE FUNCTION public.enforce_circle_role_authority()`);
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
        balance: 53147,
        monthlyRepayment: 8858,
        // A sample request, not a self-approved payout: a different manager must
        // approve it with a real session before any money can move.
        totalPayable: 53147,
        months: 6,
        interestRate: 10,
        interestPeriod: "Month",
        dueDate: "30 Sep 2026",
        dueOn: "2026-09-30",
        purpose: "School fees",
        status: "Pending",
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

  // Keep the old contribution attribution, but never guess a circle's primary or
  // rewrite a loan's borrower to make legacy data pass the authority guards.
  await db.execute(sql`UPDATE contributions SET user_id = ${DEMO_USER_ID} WHERE user_id IS NULL`);
}

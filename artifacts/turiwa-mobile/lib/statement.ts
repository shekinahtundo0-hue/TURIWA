import { Platform, Share } from 'react-native';
import type { Contribution, Loan } from './api';
import { entryDate, entryDelta, isLoanEntry, isLentOut, isOutflow, isSetAside, kes, monthKey, monthLabel, repaidOnRecord } from './api';

/** The period a report covers: a month key like `2026-10`, or `All` for every row
 *  the account holds. Nothing in here invents a row to fill an empty month. */
export const ALL_PERIODS = 'All';
export type Period = string;

export const periodLabel = (period: Period) => (period === ALL_PERIODS ? 'All records' : monthLabel(period));

/** Does this row fall inside the period? `2026-10` style keys compare in order, so a
 *  string comparison is the whole of the date arithmetic. */
const inPeriod = (item: Contribution, period: Period) =>
  period === ALL_PERIODS || monthKey(item) === period;

const before = (item: Contribution, period: Period) => monthKey(item) < period;

/**
 * A statement is the ledger split into what came in, what went out, and what is left.
 * `opening` is every row older than the period, so the period's own rows explain the
 * difference between it and `closing` — a report whose totals cannot be added up by
 * hand is not a report.
 */
export type Statement = {
  period: Period;
  label: string;
  rows: Contribution[];
  /** The fund's cash before this period's first row. */
  opening: number;
  contributions: number;
  repaid: number;
  /** Money members handed over as late-contribution fines. */
  fines: number;
  expenses: number;
  welfare: number;
  paidOut: number;
  /** Money the period received. */
  moneyIn: number;
  /** Money the period handed over. */
  moneyOut: number;
  closing: number;
  /** Rows a treasurer has recorded but nobody has confirmed. */
  awaitingConfirmation: number;
  /** Rows the app wrote for a loan's own money, which carry no typed date. */
  backfilled: number;
};

export function buildStatement(items: Contribution[], period: Period): Statement {
  const rows = items.filter((item) => inPeriod(item, period));
  const sum = (test: (item: Contribution) => boolean) =>
    rows.reduce((total, item) => total + (test(item) ? item.amount : 0), 0);
  const contributions = sum((item) => item.type === 'Contribution');
  const repaid = sum((item) => item.type === 'Repayment');
  const fines = sum((item) => item.type === 'Fine');
  const expenses = sum((item) => isOutflow(item.type));
  const welfare = sum((item) => isSetAside(item.type));
  const paidOut = sum((item) => isLentOut(item.type));
  const moneyIn = contributions + repaid + fines;
  const moneyOut = expenses + welfare + paidOut;
  const opening = period === ALL_PERIODS
    ? 0
    : items.filter((item) => before(item, period)).reduce((total, item) => total + entryDelta(item.type) * item.amount, 0);
  return {
    period,
    label: periodLabel(period),
    rows,
    opening,
    contributions,
    repaid,
    fines,
    expenses,
    welfare,
    paidOut,
    moneyIn,
    moneyOut,
    closing: opening + moneyIn - moneyOut,
    awaitingConfirmation: rows.filter((item) => item.status === 'Pending').length,
    backfilled: rows.filter((item) => isLoanEntry(item) && item.date === 'On file').length,
  };
}

/** What the fund is holding across every group, from the same rows. A statement that
 *  ends somewhere else has picked up a row the report cannot see. */
export const fundFromRows = (items: Contribution[]) =>
  items.reduce((total, item) => total + entryDelta(item.type) * item.amount, 0);

/**
 * The plain-language read of a period, in three parts: what happened, what wants
 * attention, and what does not tie out. Every sentence names a figure this file has
 * already added up, because a summary that can disagree with the ledger underneath it
 * is worse than no summary.
 */
export function monthlySummary(
  statement: Statement,
  detail: {
    planned: number;
    overdue: Loan[];
    requests: Loan[];
    unlinked: Loan[];
    gaps: number;
    unassigned: number;
  },
): string[] {
  const movement =
    statement.moneyIn === 0 && statement.moneyOut === 0
      ? `${statement.label}: nothing was recorded this period.`
      : `${statement.label}: ${kes(statement.moneyIn)} in, ${kes(statement.moneyOut)} out. The fund moved from ${kes(statement.opening)} to ${kes(statement.closing)}.`;
  const lines = [movement];

  if (statement.period !== ALL_PERIODS && detail.planned > 0) {
    const short = detail.planned - statement.contributions;
    lines.push(
      short > 0
        ? `The group agreed to receive ${kes(detail.planned)} this month and received ${kes(statement.contributions)} — ${kes(short)} outstanding from members.`
        : `The group received ${kes(statement.contributions)}, against the ${kes(detail.planned)} it agreed to take in a month.`,
    );
  }

  if (detail.overdue.length > 0) {
    const owed = detail.overdue.reduce((sum, loan) => sum + loan.balance, 0);
    lines.push(
      `${detail.overdue.length} loan${detail.overdue.length === 1 ? '' : 's'} are past their due date with ${kes(owed)} still owing.`,
    );
  }
  if (detail.requests.length > 0) {
    lines.push(
      `${detail.requests.length} loan request${detail.requests.length === 1 ? '' : 's'} are waiting for a decision; no money has moved on them.`,
    );
  }
  if (statement.awaitingConfirmation > 0) {
    const count = statement.awaitingConfirmation;
    lines.push(
      `${count} ${count === 1 ? 'entry' : 'entries'} in this period ${count === 1 ? 'is' : 'are'} recorded but not yet confirmed.`,
    );
  }

  // What does not tie, said plainly. A report that hides a gap is how a treasurer
  // discovers it at the wrong moment.
  const loose: string[] = [];
  if (detail.unassigned !== 0) loose.push(`${kes(Math.abs(detail.unassigned))} of entries belong to a group this account cannot open`);
  if (detail.unlinked.length > 0)
    loose.push(`${detail.unlinked.length} loan${detail.unlinked.length === 1 ? '' : 's'} have no group, so their cash sits in no group ledger`);
  if (detail.gaps > 0) loose.push(`${kes(detail.gaps)} is where a loan's balance and its repayment rows tell different stories`);
  lines.push(
    loose.length === 0
      ? 'Every entry belongs to a group, and each loan\'s repayments match the balance it carries.'
      : `To check: ${loose.join('; ')}.`,
  );
  return lines;
}

/** The estimate the app can defend: at the rate the group agreed, how many months of
 *  saving the goal still needs. Labelled an estimate because it assumes everyone pays. */
export function goalEstimate(saved: number, target: number, plannedPerMonth: number): string {
  if (target <= 0) return 'No goal set for this group.';
  if (saved >= target) return 'Goal reached.';
  if (plannedPerMonth <= 0) return 'No monthly plan to project from.';
  const months = Math.ceil((target - saved) / plannedPerMonth);
  return `About ${months} more month${months === 1 ? '' : 's'} at the agreed rate, if everyone pays.`;
}

/** One loan's two accounts of the same money: what its balance says came back, and
 *  what the rows say. Zero difference means the loan and the ledger agree. */
export function loanTie(loan: Loan, ledgerRepaid: number) {
  const onRecord = repaidOnRecord(loan);
  return { onRecord, ledgerRepaid, difference: onRecord - ledgerRepaid };
}

const cell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

/** A statement as a spreadsheet: the totals first, as their own labelled rows, then
 *  every entry with the reference the ledger gives it. A treasurer can add the column
 *  and reach the closing figure. */
export function statementCsv(statement: Statement, groupName: string): string {
  return ledgerCsv(statement.rows, () => groupName, [
    ['Report', 'Turiwa statement'],
    ['Group', groupName],
    ['Period', statement.label],
    ['Opening balance (KES)', statement.opening],
    ['Contributions (KES)', statement.contributions],
    ['Loan repayments received (KES)', statement.repaid],
    ['Late fines received (KES)', statement.fines],
    ['Expenses (KES)', statement.expenses],
    ['Welfare set aside (KES)', statement.welfare],
    ['Loan money paid out (KES)', statement.paidOut],
    ['Closing balance (KES)', statement.closing],
  ]);
}

/** Any set of ledger rows, behind a block of labelled figures. The columns are the
 *  same ones the screen shows, so the file and the screen cannot describe different
 *  records, and every row carries the id the ledger already gave it — that reference
 *  is what a member quotes when they report a discrepancy. */
export function ledgerCsv(rows: Contribution[], circleName: (circleId: string) => string, meta: (string | number)[][]): string {
  const net = rows.reduce((sum, item) => sum + entryDelta(item.type) * item.amount, 0);
  const heading: (string | number)[][] = [
    ...meta,
    ['Net of these entries (KES)', net],
    [],
    ['Date', 'Reference', 'Description', 'Group', 'Member', 'Type', 'Status', 'Amount (KES)'],
  ];
  const body = rows.map((item) => [
    entryDate(item),
    item.id,
    item.note,
    circleName(item.circleId),
    item.member ?? '',
    item.type,
    item.status,
    entryDelta(item.type) * item.amount,
  ]);
  return [...heading, ...body].map((row) => row.map(cell).join(',')).join('\r\n');
}

export const csvFileName = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;

/** Save it. A member's own records are not a paid feature, so this is on every
 *  statement screen and no screen asks permission first. */
export function saveCsv(name: string, csv: string): void {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  Share.share({ title: name, message: csv }).catch(() => undefined);
}

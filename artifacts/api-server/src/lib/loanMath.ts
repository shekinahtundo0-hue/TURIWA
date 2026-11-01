import type { InterestPeriod } from "@workspace/db";

// A loan runs for six months: the same term the due date has always used.
export const LOAN_MONTHS = 6;

export const INTEREST_PERIODS: InterestPeriod[] = ["Month", "Year"];

export function asInterestPeriod(value: unknown): InterestPeriod {
  return value === "Year" ? "Year" : "Month";
}

/** The rate applied once per month. A yearly rate is the nominal annual rate, so
 *  it is charged as one twelfth of it each month. */
export function monthlyRate(percent: number, period: InterestPeriod): number {
  return period === "Year" ? percent / 100 / 12 : percent / 100;
}

export type LoanQuote = {
  totalPayable: number;
  monthlyRepayment: number;
  // Rounding six instalments up overshoots the total by a few shillings, and the last
  // payment is then refused as an overpayment. The term is the flat instalment five
  // times, then whatever is actually left.
  finalRepayment: number;
  interest: number;
  months: number;
};

/** The day `months` calendar months from `from`. Not a fixed count of days: 183 days is
 *  never six months, it drifts with the length of the months it crosses, and the term
 *  on screen is stated in months. A day that the target month does not have (the 31st)
 *  lands on that month's last day. */
export function dueAfterMonths(months: number, from = new Date()): Date {
  const day = from.getDate();
  const due = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
  due.setDate(Math.min(day, lastDay));
  return due;
}

/** Compound interest: each month the outstanding balance grows by the monthly rate
 *  before the next month starts, so the borrower pays interest on interest. */
export function quoteLoan(
  principal: number,
  percent: number,
  period: InterestPeriod,
  months = LOAN_MONTHS,
): LoanQuote {
  const rate = monthlyRate(percent, period);
  const term = [3, 6, 9, 12].includes(months) ? months : LOAN_MONTHS;
  const totalPayable = Math.round(principal * Math.pow(1 + rate, term));
  const monthlyRepayment = Math.ceil(totalPayable / term);
  return {
    totalPayable,
    monthlyRepayment,
    finalRepayment: totalPayable - monthlyRepayment * (term - 1),
    interest: totalPayable - principal,
    months: term,
  };
}

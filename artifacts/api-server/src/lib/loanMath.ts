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

/** Compound interest in whole KES, exactly as it has always been charged: the balance
 *  grows by the monthly rate once per month and the total is rounded to the shilling at
 *  the end of the term. The rate is kept as the exact fraction percent/100 (or
 *  percent/1200 a year) and the arithmetic runs on BigInt, because `Math.pow` on a float
 *  drifts by a fraction of a shilling and can tip a total that lands on a half-shilling
 *  either way — the number the group books must not depend on binary rounding. */
export function compoundTotal(principal: number, percent: number, period: InterestPeriod, months: number): number {
  const num = BigInt(Math.round(percent));
  const den = BigInt(period === "Year" ? 1200 : 100);
  let top = BigInt(principal);
  let bottom = 1n;
  for (let month = 0; month < months; month += 1) {
    top *= den + num;
    bottom *= den;
  }
  // Round half up on the exact fraction: (2·top + bottom) / (2·bottom) truncated.
  return Number((top * 2n + bottom) / (bottom * 2n));
}

/** Compound interest: each month the outstanding balance grows by the monthly rate
 *  before the next month starts, so the borrower pays interest on interest. */
export function quoteLoan(
  principal: number,
  percent: number,
  period: InterestPeriod,
  months = LOAN_MONTHS,
): LoanQuote {
  const term = [3, 6, 9, 12].includes(months) ? months : LOAN_MONTHS;
  const totalPayable = compoundTotal(Math.round(principal), percent, period, term);
  const monthlyRepayment = Math.ceil(totalPayable / term);
  return {
    totalPayable,
    monthlyRepayment,
    finalRepayment: totalPayable - monthlyRepayment * (term - 1),
    interest: totalPayable - principal,
    months: term,
  };
}

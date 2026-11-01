import type { InterestPeriod } from './api';

// Mirrors artifacts/api-server/src/lib/loanMath.ts: the server owns the numbers it
// stores, this only reproduces them so a member can see the quote before applying.
export const LOAN_MONTHS = 6;

export const monthlyRate = (percent: number, period: InterestPeriod) =>
  period === 'Year' ? percent / 100 / 12 : percent / 100;

export type LoanQuote = {
  totalPayable: number;
  monthlyRepayment: number;
  // The last instalment, after five rounded ones have gone: six rounded instalments
  // overshoot the total, and the server refuses the surplus as an overpayment.
  finalRepayment: number;
  interest: number;
  months: number;
};

/** The exact whole-KES compound total the server books: the rate is the fraction
 *  percent/100 (or percent/1200 a year), applied once per month, rounded to the
 *  shilling only at the end of the term. BigInt because Math.pow drifts a fraction of
 *  a shilling and a quote shown before applying must match the number stored after it. */
export function compoundTotal(principal: number, percent: number, period: InterestPeriod, months: number): number {
  const num = BigInt(Math.round(percent));
  const den = BigInt(period === 'Year' ? 1200 : 100);
  let top = BigInt(principal);
  let bottom = 1n;
  for (let month = 0; month < months; month += 1) {
    top *= den + num;
    bottom *= den;
  }
  return Number((top * 2n + bottom) / (bottom * 2n));
}

/** Each month the outstanding balance grows by the monthly rate before the next
 *  month starts, so the borrower pays interest on interest. */
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

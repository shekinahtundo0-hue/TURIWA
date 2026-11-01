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

/** Each month the outstanding balance grows by the monthly rate before the next
 *  month starts, so the borrower pays interest on interest. */
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

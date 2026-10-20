// The same money format the app uses, so a refusal the member reads in a server
// message and the figure on the screen in front of them are written identically.
const KE = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

/** "KES 1,500", or "−KES 1,500" for a shortfall. */
export function kes(value: number): string {
  return `${value < 0 ? "−" : ""}KES ${KE.format(Math.abs(Math.round(value || 0)))}`;
}

/** "15 Apr 2027" — the day style every date in this app already shows. */
export function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "2027-04-15" for the same day. Written from the local parts rather than
 *  `toISOString()`, which would move a due date a day when the clock is behind UTC. */
export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, "0")}`;
}

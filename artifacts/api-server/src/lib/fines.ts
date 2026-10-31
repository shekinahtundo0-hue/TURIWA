import type { Frequency } from "./store";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The first day of the contribution cycle that is running now. A monthly group's
 *  cycle is its calendar month and a weekly group's starts on Monday, so the answer
 *  never depends on when the first row happened to be written. A fortnightly group
 *  has no calendar anchor, so its cycles count from the group's own first ledger row
 *  — the earliest day the group can be shown to have been running. */
export function cycleStart(frequency: Frequency, firstRecord: Date | null, now = new Date()): Date {
  const today = startOfDay(now);
  if (frequency === "Monthly") return new Date(today.getFullYear(), today.getMonth(), 1);
  if (frequency === "Weekly") {
    const weekday = today.getDay();
    // getDay() counts Sunday as 0, but the week a group pays in starts on Monday.
    const back = weekday === 0 ? 6 : weekday - 1;
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
  }
  const anchor = firstRecord ? startOfDay(firstRecord) : today;
  if (anchor.getTime() >= today.getTime()) return today;
  const cycles = Math.floor((today.getTime() - anchor.getTime()) / (14 * DAY_MS));
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + cycles * 14);
}

/** "this month" / "this week" / "this fortnight" — the cycle a member is behind on. */
export function cycleLabel(frequency: Frequency): string {
  if (frequency === "Monthly") return "this month";
  if (frequency === "Weekly") return "this week";
  return "this fortnight";
}

/** The moment a ledger row was written, or null when the row's timestamp cannot be
 *  read. Period sums compare rows by what the database wrote, not by the label
 *  someone typed into the date field. */
export function writtenAt(value: Date | string): Date | null {
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** UTC calendar day, e.g. "2026-01-31". Daily limits and the budget reset at UTC midnight. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function msUntilUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

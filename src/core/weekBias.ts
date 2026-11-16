/*
 * THE WEEK'S BIAS (Batch DRONE, Section 1.7; CORE 8.1: "the week runs one bin
 * high every day", Mon 2-3, Tue 1-2, Wed 0-1, Sat 1-2 against 1-2 / 0-1 /
 * Flat / 0-1). The seven-day calls this phone made are kept on it
 * (src/lib/weekBiasStore.ts, localStorage only; nothing leaves the phone),
 * and once the log is WEEK_BIAS_MIN_DAYS old, the Surf page's "How we got
 * this" says, per day ahead, how many bins the call ran from the day's own.
 *
 *   a call     the band's low end, whole feet (src/core/surfCall.ts surfBand:
 *              one bin is one foot under 4 ft), for a date, made on a date
 *   the truth  the same date's call made ON that date: the hour's call,
 *              leaned to the live buoy (the nearest thing to a look this
 *              phone has); never another app's forecast
 *   the error  call minus truth, in bins; the mean per day ahead, 1 to 6
 *
 * Arithmetic only. One entry per (made, for) pair: a later call the same day
 * replaces an earlier one. Kept WEEK_LOG_KEEP_DAYS.
 */
export interface WeekCall {
  /** The local date the call was made, "2026-11-16". */
  made: string
  /** The local date it is for. */
  date: string
  /** The band's low end, whole feet. */
  lowFt: number
}

/* Two weeks: every day ahead (1-6) has had at least eight days to be checked. */
export const WEEK_BIAS_MIN_DAYS = 14
/* Long enough for a month's mean, short enough to follow the season. */
export const WEEK_LOG_KEEP_DAYS = 45

const DAY_MS = 86_400_000
const dayNo = (iso: string): number => Math.floor(Date.parse(`${iso}T12:00:00Z`) / DAY_MS)

/** The log with these calls added (replacing the same made/for pair), older than the keep dropped, oldest first. */
export function logWeek(log: readonly WeekCall[], made: string, calls: readonly { date: string; lowFt: number | null }[]): WeekCall[] {
  const fresh = calls.filter((c): c is { date: string; lowFt: number } => c.lowFt !== null && Number.isFinite(c.lowFt) && dayNo(c.date) >= dayNo(made)).map((c) => ({ made, date: c.date, lowFt: c.lowFt }))
  const key = (c: WeekCall) => `${c.made}|${c.date}`
  const replaced = new Set(fresh.map(key))
  const today = dayNo(made)
  return [...log.filter((c) => !replaced.has(key(c))), ...fresh]
    .filter((c) => today - dayNo(c.made) <= WEEK_LOG_KEEP_DAYS)
    .sort((a, b) => dayNo(a.made) - dayNo(b.made) || dayNo(a.date) - dayNo(b.date))
}

export interface DayAheadBias {
  /** Days ahead the call was made, 1-6. */
  ahead: number
  /** Mean of (call minus the day's own call), bins; + ran high. */
  meanBins: number
  /** How many calls it rests on. */
  n: number
}

/** The mean bin error per day ahead; null until the log is WEEK_BIAS_MIN_DAYS old. Only days before `today` count, each against its own same-day call. */
export function weekBias(log: readonly WeekCall[], today: string): DayAheadBias[] | null {
  if (log.length === 0) return null
  const first = Math.min(...log.map((c) => dayNo(c.made)))
  if (dayNo(today) - first < WEEK_BIAS_MIN_DAYS) return null
  const truth = new Map(log.filter((c) => c.made === c.date && dayNo(c.date) < dayNo(today)).map((c) => [c.date, c.lowFt]))
  const out: DayAheadBias[] = []
  for (let ahead = 1; ahead <= 6; ahead += 1) {
    const errs = log.filter((c) => dayNo(c.date) - dayNo(c.made) === ahead && truth.has(c.date)).map((c) => c.lowFt - (truth.get(c.date) as number))
    if (errs.length > 0) out.push({ ahead, meanBins: errs.reduce((a, b) => a + b, 0) / errs.length, n: errs.length })
  }
  return out
}

/** "1 day ahead: +0.8 bins (9 days) · 2 days ahead: …": facts only. */
export function weekBiasLine(rows: readonly DayAheadBias[]): string {
  if (rows.length === 0) return 'no day has both its early call and its own yet'
  return rows.map((r) => `${r.ahead} ${r.ahead === 1 ? 'day' : 'days'} ahead ${r.meanBins >= 0 ? '+' : '−'}${Math.abs(r.meanBins).toFixed(1)} ${Math.abs(r.meanBins) === 1 ? 'bin' : 'bins'} (${r.n} ${r.n === 1 ? 'day' : 'days'})`).join(' · ')
}

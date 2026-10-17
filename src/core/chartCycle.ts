/*
 * WHETHER THE BAKED EXTRACT IS STILL THE CURRENT CHART CYCLE.
 *
 * The FAA republishes UAS Facility Maps on a 56-day cycle. A baked extract is
 * therefore correct for a known span and then it is not, and the failure mode
 * of baked data is that it keeps answering confidently after it has gone
 * stale. So the extract carries the effective date it was cut from and this
 * turns that date into a state the app can say out loud.
 *
 * This is the same argument as the build stamp. A number with no statement
 * about its own freshness invites the reader to assume it is fresh.
 */

/** The published cycle length. */
export const CHART_CYCLE_DAYS = 56

export type CycleState =
  /** Inside the 56 days that began at the effective date. */
  | { state: 'current'; effective: Date; nextCycle: Date; daysLeft: number }
  /** Past it. The data still loads and still answers; it is just not current. */
  | { state: 'superseded'; effective: Date; nextCycle: Date; daysOver: number }
  /** The stamp could not be read at all. */
  | { state: 'unknown' }

const DAY_MS = 86_400_000

/**
 * The FAA writes MAP_EFF as M/D/YYYY.
 *
 * PARSED EXPLICITLY RATHER THAN HANDED TO new Date(). `new Date('10/1/2026')`
 * happens to work in V8 and is implementation-defined for this format, and it
 * resolves in LOCAL time, which would move the boundary by a day either side
 * of UTC depending on where the phone is. Both parts matter for a date whose
 * whole job is to be compared against today.
 */
export function parseEffective(stamp: string | null): Date | null {
  if (stamp === null) return null
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(stamp.trim())
  if (match === null) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const at = new Date(Date.UTC(year, month - 1, day))
  /* Rejects 2/31: the roll-over would otherwise pass silently as 3/3. */
  if (at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return null
  return at
}

export function cycleState(stamp: string | null, now: Date): CycleState {
  const effective = parseEffective(stamp)
  if (effective === null || Number.isNaN(now.getTime())) return { state: 'unknown' }

  const nextCycle = new Date(effective.getTime() + CHART_CYCLE_DAYS * DAY_MS)
  const remaining = nextCycle.getTime() - now.getTime()

  if (remaining > 0) {
    return {
      state: 'current',
      effective,
      nextCycle,
      daysLeft: Math.ceil(remaining / DAY_MS),
    }
  }
  return {
    state: 'superseded',
    effective,
    nextCycle,
    daysOver: Math.floor(-remaining / DAY_MS),
  }
}

/**
 * One line about the extract's age.
 *
 * The superseded wording says what to do about it, because a staleness notice
 * that does not is just an apology.
 */
export function cycleNote(state: CycleState): string {
  switch (state.state) {
    case 'current':
      return `Chart cycle effective ${iso(state.effective)}, current for ${state.daysLeft} more days.`
    case 'superseded':
      return (
        `Chart cycle effective ${iso(state.effective)} was superseded ${state.daysOver} days ago. ` +
        `Re-bake with: node scripts/bake-faa.mjs`
      )
    case 'unknown':
      return 'This extract carries no readable chart date.'
  }
}

const iso = (at: Date) => at.toISOString().slice(0, 10)

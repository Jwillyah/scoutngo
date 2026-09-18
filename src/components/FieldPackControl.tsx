import type { FieldPack } from '../lib/fieldPack.ts'

export type PackBuildState =
  | { status: 'idle' }
  | { status: 'working'; done: number; total: number }
  | { status: 'error'; reason: string }

interface FieldPackControlProps {
  pack: FieldPack | null
  /** True when the stored pack was built for the plan currently on screen. */
  matches: boolean
  positions: number
  state: PackBuildState
  timeZone: string | null
  onPrepare: () => void
}

const when = (iso: string, timeZone: string | null): string => {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'an unknown time'
  return at.toLocaleString([], {
    ...(timeZone === null ? {} : { timeZone }),
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Prepare the field pack, and say plainly what pressing it does.
 *
 * NEVER AUTOMATIC. Building a pack sends every position's coordinates to Google
 * for its ground view, which is a real disclosure, so it happens on a press and
 * the press is labelled with what it will do. The rest of the app is opt in and
 * this is too.
 *
 * A PACK FROM A DIFFERENT PLAN IS WORSE THAN NO PACK, so the state is always
 * one of three and never ambiguous: none, stale, or good, with the time it was
 * made.
 */
export function FieldPackControl({
  pack,
  matches,
  positions,
  state,
  timeZone,
  onPrepare,
}: FieldPackControlProps) {
  if (positions === 0) return null

  const status =
    pack === null
      ? { key: 'none', line: 'No field pack. Field mode will need a signal.' }
      : matches
        ? {
            key: 'ready',
            line: `Pack ready · ${pack.positions.length} positions · made ${when(pack.madeAt, timeZone)}`,
          }
        : {
            key: 'stale',
            line: `Pack is for a different plan, made ${when(pack.madeAt, timeZone)}. Prepare again.`,
          }

  const cached = pack?.positions.filter((p) => p.groundView.status === 'ok').length ?? 0

  return (
    <div className={`pack pack--${status.key}`}>
      <p className="pack__status">{status.line}</p>

      {pack === null || !matches ? null : (
        <p className="pack__detail num">
          {cached} of {pack.positions.length} ground views cached
        </p>
      )}

      {state.status === 'error' ? <p className="pack__error">{state.reason}</p> : null}

      <button
        type="button"
        className="btn btn--small"
        onClick={onPrepare}
        disabled={state.status === 'working'}
      >
        {state.status === 'working'
          ? `Preparing ${state.done} of ${state.total}…`
          : matches
            ? 'Prepare again'
            : 'Prepare field pack'}
      </button>

      {/* The press is labelled with exactly what it will do. */}
      <p className="pack__what">
        Fetches each position's ground view from Google and caches it, with every
        computed value and the tide, so Field mode works with no signal. Nothing
        leaves this device until you press it.
      </p>
    </div>
  )
}

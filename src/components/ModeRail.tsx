import { blockedReason, MODES, modeIndex, type Mode, type ModeAvailability } from '../lib/mode.ts'

interface ModeRailProps {
  mode: Mode
  available: ModeAvailability
  onMode: (next: Mode) => void
}

/**
 * Where you are along SETUP, PLAN, FIELD.
 *
 * NOT a tab bar. The steps are connected, they read left to right, and a step
 * you have not earned is visibly unavailable rather than merely inert. Going
 * back is a small tap on a step you have already done; going forward is the
 * large primary button each mode carries in its own footer, so forward feels
 * like finishing something.
 */
export function ModeRail({ mode, available, onMode }: ModeRailProps) {
  const current = modeIndex(mode)

  return (
    <nav className="rail" aria-label="Stage">
      <ol className="rail__list">
        {MODES.map((item, index) => {
          const blocked = blockedReason(item.id, available)
          const state =
            index === current ? 'now' : index < current ? 'done' : blocked === null ? 'next' : 'locked'
          return (
            <li className={`rail__step rail__step--${state}`} key={item.id}>
              <button
                type="button"
                className="rail__btn"
                aria-current={index === current ? 'step' : undefined}
                disabled={blocked !== null && index !== current}
                title={blocked ?? undefined}
                onClick={() => onMode(item.id)}
              >
                <span className="rail__index num">{index + 1}</span>
                <span className="rail__label">{item.label}</span>
                <span className="rail__when">{item.when}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

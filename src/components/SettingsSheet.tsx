import { CLOCK_OPTIONS, DISTANCE_UNITS, WIND_UNITS, type Units } from '../lib/units.ts'
import { SURF_OPTIONS, useSurfSetting } from '../lib/surfSetting.ts'

/*
 * SETTINGS: HOW THE APP READS TO YOU. The clock, the wind and the distance,
 * stored on this phone with the rest of the settings and carried in the
 * backup file. Every readout asks src/lib/units.ts, and every time goes
 * through formatClock in src/core/timezone.ts, so a choice here reaches the
 * chips, the cards, the time bar, the call sheet and the calendar files.
 *
 * Moved from About, where it sat between the story and the backup.
 */
interface SettingsSheetProps {
  units: Units
  onUnits: (next: Units) => void
}

function Choice<T extends string | number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
}) {
  return (
    <div className="about__unit">
      <p className="about__unit-label">{label}</p>
      <div className="seg" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`seg__btn${value === option.id ? ' seg__btn--on' : ''}`}
            aria-pressed={value === option.id}
            onClick={() => onPick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsSheet({ units, onUnits }: SettingsSheetProps) {
  const [surf, setSurf] = useSurfSetting()
  return (
    <div className="about settings">
      <div className="about__units">
        <Choice label="Clock" options={CLOCK_OPTIONS} value={units.clock} onPick={(clock) => onUnits({ ...units, clock })} />
        <Choice label="Wind" options={WIND_UNITS} value={units.wind} onPick={(wind) => onUnits({ ...units, wind })} />
        <Choice label="Distance" options={DISTANCE_UNITS} value={units.distance} onPick={(distance) => onUnits({ ...units, distance })} />
        {/* The surf row on the Tide sheet: Auto shows it within 2 km of the ocean, and never inland. */}
        <Choice label="Surf" options={SURF_OPTIONS} value={surf} onPick={setSurf} />
      </div>
      <p className="about__row-note">Kept on this phone, and in your backup file.</p>
    </div>
  )
}

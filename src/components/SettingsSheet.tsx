import { CLOCK_OPTIONS, DISTANCE_UNITS, WIND_UNITS, type Units } from '../lib/units.ts'
import { SURF_OPTIONS, useSurfSetting } from '../lib/surfSetting.ts'
import type { BuildCheck } from '../lib/build.ts'
import { NUMERALS_LABEL, NUMERALS_NOTE } from '../core/numerals.ts'
import { BuildStamp } from './BuildStamp.tsx'
import { useTouchDebug } from '../lib/touchDebug.ts'

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
  /*
   * From the old Setup sheet's Settings drawer, which went with the three
   * steps (27 Oct): the one detail switch, the way to /how, and which build
   * this is.
   */
  showNumbers: boolean
  onShowNumbers: (on: boolean) => void
  onHow: () => void
  newBuild: BuildCheck
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

export function SettingsSheet({ units, onUnits, showNumbers, onShowNumbers, onHow, newBuild }: SettingsSheetProps) {
  const [surf, setSurf] = useSurfSetting()
  const [debugTouch, setDebugTouch] = useTouchDebug()
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
      <label className="toggle">
        <input type="checkbox" className="toggle__box" checked={showNumbers} onChange={(event) => onShowNumbers(event.target.checked)} />
        <span className="toggle__text">
          <span className="toggle__label">{NUMERALS_LABEL}</span>
          <span className="toggle__note">{NUMERALS_NOTE}</span>
        </span>
      </label>
      <button type="button" className="settings__row" onClick={onHow}>
        How it computes
        <span className="settings__hint">The three stages, what is arithmetic, what leaves the device, and what this is not.</span>
      </button>
      {/*
        * DEBUG TOUCH (src/lib/touchDebug.ts): reachable from the home-screen
        * app, which has no address bar to type ?debug=touch into.
        */}
      <label className="toggle">
        <input type="checkbox" className="toggle__box" checked={debugTouch} onChange={(event) => setDebugTouch(event.target.checked)} />
        <span className="toggle__text">
          <span className="toggle__label">Debug touch</span>
          <span className="toggle__note">A box over the map logging fingers, pinch scale, zoom and every camera move. Copy log puts it on your clipboard; nothing is sent.</span>
        </span>
      </label>
      {/* Which build is this: a stale bundle looks exactly like a fix that did not work. */}
      <BuildStamp deployed={newBuild} />
    </div>
  )
}

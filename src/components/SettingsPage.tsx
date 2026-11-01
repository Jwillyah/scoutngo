import { useEffect, useState, type ReactNode } from 'react'
import { NUMERALS_LABEL, NUMERALS_NOTE } from '../core/numerals.ts'
import type { Drone } from '../core/kit.ts'
import { buildLabelWithDate, type BuildCheck } from '../lib/build.ts'
import { readHome, writeHome, type Home } from '../lib/home.ts'
import { locateOnce, locateWords, useLocateAttempts } from '../lib/locateOnce.ts'
import { formatClock } from '../core/timezone.ts'
import { GROUP_OPTIONS, usePlaceGroups, type Place } from '../lib/placeGroups.ts'
import { openPrivacy } from '../lib/privacyRoute.ts'
import { seenHosts } from '../lib/privacy.ts'
import { SURF_OPTIONS, useSurfSetting } from '../lib/surfSetting.ts'
import { useTouchDebug } from '../lib/touchDebug.ts'
import { CLOCK_OPTIONS, DISTANCE_UNITS, formatWind, TEMPERATURE_UNITS, WIND_UNITS, type Units } from '../lib/units.ts'
import { deletePack, loadPacks, onPacksChanged, packBytes, type VenuePack } from '../lib/venuePack.ts'
import { useNearMeSetting } from '../lib/nearMe.ts'
import { weatherSent } from '../lib/weatherStore.ts'
import { ApiKeyField } from './ApiKeyField.tsx'
import { BuildStamp } from './BuildStamp.tsx'
import { Page } from './Page.tsx'
import { KeptSection } from './KeptSection.tsx'

/*
 * SETTINGS, A PAGE OF ITS OWN (field test, 30 Oct). Ten short sections in the
 * order asked for, each a list of plain labels with the current value on the
 * right: Units, Location, Offline, Coast & inland, Alerts, Drone, Map,
 * Privacy & data, About, and Debug at the bottom, folded. Everything is kept
 * on this phone; nothing here is sent anywhere.
 */
interface Props {
  units: Units
  onUnits: (next: Units) => void
  showNumbers: boolean
  onShowNumbers: (on: boolean) => void
  /** The venue as it stands, for "Make this home" and the last venue's row. */
  venue: { lat: number; lon: number; name: string } | null
  place: Place
  drone: Drone | null
  showTerrain: boolean
  onShowTerrain: (on: boolean) => void
  showLabels: boolean
  onShowLabels: (on: boolean) => void
  newBuild: BuildCheck
  onHow: () => void
  onAbout: () => void
  onKit: () => void
  onExport: () => void
  onClose: () => void
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set__sec" aria-label={title}>
      <p className="set__title">{title}</p>
      <div className="set__list">{children}</div>
    </section>
  )
}

/* A label on the left and its value on the right: a button when tapping it does something. */
function Row({ label, value, onClick }: { label: string; value: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="set__label">{label}</span>
      <span className="set__value num">
        {value}
        {onClick === undefined ? null : <span aria-hidden="true"> ›</span>}
      </span>
    </>
  )
  return onClick === undefined ? <div className="set__row">{inner}</div> : <button type="button" className="set__row" onClick={onClick}>{inner}</button>
}

function Pick<T extends string | number>({ label, options, value, onPick }: { label: string; options: readonly { id: T; label: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="set__row set__row--pick">
      <span className="set__label">{label}</span>
      <div className="seg set__seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button type="button" key={o.id} className={`seg__btn${o.id === value ? ' seg__btn--on' : ''}`} aria-pressed={o.id === value} onClick={() => onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Switch({ label, on, onChange, note }: { label: string; on: boolean; onChange: (on: boolean) => void; note?: string }) {
  return (
    <label className="set__row set__row--switch">
      <span className="set__label">
        {label}
        {note === undefined ? null : <span className="set__note">{note}</span>}
      </span>
      <input type="checkbox" className="toggle__box" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`
const PART_107_FT = 400

export function SettingsPage(props: Props) {
  const { units, onUnits, venue, place, drone } = props
  const [groups, setGroups] = usePlaceGroups()
  const [surf, setSurf] = useSurfSetting()
  const [nearMe, setNearMe] = useNearMeSetting()
  const [debugTouch, setDebugTouch] = useTouchDebug()
  const attempts = useLocateAttempts()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [home, setHome] = useState<Home | null>(readHome)
  const [locateLine, setLocateLine] = useState<string | null>(null)
  const [packs, setPacks] = useState<VenuePack[]>(loadPacks)
  useEffect(() => onPacksChanged(() => setPacks(loadPacks())), [])
  const [deleting, setDeleting] = useState<string | null>(null)

  const locate = () => {
    setLocateLine('Finding you…')
    void locateOnce().then((r) => setLocateLine(r.status === 'ok' ? `Found, ±${Math.round(r.accuracyMeters)} m. Used for this moment only, not kept.` : locateWords(r)))
  }

  return (
    <Page title="Settings" className="setpage" onClose={props.onClose}>
      <Section title="Units">
        <Pick label="Time" options={CLOCK_OPTIONS} value={units.clock} onPick={(clock) => onUnits({ ...units, clock })} />
        <Pick label="Distance" options={DISTANCE_UNITS} value={units.distance} onPick={(distance) => onUnits({ ...units, distance })} />
        <Pick label="Wind" options={WIND_UNITS} value={units.wind} onPick={(wind) => onUnits({ ...units, wind })} />
        <Pick label="Temperature" options={TEMPERATURE_UNITS} value={units.temperature} onPick={(temperature) => onUnits({ ...units, temperature })} />
      </Section>

      <Section title="Location">
        <Row label="Use my location" value={locateLine ?? 'Ask'} onClick={locate} />
        <Row
          label="Home spot"
          value={home === null ? 'Not set' : home.name}
          onClick={
            venue === null
              ? undefined
              : () => {
                  const next = { lat: venue.lat, lon: venue.lon, name: venue.name }
                  writeHome(next)
                  setHome(next)
                }
          }
        />
        {venue === null ? null : <p className="set__note">Tap Home spot to make {venue.name} home. Kept on this phone.</p>}
        <Row label="Last venue" value={venue?.name ?? 'None yet'} />
      </Section>

      <Section title="Offline">
        {packs.length === 0 ? <Row label="Saved venue packs" value="None" /> : null}
        {packs.map((p) => (
          <div key={p.id} className="set__row">
            <span className="set__label">{p.name}</span>
            <span className="set__value num">
              {mb(packBytes(p))}{' '}
              {deleting === p.id ? (
                <button type="button" className="btn btn--small" onClick={() => void deletePack(p.id).then(() => setDeleting(null))}>
                  Delete it
                </button>
              ) : (
                <button type="button" className="btn btn--small btn--quiet" onClick={() => setDeleting(p.id)}>
                  Delete
                </button>
              )}
            </span>
          </div>
        ))}
        <p className="set__note">Save a venue from Plan › Save for offline. Best saved on Wi-Fi: a pack is 30 to 50 MB.</p>
      </Section>

      <Section title="Coast & inland">
        <Row label="Here" value={place === 'coast' ? 'Coast' : place === 'inland' ? 'Inland' : 'Not known yet'} />
        <Pick label="Water" options={GROUP_OPTIONS} value={groups.water} onPick={(water) => setGroups({ ...groups, water })} />
        <Pick label="Land" options={GROUP_OPTIONS} value={groups.land} onPick={(land) => setGroups({ ...groups, land })} />
        <Pick label="Surf" options={SURF_OPTIONS} value={surf} onPick={setSurf} />
        <p className="set__note">Auto: Water within 2 km of the sea or a big lake, Land anywhere else.</p>
      </Section>

      <Section title="Alerts">
        <Switch label="Special light near me" note="On opening: fog, rainbows, sky fire within 25 mi in the next 24 h, worked out on this phone." on={nearMe} onChange={setNearMe} />
        <Row label="Calendar alerts" value="From Sky › Calendar, as a calendar file" />
      </Section>

      <Section title="Drone">
        <Row label="Model" value={drone?.name ?? 'None in the kit'} onClick={props.onKit} />
        <Row label="Rated wind" value={drone === null || drone.maxWindMps === null ? '—' : formatWind(drone.maxWindMps, units.wind)} />
        <Row label="Ceiling" value={`${PART_107_FT} ft (Part 107)`} />
        <Row label="Battery" value="— (not recorded)" />
      </Section>

      <Section title="Map">
        <Row label="Imagery" value="Auto: the sharpest free source here" />
        <Switch label="Terrain" on={props.showTerrain} onChange={props.onShowTerrain} />
        <Switch label="Labels" on={props.showLabels} onChange={props.onShowLabels} />
        <Switch label={NUMERALS_LABEL} note={NUMERALS_NOTE} on={props.showNumbers} onChange={props.onShowNumbers} />
      </Section>

      <Section title="Privacy & data">
        <KeptSection />
        <Row label="What leaves your phone" value="/privacy" onClick={openPrivacy} />
        <Row label="Export everything" value="One file" onClick={props.onExport} />
        <Row label="Clear this phone" value="On the privacy page" onClick={openPrivacy} />
      </Section>

      <Section title="About">
        <Row label="Version" value={buildLabelWithDate()} />
        <Row label="How it works" value="" onClick={props.onHow} />
        <Row label="Why this exists" value="" onClick={props.onAbout} />
        <Row label="Open source" value="github.com" />
        <ApiKeyField />
        <BuildStamp deployed={props.newBuild} />
      </Section>

      <details className="set__debug">
        <summary className="set__title">Debug</summary>
        <Switch label="Touch log" note="A box over the map logging fingers, zoom and location asks. Copy puts it on your clipboard; nothing is sent." on={debugTouch} onChange={setDebugTouch} />
        <p className="set__label">Location attempts</p>
        <ul className="set__log set__locate num">
          {attempts.length === 0 ? <li>None this session</li> : null}
          {attempts.map((a, i) => (
            <li key={i}>
              {formatClock(new Date(a.at), zone)} {a.words}
            </li>
          ))}
        </ul>
        <p className="set__label">Network log</p>
        <ul className="set__log num">
          {weatherSent().slice(-12).map((s, i) => (
            <li key={i}>
              {formatClock(new Date(s.at), zone)} {s.host} {s.status}
            </li>
          ))}
          <li>Hosts this session: {seenHosts().join(', ') || 'none yet'}</li>
        </ul>
      </details>
    </Page>
  )
}

import { ActivityPicker } from './ActivityPicker.tsx'
import { useActivities } from '../lib/activities.ts'
import { useCalendarFeed } from '../lib/calendarFeedSetting.ts'
import { feedPath } from '../core/calendarFeed.ts'
import { useWindDraw, writeWindDraw } from '../lib/windDraw.ts'
import { useEffect, useState, type ReactNode } from 'react'
import { NUMERALS_LABEL, NUMERALS_NOTE } from '../core/numerals.ts'
import type { Drone } from '../core/kit.ts'
import { versionLine, type BuildCheck } from '../lib/build.ts'
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
import { API_KEY_SAY, ApiKeyField } from './ApiKeyField.tsx'
import { BuildStamp } from './BuildStamp.tsx'
import { Page } from './Page.tsx'
import { KeptExplained, KeptSection } from './KeptSection.tsx'
import type { ReadFile } from '../lib/scoutFile.ts'

/*
 * SETTINGS, A PAGE OF ITS OWN (field test, 30 Oct), CLEAN AND iOS-STYLE
 * (Batch G, Section 7): grouped rows, labels in normal case, real switches,
 * values in the normal font, buttons in normal case; a one-line hint only
 * where it is needed and anything longer behind an "i". Eleven sections:
 * Units, Location, Offline, Coast & inland, Alerts, Drone, Map, Privacy &
 * data (backup and restore here only), AI key (here only), About (one row,
 * to /about, with the version), and Debug at the bottom, folded. Everything
 * is kept on this phone; nothing here is sent anywhere.
 */
interface Props {
  /** Batch H: the venue for the opt-in calendar feed's address (rounded there to 2 decimals). */
  feedPlace?: { lat: number; lon: number } | null
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
  /** Settings › About › Show the home page (Batch F): the cover again, as on a first run. */
  onShowHome: () => void
  onKit: () => void
  onExport: () => void
  /** An older "Export everything" file (kit, units, spots), read back by Restore (src/lib/scoutFile.ts). */
  onImport?: (file: ReadFile) => string
  onClose: () => void
}

/* The calendar feed's address: webcal, so the phone offers to subscribe (src/core/calendarFeed.ts). */
function feedAddress(place: { lat: number; lon: number } | null | undefined): string | null {
  if (place == null || typeof window === 'undefined') return null
  return `webcal://${window.location.host}${feedPath(place.lat, place.lon)}`
}

function Section({ title, info, children }: { title: string; info?: ReactNode; children: ReactNode }) {
  return (
    <section className="set__sec" aria-label={title}>
      <div className="set__head">
        <p className="set__title">{title}</p>
        {info === undefined ? null : <Info>{info}</Info>}
      </div>
      <div className="set__list">{children}</div>
    </section>
  )
}

/* The longer explanation, behind an "i". */
function Info({ children }: { children: ReactNode }) {
  return (
    <details className="set__info">
      <summary aria-label="More about this">i</summary>
      <div className="set__infotext">{children}</div>
    </details>
  )
}

function Row({ label, value, onClick }: { label: string; value: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="set__label">{label}</span>
      <span className="set__value">
        {value}
        {onClick === undefined ? null : <span className="set__chev" aria-hidden="true">›</span>}
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

/* A real switch: a checkbox drawn as a track and a knob, said as a switch. */
function Switch({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (on: boolean) => void; hint?: string }) {
  return (
    <label className="set__row set__row--switch">
      <span className="set__label">
        {label}
        {hint === undefined ? null : <span className="set__hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="set__switch" aria-checked={on} checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`
const PART_107_FT = 400

const WIND_DRAW_OPTIONS = [
  { id: 'streaks', label: 'Streaks' },
  { id: 'arrows', label: 'Arrows' },
] as const

function WhatIDo() {
  const [picked, setPicked] = useActivities()
  return <ActivityPicker variant="inline" value={picked} onDone={setPicked} />
}

export function SettingsPage(props: Props) {
  /* Streaks move; Arrows draw once, for a slow phone (Batch F, Section 3). */
  const windDraw = useWindDraw()
  const { units, onUnits, venue, place, drone } = props
  const [groups, setGroups] = usePlaceGroups()
  const [surf, setSurf] = useSurfSetting()
  const [nearMe, setNearMe] = useNearMeSetting()
  const [feed, setFeed] = useCalendarFeed()
  const feedHref = feedAddress(props.feedPlace)
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
    <Page title="Settings" className="setpage" back onClose={props.onClose}>
      {/* Batch M, Section 2: what you do outside, the picker's own choices; kept on this phone. */}
      <Section title="What I do">
        <WhatIDo />
      </Section>
      <Section title="Units">
        <Pick label="Time" options={CLOCK_OPTIONS} value={units.clock} onPick={(clock) => onUnits({ ...units, clock })} />
        <Pick label="Distance" options={DISTANCE_UNITS} value={units.distance} onPick={(distance) => onUnits({ ...units, distance })} />
        <Pick label="Wind" options={WIND_UNITS} value={units.wind} onPick={(wind) => onUnits({ ...units, wind })} />
        <Pick label="Temperature" options={TEMPERATURE_UNITS} value={units.temperature} onPick={(temperature) => onUnits({ ...units, temperature })} />
      </Section>

      <Section title="Location" info={<p>Your location is asked for one moment at a time and not kept. Tap Home spot to make the venue on screen your home; it is kept on this phone only.</p>}>
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
        <Row label="Last venue" value={venue?.name ?? 'None yet'} />
      </Section>

      <Section title="Offline" info={<p>Save a venue from Plan › Save for offline. Best saved on Wi-Fi: a pack is 30 to 50 MB.</p>}>
        {packs.length === 0 ? <Row label="Saved venues" value="None" /> : null}
        {packs.map((p) => (
          <div key={p.id} className="set__row">
            <span className="set__label">{p.name}</span>
            <span className="set__value">
              {mb(packBytes(p))}{' '}
              {deleting === p.id ? (
                <button type="button" className="set__btn set__btn--strong" onClick={() => void deletePack(p.id).then(() => setDeleting(null))}>
                  Delete it
                </button>
              ) : (
                <button type="button" className="set__btn" onClick={() => setDeleting(p.id)}>
                  Delete
                </button>
              )}
            </span>
          </div>
        ))}
      </Section>

      <Section title="Coast & inland" info={<p>Auto: Water within 2 km of the sea or a big lake, Land anywhere else.</p>}>
        <Row label="Here" value={place === 'coast' ? 'Coast' : place === 'inland' ? 'Inland' : 'Not known yet'} />
        <Pick label="Water" options={GROUP_OPTIONS} value={groups.water} onPick={(water) => setGroups({ ...groups, water })} />
        <Pick label="Land" options={GROUP_OPTIONS} value={groups.land} onPick={(land) => setGroups({ ...groups, land })} />
        <Pick label="Surf" options={SURF_OPTIONS} value={surf} onPick={setSurf} />
      </Section>

      <Section title="Alerts" info={<p>Special light near me: on opening, fog, rainbows and sunrise or sunset color within 25 mi in the next 24 h, worked out on this phone. Calendar alerts are a calendar file from Sky › Calendar, added to your own calendar.</p>}>
        <Switch label="Special light near me" on={nearMe} onChange={setNearMe} />
        <Row label="Calendar alerts" value="Sky › Calendar" />
        <Switch label="Sky calls in your calendar" on={feed} onChange={setFeed} hint="Off unless you switch it on" />
        {!feed || feedHref === null ? null : (
          <>
            <a className="set__row set__link" href={feedHref}>
              <span className="set__label">Subscribe in Calendar</span>
              <span className="set__value">
                <span className="set__chev" aria-hidden="true">›</span>
              </span>
            </a>
            <p className="set__note">
              Your calendar app sends this spot, rounded to about a kilometre ({props.feedPlace?.lat.toFixed(2)}, {props.feedPlace?.lon.toFixed(2)}), to this app’s server each time it refreshes, about hourly. The server asks the forecast, and in the hour before a sunrise or sunset the weather stations by their ids, so a call that changes to Go or Skip changes in your calendar too; it logs nothing. Vercel’s own request logs keep the request line for an hour. Turn it off here and remove the calendar in your calendar app to stop it.
            </p>
          </>
        )}
      </Section>

      <Section title="Drone">
        <Row label="Model" value={drone?.name ?? 'None in the kit'} onClick={props.onKit} />
        <Row label="Rated wind" value={drone === null || drone.maxWindMps === null ? '—' : formatWind(drone.maxWindMps, units.wind)} />
        <Row label="Ceiling" value={`${PART_107_FT} ft (Part 107)`} />
        <Row label="Battery" value="— (not recorded)" />
      </Section>

      <Section title="Map" info={<p>Imagery is the sharpest free source for where you are. {NUMERALS_NOTE}</p>}>
        <Row label="Imagery" value="Auto" />
        <Switch label="Terrain" on={props.showTerrain} onChange={props.onShowTerrain} />
        <Switch label="Labels" on={props.showLabels} onChange={props.onShowLabels} />
        <Switch label={NUMERALS_LABEL} on={props.showNumbers} onChange={props.onShowNumbers} />
        <Pick label="Wind map" options={WIND_DRAW_OPTIONS} value={windDraw} onPick={writeWindDraw} />
      </Section>

      <Section title="Privacy & data" info={<KeptExplained />}>
        <KeptSection onImportScout={props.onImport} />
        <Row label="What leaves your phone" value="" onClick={openPrivacy} />
        <Row label="Export everything" value="One file" onClick={props.onExport} />
        <Row label="Clear this phone" value="" onClick={openPrivacy} />
      </Section>

      <Section title="AI key" info={<p>{API_KEY_SAY}</p>}>
        <ApiKeyField compact />
      </Section>

      <Section title="About">
        <Row label="About ScoutNGo" value={versionLine()} onClick={props.onAbout} />
      </Section>

      <details className="set__debug">
        <summary className="set__title">Debug</summary>
        <div className="set__list">
          <Switch label="Touch log" hint="A box over the map; nothing is sent." on={debugTouch} onChange={setDebugTouch} />
          <Row label="Show the home page" value="" onClick={props.onShowHome} />
          <Row label="How it works" value="" onClick={props.onHow} />
        </div>
        <BuildStamp deployed={props.newBuild} />
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

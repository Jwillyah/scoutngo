import { useCalendarFeed } from '../lib/calendarFeedSetting.ts'
import { feedPath } from '../core/calendarFeed.ts'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NUMERALS_NOTE } from '../core/numerals.ts'
import type { Drone } from '../core/kit.ts'
import { ACTIVITIES, type Activity } from '../core/homeDay.ts'
import { ACTIVITY_LINES, ACTIVITY_WORDS, useActivities } from '../lib/activities.ts'
import { versionLine, type BuildCheck } from '../lib/build.ts'
import { readHome, writeHome, type Home } from '../lib/home.ts'
import { locateOnce, locateWords, useLocateAttempts } from '../lib/locateOnce.ts'
import { formatClock } from '../core/timezone.ts'
import { GROUP_OPTIONS, usePlaceGroups, type Place } from '../lib/placeGroups.ts'
import { openPrivacy } from '../lib/privacyRoute.ts'
import { seenHosts } from '../lib/privacy.ts'
import { SURF_OPTIONS, useSurfSetting } from '../lib/surfSetting.ts'
import { useTouchDebug } from '../lib/touchDebug.ts'
import { formatWind, type Units } from '../lib/units.ts'
import { deletePack, loadPacks, onPacksChanged, packBytes, type VenuePack } from '../lib/venuePack.ts'
import { useNearMeSetting } from '../lib/nearMe.ts'
import { weatherSent } from '../lib/weatherStore.ts'
import { API_KEY_SAY, ApiKeyField } from './ApiKeyField.tsx'
import { ActivityIcon } from './ActivityIcon.tsx'
import { BuildStamp } from './BuildStamp.tsx'
import { Page } from './Page.tsx'
import { KeptExplained, KeptSection } from './KeptSection.tsx'
import { Segmented, Toggle } from './ui.tsx'
import type { ReadFile } from '../lib/scoutFile.ts'
import '../styles/settings.css'

/*
 * SETTINGS v2 (Batch Map, Section 6; board docs/mockups/SettingsV2.png), in
 * the one style (src/components/ui.tsx): glass groups on the sky, coloured
 * icon tiles, real toggles, segmented units. In this order:
 *
 *   What I do        the five activities, each a tile and a toggle
 *   My spot          Home spot, Use my location
 *   Units            Wind kt / mph / km/h, Height ft / m, Temp, Time
 *   My gear          Camera + lenses, the drone with its rated wind
 *   Alerts           Sky calls in my calendar, Special light near me
 *   My data · on this phone only
 *                    Back up to a file, What leaves my phone, More ›
 *   the version      a long press shows Debug
 *
 * More › holds what left the main list: restore, export, clear, storage and
 * what is kept when space runs short, the AI key, wind in m/s, the coast and
 * inland overrides (Auto stays the behaviour), the numbers on the map and
 * the saved venues. The map's own rows (imagery, terrain, labels, the wind
 * drawing) are in the map's sheet. Everything is kept on this phone.
 */
interface Props {
  /** Batch H: the venue for the opt-in calendar feed's address (rounded there to 2 decimals). */
  feedPlace?: { lat: number; lon: number } | null
  units: Units
  onUnits: (next: Units) => void
  showNumbers: boolean
  onShowNumbers: (on: boolean) => void
  /** The venue as it stands, for "Make this home". */
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set2__sec" aria-label={title}>
      <p className="set2__title">{title}</p>
      <div className="set2__card">{children}</div>
    </section>
  )
}

function Row({ label, sub, value, onClick, lead, end }: { label: string; sub?: string; value?: ReactNode; onClick?: () => void; lead?: ReactNode; end?: ReactNode }) {
  const inner = (
    <>
      {lead}
      <span className="set2__text">
        <span className="set2__label">{label}</span>
        {sub === undefined ? null : <span className="set2__sub">{sub}</span>}
      </span>
      {value === undefined ? null : <span className="set2__value">{value}</span>}
      {onClick === undefined ? null : <span className="set2__chev" aria-hidden="true">›</span>}
      {end}
    </>
  )
  return onClick === undefined ? <div className="set2__row">{inner}</div> : <button type="button" className="set2__row set2__row--tap" onClick={onClick}>{inner}</button>
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

/** The board's units: wind without m/s (that is under More). */
const MAIN_WIND = [
  { id: 'kt', label: 'kt' },
  { id: 'mph', label: 'mph' },
  { id: 'kmh', label: 'km/h' },
] as const
const HEIGHT = [
  { id: 'ft', label: 'ft' },
  { id: 'm', label: 'm' },
] as const
const TEMP = [
  { id: 'F', label: '°F' },
  { id: 'C', label: '°C' },
] as const
const CLOCK = [
  { id: '12', label: '12 h' },
  { id: '24', label: '24 h' },
] as const

function WhatIDo() {
  const [picked, setPicked] = useActivities()
  const on = (a: Activity) => picked === null || picked.includes(a)
  const toggle = (a: Activity, next: boolean) => {
    const now = picked ?? [...ACTIVITIES]
    const list = next ? [...now.filter((x) => x !== a), a] : now.filter((x) => x !== a)
    /* At least one stays: nothing picked is everything shown, which a last toggle off would not say. */
    if (list.length > 0) setPicked(list)
  }
  return (
    <>
      {ACTIVITIES.map((a) => (
        <Row
          key={a}
          label={ACTIVITY_WORDS[a]}
          sub={ACTIVITY_LINES[a]}
          lead={
            <span className={`set2__tile set2__tile--${a}`}>
              <ActivityIcon activity={a} className="set2__icon" />
            </span>
          }
          end={<Toggle on={on(a)} label={ACTIVITY_WORDS[a]} onChange={(n) => toggle(a, n)} />}
        />
      ))}
    </>
  )
}

export function SettingsPage(props: Props) {
  const { units, onUnits, venue, drone } = props
  const [more, setMore] = useState(false)
  const [debug, setDebug] = useState(false)
  const [nearMe, setNearMe] = useNearMeSetting()
  const [feed, setFeed] = useCalendarFeed()
  const feedHref = feedAddress(props.feedPlace)
  const [home, setHome] = useState<Home | null>(readHome)
  const [locateLine, setLocateLine] = useState<string | null>(null)
  const locate = () => {
    setLocateLine('Finding you…')
    void locateOnce().then((r) => setLocateLine(r.status === 'ok' ? `Found, ±${Math.round(r.accuracyMeters)} m, not kept` : locateWords(r)))
  }
  /* The version line: a long press (600 ms) shows Debug. */
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)
  const down = () => {
    press.current = setTimeout(() => setDebug((d) => !d), 600)
  }
  const up = () => {
    if (press.current !== null) clearTimeout(press.current)
    press.current = null
  }

  if (more) return <MorePage {...props} onBack={() => setMore(false)} />

  return (
    <Page title="Settings" className="setpage set2" back onClose={props.onClose}>
      <Group title="What I do">
        <WhatIDo />
      </Group>

      <Group title="My spot">
        <Row
          label="Home spot"
          value={home === null ? (venue === null ? 'Not set' : `Make ${venue.name} home`) : home.name}
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
        <Row label="Use my location" value={locateLine ?? 'Ask each time'} onClick={locate} />
      </Group>

      <Group title="Units">
        <Row label="Wind" end={<Segmented label="Wind" value={units.wind === 'ms' ? 'kt' : units.wind} options={MAIN_WIND} onChange={(wind) => onUnits({ ...units, wind })} />} />
        <Row label="Height" end={<Segmented label="Height" value={units.distance} options={HEIGHT} onChange={(distance) => onUnits({ ...units, distance })} />} />
        <Row label="Temp" end={<Segmented label="Temp" value={units.temperature} options={TEMP} onChange={(temperature) => onUnits({ ...units, temperature })} />} />
        <Row label="Time" end={<Segmented label="Time" value={units.clock === 24 ? '24' : '12'} options={CLOCK} onChange={(c) => onUnits({ ...units, clock: c === '24' ? 24 : 12 })} />} />
        {units.wind === 'ms' ? <p className="set2__note">Wind is in m/s (More ›).</p> : null}
      </Group>

      <Group title="My gear">
        <Row label="Camera + lenses" value="Kit" onClick={props.onKit} />
        <Row label="Drone" value={drone === null ? 'None' : `${drone.name}${drone.maxWindMps === null ? '' : ` · rated ${formatWind(drone.maxWindMps, units.wind)}`}`} onClick={props.onKit} />
      </Group>

      <Group title="Alerts">
        <Row label="Sky calls in my calendar" sub="Off unless you switch it on" end={<Toggle on={feed} label="Sky calls in my calendar" onChange={setFeed} />} />
        {!feed || feedHref === null ? null : (
          <>
            <a className="set2__row set2__row--tap" href={feedHref}>
              <span className="set2__text">
                <span className="set2__label">Subscribe in Calendar</span>
              </span>
              <span className="set2__chev" aria-hidden="true">›</span>
            </a>
            <p className="set2__note">
              Your calendar app sends this spot, rounded to about a kilometre ({props.feedPlace?.lat.toFixed(2)}, {props.feedPlace?.lon.toFixed(2)}), to this app’s server each time it refreshes, about hourly. The server asks the forecast, and in the hour before a sunrise or sunset the weather stations by their ids, so a call that changes to Go or Skip changes in your calendar too; it logs nothing. Vercel’s own request logs keep the request line for an hour. Turn it off here and remove the calendar in your calendar app to stop it.
            </p>
          </>
        )}
        <Row label="Special light near me" sub="fog, rainbows, color within 25 mi" end={<Toggle on={nearMe} label="Special light near me" onChange={setNearMe} />} />
      </Group>

      <Group title="My data · on this phone only">
        <Row label="Back up to a file" value="One file" onClick={props.onExport} />
        <Row label="What leaves my phone" onClick={openPrivacy} />
        <Row label="More" sub="restore, export, clear, storage, AI key" onClick={() => setMore(true)} />
        {/* Batch QA, Section 1: About was a tap on the version line only; it is a row. */}
        <Row label="About" value={versionLine()} onClick={props.onAbout} />
      </Group>

      <button type="button" className="set2__version" onPointerDown={down} onPointerUp={up} onPointerLeave={up} onContextMenu={(e) => e.preventDefault()} onClick={props.onAbout}>
        {versionLine()}
      </button>
      {debug ? <Debug {...props} /> : null}
    </Page>
  )
}

/* ------------------------------------------------------------- More › */

function MorePage(props: Props & { onBack: () => void }) {
  const { units, onUnits, place } = props
  const [groups, setGroups] = usePlaceGroups()
  const [surf, setSurf] = useSurfSetting()
  const [packs, setPacks] = useState<VenuePack[]>(loadPacks)
  useEffect(() => onPacksChanged(() => setPacks(loadPacks())), [])
  const [deleting, setDeleting] = useState<string | null>(null)
  return (
    <Page title="More" className="setpage set2" back onClose={props.onBack}>
      <Group title="Back up and restore">
        <KeptSection onImportScout={props.onImport} />
        <Row label="Export everything" value="One file" onClick={props.onExport} />
        <Row label="Clear this phone" onClick={openPrivacy} />
      </Group>
      <Group title="Storage">
        <div className="set2__note">
          <KeptExplained />
        </div>
        {packs.length === 0 ? <Row label="Saved venues" value="None" /> : null}
        {packs.map((p) => (
          <Row
            key={p.id}
            label={p.name}
            value={mb(packBytes(p))}
            end={
              deleting === p.id ? (
                <button type="button" className="ui-round ui-round--words set2__del" onClick={() => void deletePack(p.id).then(() => setDeleting(null))}>
                  Delete it
                </button>
              ) : (
                <button type="button" className="ui-round ui-round--words set2__del" onClick={() => setDeleting(p.id)}>
                  Delete
                </button>
              )
            }
          />
        ))}
      </Group>
      <Group title="AI key and model">
        <p className="set2__note">{API_KEY_SAY}</p>
        <ApiKeyField compact />
      </Group>
      <Group title="Units, more">
        <Row label="Wind in m/s" end={<Toggle on={units.wind === 'ms'} label="Wind in m/s" onChange={(on) => onUnits({ ...units, wind: on ? 'ms' : 'kt' })} />} />
      </Group>
      <Group title="Coast and inland">
        <Row label="Here" value={place === 'coast' ? 'Coast' : place === 'inland' ? 'Inland' : 'Not known yet'} />
        <Row label="Water cards" end={<Segmented label="Water cards" value={groups.water} options={GROUP_OPTIONS} onChange={(water) => setGroups({ ...groups, water })} />} />
        <Row label="Land cards" end={<Segmented label="Land cards" value={groups.land} options={GROUP_OPTIONS} onChange={(land) => setGroups({ ...groups, land })} />} />
        <Row label="Surf" end={<Segmented label="Surf" value={surf} options={SURF_OPTIONS} onChange={setSurf} />} />
        <p className="set2__note">Auto: Water within 2 km of the sea or a big lake, Land anywhere else.</p>
      </Group>
      <Group title="On the map">
        <Row label="Numbers on the map" sub={NUMERALS_NOTE} end={<Toggle on={props.showNumbers} label="Numbers on the map" onChange={props.onShowNumbers} />} />
      </Group>
    </Page>
  )
}

/* ------------------------------------------------------------- Debug */

function Debug(props: Props) {
  const [debugTouch, setDebugTouch] = useTouchDebug()
  const attempts = useLocateAttempts()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <section className="set2__sec set__debug" aria-label="Debug">
      <p className="set2__title">Debug</p>
      <div className="set2__card">
        <Row label="Touch log" sub="A box over the map; nothing is sent." end={<Toggle on={debugTouch} label="Touch log" onChange={setDebugTouch} />} />
        <Row label="Show the home page" onClick={props.onShowHome} />
        <Row label="How it works" onClick={props.onHow} />
      </div>
      <BuildStamp deployed={props.newBuild} />
      <p className="set2__note">Location attempts</p>
      <ul className="set2__log">
        {attempts.length === 0 ? <li>None this session</li> : null}
        {attempts.map((a, i) => (
          <li key={i}>
            {formatClock(new Date(a.at), zone)} {a.words}
          </li>
        ))}
      </ul>
      <p className="set2__note">Network log</p>
      <ul className="set2__log">
        {weatherSent()
          .slice(-12)
          .map((s, i) => (
            <li key={i}>
              {formatClock(new Date(s.at), zone)} {s.host} {s.status}
            </li>
          ))}
        <li>Hosts this session: {seenHosts().join(', ') || 'none yet'}</li>
      </ul>
    </section>
  )
}

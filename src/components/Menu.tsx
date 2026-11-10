import '../styles/menu.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getPosition } from 'suncalc'
import { droneTag, windTag } from '../core/briefing.ts'
import { colorWords, conditionOf, rainLine, sideWords, type CardKind } from '../core/homeDay.ts'
import { menuCardList, type MenuCard } from '../core/menuCards.ts'
import { formatClock } from '../core/timezone.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { compass } from '../lib/tideWords.ts'
import { useBriefing } from '../lib/useBriefing.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import { useSurfNow } from '../lib/useSurfNow.ts'
import { formatTemperature, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { gustWords, windAt, windWords } from '../lib/windNow.ts'

/*
 * THE MENU (Batch H, Section 3; it replaced the side menu entirely).
 *
 * A full-screen sheet in the night navy. Four live cards, each a rounded
 * gradient about 88 px tall: title and icon top left, a big light value top
 * right with a small line under it, a mini chart along the bottom. A tap
 * opens that group on its most useful page (src/core/menuCards.ts):
 * Today the briefing; Sky its Sky fire tab within 3 h of a sunrise or
 * sunset, else Now; Water its Surf; Drone its Preflight. Under the cards,
 * four plain rows: Plan, Kit, Saved, Settings, each with its live value.
 * Privacy and About live inside Settings.
 *
 * The card colours follow the call, from code: warm when it is good,
 * blue-grey for a maybe, slate when it is not, rust when the drone's wind is
 * past its rating. Never red.
 *
 * STILL `nav aria-label="Stage"`, and each card and row carries its words in
 * a `.sidemenu__label`: the audits navigate by those (scripts/preflight.mjs).
 *
 * Fits 390 x 844 with nothing scrolled (scripts/audit-menu.mjs).
 */
/** The menu reads the forecasts once it has been open this long (Batch H: not on a tap straight through). */
export const LOOK_AFTER_MS = 800

export type MenuTarget = 'today' | 'sky' | 'water' | 'drone' | 'viewfinder' | 'plan' | 'kit' | 'saved' | 'settings' | 'weather' | 'surf' | 'wind' | 'tides' | 'setup' | 'calendar'

export interface MenuRows {
  plan: string
  kit: string
  saved: string
  settings: string
}

interface MenuProps {
  open: boolean
  venue: { lat: number; lon: number } | null
  /** "VB Pier". */
  placeShort: string
  timeZone: string
  units: Units
  drone: { name: string; maxWindMps: number | null } | null
  /** Inland the Water card is Land: the wind and the light on the ridges. */
  inland: boolean
  rows: MenuRows
  /** Batch M, Section 2: photo tools (the Viewfinder row, Sky opening on Sky color) only when Shoot is picked or nothing is. */
  photoTools?: boolean
  /** The drone card only when Fly a drone is picked or a drone is in the kit. */
  droneTools?: boolean
  /** Batch Pages, Section 5: the home's card order (src/core/homeDay.ts cardList); the Sky, Water and Drone cards follow it, under Today. */
  order?: readonly CardKind[]
  now: Date
  onPick: (target: MenuTarget, opts?: { skyTab?: 'fire' | 'now' }) => void
  onClose: () => void
}

export function Menu(props: MenuProps) {
  const { open, onClose } = props
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return <MenuSheet {...props} first={first} />
}

function MenuSheet({ venue, placeShort, timeZone, units, drone, rows, photoTools = true, droneTools = true, order = [], now, onPick, onClose, first }: MenuProps & { first: React.RefObject<HTMLButtonElement | null> }) {
  /* Asked only once the menu has been open a moment: a tap straight through it to a place asks nothing. */
  const [looking, setLooking] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLooking(true), LOOK_AFTER_MS)
    return () => clearTimeout(t)
  }, [])
  const brief = useBriefing(venue, timeZone, now, venue !== null && looking, 'next')
  const clock = (d: Date) => formatClock(d, timeZone)
  const obs = useStationObs(looking ? venue : null)
  /* Batch Map A2: the value is the one surf number (src/lib/useSurfNow.ts), the home's and the Surf page's. */
  const surf = useSurfNow(looking ? venue : null, now, timeZone, units.distance === 'ft', placeShort)
  const pick = (t: MenuTarget) => {
    onPick(t)
    onClose()
  }
  const loading = brief.status === 'loading' && brief.days.length === 0
  const wx = brief.wx
  const at = (name: string, t: Date) => (wx === null || venue === null ? null : hourlyAt(wx, name, t))
  const temp = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const sunUp = venue !== null && getPosition(now, venue.lat, venue.lon).altitude > -0.8
  const cond = conditionOf(at('weather_code', now), sunUp)
  const wind = windAt(wx, now, obs)
  const day = brief.days[0] ?? null
  const dayTemps = day === null ? [] : Array.from({ length: 24 }, (_, k) => at('temperature_2m', new Date(day.start.getTime() + k * 3_600_000 + 1_800_000))).filter((t): t is number => t !== null)
  const rainHours = Array.from({ length: 8 }, (_, k) => {
    const h = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + k * 3_600_000)
    return { at: h, mm: at('precipitation', h) }
  })
  const rain = rainLine(rainHours, now, timeZone)
  /* Batch Flow, Section 8 (board D_Menu): Weather, then the home's own cards in its order (no Moon), Sky always there. */
  const kinds = menuCardList(order, droneTools)
  const card = (k: MenuCard): { title: string; big: string; line: string; target: MenuTarget } => {
    if (k === 'weather') {
      return { title: 'Weather', big: `${temp(at('temperature_2m', now))} ${cond?.word ?? ''}`.trim(), line: `H ${temp(dayTemps.length === 0 ? null : Math.max(...dayTemps))} L ${temp(dayTemps.length === 0 ? null : Math.min(...dayTemps))}${rain === null ? '' : ` · ${rain.replace(/^No rain next/, 'dry')}`}`, target: 'weather' }
    }
    if (k === 'sky') {
      const past = day?.events.sunset != null && now.getTime() > day.events.sunset.getTime()
      const d = past ? (brief.days[1] ?? null) : day
      const read = past ? (d?.reads.sunrise ?? null) : (d?.reads.sunset ?? null)
      const ev = past ? (d?.events.sunrise ?? null) : (d?.events.sunset ?? null)
      const said = colorWords(read?.call ?? null)
      return { title: 'Sky', big: said === null ? '—' : said.replace(/^./, (c) => c.toUpperCase()), line: ev == null ? '' : `${past ? 'sunrise' : 'sunset'} ${clock(ev)}`, target: 'sky' }
    }
    if (k === 'surf') return { title: 'Surf', big: surf.nowWords ?? '—', line: surf.away !== null ? `nearest: ${surf.away.name}` : surf.now === null ? '' : `${surf.now.tag.toLowerCase()} now`, target: 'surf' }
    if (k === 'wind') {
      const side = wind?.fromDeg == null ? null : windTag(wind.fromDeg, brief.facing)
      return { title: 'Wind', big: windWords(wind, units.wind) ?? '—', line: [side === null ? null : sideWords(side), gustWords(wind, units.wind)].filter((x) => x !== null).join(' · '), target: 'wind' }
    }
    if (k === 'tide') {
      const next = brief.turns.find((x) => x.at.getTime() > now.getTime()) ?? null
      return { title: 'Tide', big: next === null ? '—' : next.kind === 'high' ? 'Rising' : 'Falling', line: next === null ? '' : `${next.kind} ${clock(next.at)}`, target: 'tides' }
    }
    const w = day === null ? null : day.wind.reduce<(typeof day.wind)[number] | null>((a, b) => (a === null || Math.abs(b.at.getTime() - now.getTime()) < Math.abs(a.at.getTime() - now.getTime()) ? b : a), null)
    const tag = drone === null || w === null ? null : droneTag(w.highMps, drone.maxWindMps)
    return { title: 'Drone', big: w?.highMps == null ? '—' : `${Math.round(windIn(w.highMps, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`, line: tag === null ? 'at 400 ft' : `${tag.toLowerCase()} at 400 ft`, target: 'drone' }
  }

  return (
    <div className="menu menu--d" role="presentation">
      <nav className="menu__panel sidemenu__panel" aria-label="Stage">
        <div className="menu__head">
          {/* Batch Flow, Section 8: the spot once, with the weather now; a tap is the home. */}
          <button type="button" ref={first} className="menu__spot mcard--today sidemenu__item" onClick={() => pick('today')} aria-label={`${placeShort}: the home`}>
            <span className="menu__title sidemenu__label">{placeShort}</span>
            <span className="menu__where num">{loading ? 'reading the forecast…' : [temp(at('temperature_2m', now)), cond?.word.toLowerCase() ?? null, wind === null ? null : `${wind.fromDeg === null ? '' : `${compass(wind.fromDeg)} `}${Math.round(windIn(wind.mps, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`].filter((x) => x !== null && x !== '—').join(' · ')}</span>
          </button>
          <button type="button" className="menu__x sidemenu__scrim" aria-label="Close the menu" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="menu__cards menu__cards--d">
          {kinds.map((k) => {
            const c = card(k)
            return (
              <button key={k} type="button" className={`mcard mcard--${k === 'surf' ? 'water' : k} mcard--d sidemenu__item`} onClick={() => pick(c.target)}>
                <span className="mcard__name sidemenu__label">{c.title}</span>
                <span className="mcard__value">{loading ? '…' : k === 'surf' ? <span data-shared="surf">{c.big}</span> : c.big}</span>
                <span className="mcard__sub">{loading ? '' : c.line}</span>
              </button>
            )
          })}
        </div>

        <div className="menu__rows">
          {!photoTools ? null : <Row label="Plan a shoot" value="Shoot" icon={<PlanIcon />} onTap={() => pick('setup')} />}
          <Row label="Calendar" value="the month" icon={<SavedIcon />} onTap={() => pick('calendar')} />
          <Row label="Kit" value={rows.kit} icon={<KitIcon />} onTap={() => pick('kit')} />
          <Row label="Saved" value={rows.saved} icon={<SavedIcon />} onTap={() => pick('saved')} />
          <Row label="Settings" value={rows.settings} icon={<GearIcon />} onTap={() => pick('settings')} />
        </div>
      </nav>
    </div>
  )
}




function Row({ label, value, icon, onTap }: { label: string; value: string; icon: ReactNode; onTap: () => void }) {
  return (
    <button type="button" className="mrow sidemenu__item" onClick={onTap}>
      <span className="mrow__icon">{icon}</span>
      <span className="mrow__label sidemenu__label">{label}</span>
      <span className="mrow__value">{value}</span>
      <span className="mrow__chev" aria-hidden="true">
        ›
      </span>
    </button>
  )
}

/* Line icons, 20 px, in the card's own white. */
const svg = (d: ReactNode) => (
  <svg className="micon" viewBox="0 0 24 24" aria-hidden="true">
    {d}
  </svg>
)
const PlanIcon = () => svg(<><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>)
const KitIcon = () => svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-2.5h5L16 7" /></>)
const SavedIcon = () => svg(<path d="M6 3h12v18l-6-4-6 4z" />)
const GearIcon = () => svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>)

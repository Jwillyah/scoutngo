import { beachName, sameBeach, useSurfBeach } from '../lib/surfBeach.ts'
import { useSurfNow } from '../lib/useSurfNow.ts'
import { SpotPicker } from './SpotPicker.tsx'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { stormNote } from '../lib/stormRiskData.ts'
import { useCoast } from '../lib/coastData.ts'
import { droneCard, skyCard, skyTabFor, todayCard, waterCard, type CardDay, type Tone } from '../core/menuCards.ts'
import { formatClock } from '../core/timezone.ts'
import { useBriefing } from '../lib/useBriefing.ts'
import { windIn, windUnitLabel, type Units } from '../lib/units.ts'

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

export type MenuTarget = 'today' | 'sky' | 'water' | 'drone' | 'viewfinder' | 'plan' | 'kit' | 'saved' | 'settings'

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

function MenuSheet({ venue, placeShort, timeZone, units, drone, rows, photoTools = true, droneTools = true, now, onPick, onClose, first }: MenuProps & { first: React.RefObject<HTMLButtonElement | null> }) {
  /* Asked only once the menu has been open a moment: a tap straight through it to a place asks nothing. */
  const [looking, setLooking] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLooking(true), LOOK_AFTER_MS)
    return () => clearTimeout(t)
  }, [])
  const brief = useBriefing(venue, timeZone, now, venue !== null && looking, 'next')
  const days = brief.days as unknown as CardDay[]
  const clock = (d: Date) => formatClock(d, timeZone)
  const today = useMemo(() => todayCard(days, clock, timeZone), [days, timeZone]) // eslint-disable-line react-hooks/exhaustive-deps
  const sky = useMemo(() => skyCard(days, now, clock), [days, now]) // eslint-disable-line react-hooks/exhaustive-deps
  /* Batch K addendum B: when storms lead, the Sky card says so, with when they arrive (noted by Today; the card asks nothing itself). */
  const note = stormNote()
  const storms = note !== null && note.startsWith('Storms · ') ? note.slice('Storms · '.length) : null
  /* Batch J, Section 7: the Water card everywhere, inland too, for a named surf beach: the nearest, or the one picked; its own sea and tide when it is not here. */
  const [beach, setBeach] = useSurfBeach(venue)
  const [pickingBeach, setPickingBeach] = useState(false)
  const here = sameBeach(venue, beach)
  const beachBrief = useBriefing(here || beach === null ? null : beach.at, timeZone, now, looking && !here, 'sea')
  const waterDay = here ? (days[0] ?? null) : ((beachBrief.days[0] as unknown as CardDay | undefined) ?? null)
  const water = useMemo(() => waterCard(waterDay, now, clock, beach?.name ?? null), [waterDay, now, beach?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  /* Batch Map A2: the value is the one surf number (src/lib/useSurfNow.ts), the home's and the Surf page's, not the day's extremes. */
  const surf = useSurfNow(looking ? venue : null, now, timeZone, units.distance === 'ft')
  /* Batch K, Section 5: the NWS's rip current risk for the beach, as a fact under the card when the surf zone forecast gives one. */
  const rip = useCoast(beach?.at ?? null, null, 'mi', looking).coast?.rip ?? null
  const flight = useMemo(() => droneCard(days[0] ?? null, drone?.maxWindMps ?? null, now, (mps) => `${Math.round(windIn(mps, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`), [days, drone, now, units.wind])
  const loading = brief.status === 'loading' && days.length === 0
  const date = `${new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now)} ${new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone }).format(now)}`
  const pick = (t: MenuTarget, opts?: { skyTab?: 'fire' | 'now' }) => {
    onPick(t, opts)
    onClose()
  }
  const wait = (tone: Tone) => (loading ? 'bad' : tone)

  return (
    <div className="menu" role="presentation">
      <nav className="menu__panel sidemenu__panel" aria-label="Stage">
        <div className="menu__head">
          <div>
            <p className="menu__title">Menu</p>
            <p className="menu__where">
              {placeShort} · {date}
            </p>
          </div>
          <button type="button" className="menu__x sidemenu__scrim" aria-label="Close the menu" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="menu__cards">
          <LiveCard refTo={first} kind="today" title="Today" icon={<TodayIcon />} value={loading ? '…' : today.value} sub={loading ? 'reading the forecasts' : today.sub} tone={wait(today.tone)} onTap={() => pick('today')}>
            <p className="mcard__line">{today.line ?? ''}</p>
          </LiveCard>
          <LiveCard kind="sky" title="Sky" icon={<SkyIcon />} value={loading ? '…' : storms !== null ? 'Storms' : sky.value} sub={loading ? '' : (storms ?? sky.sub)} tone={wait(sky.tone)} onTap={() => pick('sky', photoTools ? { skyTab: skyTabFor(days, now) } : undefined)}>
            <div className={`mcard__strip${sky.lowDeck ? ' mcard__strip--deck' : ''}`} aria-hidden="true">
              {sky.lowDeck || sky.strip.length === 0 ? null : <i className="mcard__clock" style={{ background: stripGradient(sky.strip) }} />}
              {sky.peak === null ? null : <i className="mcard__peak" style={{ left: `${Math.max(0, Math.min(100, sky.peak * 100))}%` }} />}
            </div>
          </LiveCard>
          <div className="mcard-wrap">
            <LiveCard kind="water" title="Water" icon={<WaterIcon />} value={loading || surf.sea.status === 'loading' ? '…' : <span data-shared="surf">{surf.nowWords ?? '—'}</span>} sub={loading ? '' : (rip?.replace(/ \(NWS .*\)$/, '') ?? water.sub)} tone={wait(water.tone)} onTap={() => pick('water')}>
              <Bars bars={water.bars.map((b) => ({ h: b.h, now: b.now, cls: b.clean ? 'clean' : 'messy' }))} />
            </LiveCard>
            {beach === null ? null : (
              <button type="button" className="mcard__beach" aria-label={`Surf beach: ${beach.name}. Pick another`} onClick={() => setPickingBeach(true)}>
                {beach.name}
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.5 4.5L6 8l3.5-3.5" />
                </svg>
              </button>
            )}
          </div>
          {/* Batch K addendum, E: Preflight lives here now (the layers sheet's tile went), so the card is there with no drone in the kit too. */}
          {!droneTools ? null : drone === null ? (
            <LiveCard kind="drone" title="Drone" icon={<DroneIcon />} value="Preflight" sub="draw a move" tone="maybe" onTap={() => pick('drone')}>
              {null}
            </LiveCard>
          ) : (
            <LiveCard kind="drone" title="Drone" icon={<DroneIcon />} value={loading ? '…' : flight.value} sub={loading ? '' : flight.sub} tone={wait(flight.tone)} onTap={() => pick('drone')}>
              <Bars bars={flight.bars.map((b) => ({ h: b.h, now: b.now, cls: b.over === 'over' ? 'over' : b.over === 'near' ? 'near' : 'ok' }))} limit={flight.limit} />
            </LiveCard>
          )}
        </div>

        {!pickingBeach ? null : (
          <SpotPicker
            title="Surf beach"
            saved={[]}
            around={beach?.at ?? venue}
            onPick={(at, label) => {
              setBeach({ name: beachName(label), at })
              setPickingBeach(false)
            }}
            onClose={() => setPickingBeach(false)}
          />
        )}

        {/* Batch I: the Viewfinder's own row, right under the cards. */}
        {!photoTools ? null : (
          <div className="menu__rows">
            <Row label="Viewfinder" value="point your phone, see the shot" icon={<KitIcon />} onTap={() => pick('viewfinder')} />
          </div>
        )}

        <div className="menu__rows">
          <Row label="Plan" value={rows.plan} icon={<PlanIcon />} onTap={() => pick('plan')} />
          <Row label="Kit" value={rows.kit} icon={<KitIcon />} onTap={() => pick('kit')} />
          <Row label="Saved" value={rows.saved} icon={<SavedIcon />} onTap={() => pick('saved')} />
          <Row label="Settings" value={rows.settings} icon={<GearIcon />} onTap={() => pick('settings')} />
        </div>
      </nav>
    </div>
  )
}

/** The colour clock as a gradient: each minute's own colour, the unlit ones dark. */
function stripGradient(strip: (string | null)[]): string {
  const n = strip.length
  const stops = strip.map((c, i) => `${c ?? 'rgb(20 24 40 / 0.6)'} ${((i / Math.max(1, n - 1)) * 100).toFixed(1)}%`)
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function LiveCard({ kind, title, icon, value, sub, tone, onTap, children, refTo }: { kind: string; title: string; icon: ReactNode; value: ReactNode; sub: string; tone: Tone; onTap: () => void; children: ReactNode; refTo?: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <button type="button" ref={refTo} className={`mcard mcard--${kind} mcard--${tone} sidemenu__item`} onClick={onTap}>
      <span className="mcard__top">
        <span className="mcard__name">
          {icon}
          <span className="sidemenu__label">{title}</span>
        </span>
        <span className="mcard__read">
          <span className="mcard__value">{value}</span>
          <span className="mcard__sub">{sub}</span>
        </span>
      </span>
      <span className="mcard__chart">{children}</span>
    </button>
  )
}

function Bars({ bars, limit = null }: { bars: { h: number; now: boolean; cls: string }[]; limit?: number | null }) {
  return (
    <span className="mbars" aria-hidden="true">
      {bars.map((b, i) => (
        <i key={i} className={`mbars__bar mbars__bar--${b.cls}${b.now ? ' mbars__bar--now' : ''}`} style={{ height: `${Math.max(6, b.h * 100)}%` }} />
      ))}
      {limit === null ? null : <i className="mbars__limit" style={{ bottom: `${Math.min(100, limit * 100)}%` }} />}
    </span>
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
const TodayIcon = () => svg(<><path d="M4 18h16M7 18a5 5 0 0 1 10 0" /><path d="M12 6v3M5.6 9.6l1.8 1.8M18.4 9.6l-1.8 1.8" /></>)
const SkyIcon = () => svg(<path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18z" />)
const WaterIcon = () => svg(<path d="M2 17c2.5 0 3.5-1.5 4.5-4C8 9 10.5 6 15 6c3 0 5 1.6 5 4-1.2-1-2.6-1.2-3.8-.6-1.6.8-1.7 3-.2 4.3 1.2 1 3 1.2 5 .3-1 2-3.3 3-6 3H2" />)
const DroneIcon = () => svg(<><circle cx="5" cy="6" r="2.5" /><circle cx="19" cy="6" r="2.5" /><path d="M7 7.5l3 3h4l3-3M10 10.5v3h4v-3M12 13.5v4" /></>)
const PlanIcon = () => svg(<><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>)
const KitIcon = () => svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-2.5h5L16 7" /></>)
const SavedIcon = () => svg(<path d="M6 3h12v18l-6-4-6 4z" />)
const GearIcon = () => svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>)

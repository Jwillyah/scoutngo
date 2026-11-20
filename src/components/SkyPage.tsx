import '../styles/sky.css'
import { colourNowWords, skyCallNow } from '../core/skyCall.ts'
import { useEffect, useMemo, useState } from 'react'
import { getPosition } from 'suncalc'
import type { CamEntry } from '../core/camPick.ts'
import { compassPoint } from '../core/field.ts'
import type { LatLon } from '../core/geo.ts'
import { leadLayer } from '../core/fireOutlook.ts'
import { colorWords, groundOf } from '../core/homeDay.ts'
import type { CloudGroup } from '../core/metar.ts'
import { moonNightTab, tonightMoon } from '../core/moonNights.ts'
import { colorHeadline, lightMarks, lightTimeline, plainReason, rareRows, RARE_WAIT_MS, type RareRow } from '../core/skyPage.ts'
import { skyPicture } from '../core/skyPicture.ts'
import { eventTabLabel, skyDayTimes, skyOpenTab, type SkyTabId } from '../core/skyTabs.ts'
import type { Special } from '../core/specialLight.ts'
import { skyCell } from '../core/statStrip.ts'
import { dayRangeWords } from '../core/sunMoonNight.ts'
import { formatClock } from '../core/timezone.ts'
import { SKY_SUN_MOON_NIGHT_PAGE } from '../config/flags.ts'
import { skyNowCams, camKind, type SkyNowCams } from '../lib/skyNowCams.ts'
import { fetchGlassWeek, fetchSpecialWeek, specialsFrom } from '../lib/specialLightData.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { formatRange } from '../lib/units.ts'
import { useLiveSky } from '../lib/useLiveSky.ts'
import { useBriefing } from '../lib/useBriefing.ts'
import { useStationNow } from '../lib/useStationNow.ts'
import { stationWord } from '../core/skyWord.ts'
import { MODELS_CLEAR, nowHeadline, skyNow, stationDoubt, STATION_FRESH_MS, withDoubt } from '../core/skyNow.ts'
import { SkyPicture } from './SkyPicture.tsx'
import { SkyNightMoments, SkyNightMoon, SkyNightStrip } from './SkyNightTab.tsx'
import { TapInPage, type TapInRow } from './TapInPage.tsx'

/*
 * THE SKY PAGE (Batch SIMPLE-2, Section 4; mockups Sky_Now, Sky_Tonight,
 * Sky_Night), on the one page skeleton (src/components/TapInPage.tsx).
 *
 *   Now       the sky now: the sky cams (the big one picked in code,
 *             src/lib/skyNowCams.ts; every cam today is a link out to its
 *             owner, nothing is fetched or kept by us), then Clouds (the
 *             station's report and its age) · Moving (the deck's way and
 *             speed, the models' clearing time only when they clear it) ·
 *             Rare light (now, and the week's list one tap in) · Next
 *   Tonight   the one sky call (src/core/skyCall.ts, with the station's doubt,
 *   Tmrw AM   src/core/skyNow.ts) and a drawing of the sky from the computed
 *             state (src/core/skyPicture.ts: the deck's height, the gap, the
 *             sun), then Golden · Color · Blue hour · Moon, and "Best spot
 *             near me ›" · "Viewfinder ›"
 *   Night     tonight's moon drawn, the 14 nights, the moment cards with
 *             "Plan ›", then Next full · Next new · Darkest nights · Milky
 *             Way · Next shower (src/core/moonNights.ts)
 *
 * It opens on the tab src/core/skyTabs.ts skyOpenTab says. The old Sun · Moon
 * · Night page folds into Tonight and Night (src/config/flags.ts
 * SKY_SUN_MOON_NIGHT_PAGE, off). Facts only: nothing here says the sky or a
 * place is clear or safe.
 */
interface SkyPageProps {
  venue: LatLon
  placeName: string
  timeZone: string
  now: Date
  onBack: () => void
  /** The round Map button (Batch Flow, Section 2). The tap-in skeleton has none; kept so the call keeps working. */
  onMap?: () => void
  onViewfinder?: () => void
  /** Kept so the call keeps working: the month is Menu › Calendar now (Batch SIMPLE-2, Section 3). */
  onCalendar: () => void
  /** "More details ›": the Sky color page in full (the colour clock, your log); 'now' the old Sun · Moon · Night page, with its flag on. */
  onDetail?: (view: 'fire' | 'now') => void
  /** Batch BEST SKY: "Best spot near me ›". */
  onBestSky?: () => void
  /** Batch SIMPLE-2: open on this tab rather than the rule's (the home's Moon tile: Night). */
  initialTab?: SkyTabId
  /** Batch SIMPLE-2, Section 0: Night's moment cards' "Plan ›" (App: openPlanner('sky-night')). Without it there is no Plan button. */
  onPlan?: (door: 'sky-night', date: Date) => void
  /** Cam distances in miles (the app's feet-and-miles setting); kilometres otherwise. */
  miles?: boolean
}

type Kind = 'sunset' | 'sunrise'
const KIND_OF_TAB = { tonight: 'sunset', 'tmrw-am': 'sunrise' } as const
const TAB_OF_KIND = { sunset: 'tonight', sunrise: 'tmrw-am' } as const

const AMOUNT_WORD: Record<CloudGroup['amount'], string> = { FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast', VV: 'Sky hidden' }
const AMOUNT_RANK: Record<CloudGroup['amount'], number> = { FEW: 1, SCT: 2, BKN: 3, OVC: 4, VV: 4 }
/** The deck a report speaks for, under 20,000 ft: its lowest broken or overcast (the ceiling), else its most covering, the lower of two alike. */
const deckOf = (groups: readonly CloudGroup[]): CloudGroup | null => {
  const under = groups.filter((g) => g.baseFt < 20_000)
  const ceiling = under.filter((g) => AMOUNT_RANK[g.amount] >= 3).sort((a, b) => a.baseFt - b.baseFt)[0]
  return ceiling ?? [...under].sort((a, b) => AMOUNT_RANK[b.amount] - AMOUNT_RANK[a.amount] || a.baseFt - b.baseFt)[0] ?? null
}
const ft = (n: number) => `${(Math.round(n / 100) * 100).toLocaleString('en-US')} ft`
const KT_PER_MPS = 1 / 0.514444
const RARE_NOW = { rays: 'Light rays', iridescence: 'Iridescence', halo: 'A halo' } as const

export function SkyPage({ venue, placeName, timeZone, now, onBack, onViewfinder, onDetail, onBestSky, initialTab, onPlan, miles = true }: SkyPageProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  /* Batch Polish 2, Section 1: the nearest station's sky is this page's (a station reports now). */
  const station = useStationNow(venue, now, typeof navigator === 'undefined' ? false : navigator.onLine)
  const clock = (d: Date | null) => (d === null ? '—' : formatClock(d, timeZone))
  /* The clock is App's, put right whenever the app comes back to the front. */
  const realNow = now
  /* Batch CORE, Section 1.1 and 1.3: the one sky call (src/core/skyCall.ts); an event holds the page through its colour. */
  const soonest: Kind = skyCallNow(brief.days, realNow, venue)?.kind ?? 'sunset'
  const stationAt = station === null || station.at === '' ? null : new Date(station.at)
  const fresh = station !== null && stationAt !== null && realNow.getTime() - stationAt.getTime() <= STATION_FRESH_MS ? { sky: station.sky, at: stationAt, via: station.via } : null
  const wxWhen = (n: string, t: Date) => (brief.wx === null ? null : hourlyAt(brief.wx, n, t))
  /* Batch CORE, Section 1.6: the deck's motion (the wind at 500 hPa). */
  const aloft = wxWhen('wind_speed_500hPa', realNow)
  const aloftFrom = wxWhen('wind_direction_500hPa', realNow)
  const motion = aloft === null || aloftFrom === null ? null : { fromDeg: aloftFrom, mps: aloft }
  const deckOverhead = fresh !== null && fresh.sky.groups.some((g) => (g.amount === 'BKN' || g.amount === 'OVC') && g.baseFt < 20_000)

  /* ONE CALL PER EVENT: the sky call, the station's doubt on it, and what the picture and the rows read. */
  const callFor = (kind: Kind) => {
    const c = skyCallNow(brief.days, realNow, venue, kind)
    const day = c === null ? null : (brief.days[c.dayIndex] ?? null)
    const event = day?.events[kind] ?? null
    const verdict = day?.verdicts[kind] ?? null
    /* The hour the models clear the deck here, before the event. */
    let clearsAt: Date | null = null
    if (event !== null) {
      for (let t = realNow.getTime(); t <= event.getTime(); t += 15 * 60_000) {
        const low = wxWhen('cloud_cover_low', new Date(t))
        const mid = wxWhen('cloud_cover_mid', new Date(t))
        if (low !== null && mid !== null && Math.max(low, mid) < MODELS_CLEAR) {
          clearsAt = new Date(t)
          break
        }
      }
    }
    const doubt = stationDoubt(verdict, fresh === null ? null : { sky: fresh.sky, at: fresh.at }, event, realNow, (d) => formatClock(d, timeZone), motion, clearsAt)
    const read = withDoubt(day?.reads[kind] ?? null, doubt)
    const sun = event === null ? null : getPosition(event, venue.lat, venue.lon)
    return { kind, event, verdict, read, doubt, clearsAt, sun, lead: verdict === null ? null : leadLayer(verdict) }
  }
  const calls = { sunset: callFor('sunset'), sunrise: callFor('sunrise') }

  /* THE TAB: the rule's (src/core/skyTabs.ts), once, when the page opens; a row that names another tab moves there. */
  const [opened] = useState<SkyTabId>(() => initialTab ?? skyOpenTab(realNow, skyDayTimes(realNow, venue.lat, venue.lon, timeZone)))
  const [tab, setTab] = useState<SkyTabId>(opened)
  const [jump, setJump] = useState(0)
  const goTab = (t: SkyTabId) => {
    setTab(t)
    setJump((j) => j + 1)
  }
  const [weekOpen, setWeekOpen] = useState(false)
  const [showRoad, setShowRoad] = useState(false)

  /* The week's rare light: five models' rules and the glassy mornings (at a coast). */
  const [rare, setRare] = useState<{ key: string; rows: RareRow[] | null; all: RareRow[] } | null>(null)
  const key = `${venue.lat},${venue.lon}`
  useEffect(() => {
    let live = true
    /* Batch LIVE, Section 10.7: after RARE_WAIT_MS it says the forecast did not arrive. */
    const late = window.setTimeout(() => live && setRare((r) => (r !== null && r.key === key ? r : { key, rows: null, all: [] })), RARE_WAIT_MS)
    void (async () => {
      const week = await fetchSpecialWeek(venue).catch(() => null)
      const list: Special[] = week === null ? [] : specialsFrom(week.week, venue, week.seaCAt)
      const glass = brief.facing === null ? [] : await fetchGlassWeek(venue, new Date()).catch(() => [])
      const found = [...list, ...glass]
      window.clearTimeout(late)
      if (live) setRare({ key, rows: week === null && glass.length === 0 ? null : rareRows(found, new Date(), venue), all: rareRows(found, new Date(), venue, Infinity) })
    })()
    return () => {
      live = false
      window.clearTimeout(late)
    }
  }, [key, brief.facing]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = rare === null || rare.key !== key ? 'loading' : rare.rows
  const dayWord = (d: Date) => {
    const iso = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x)
    return iso(d) === iso(now) ? 'Today' : new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d)
  }

  /* Sky › Now's cams: src/data/cams.json, its own chunk, loaded the first time Now is shown. */
  const [camList, setCamList] = useState<readonly CamEntry[] | null>(null)
  useEffect(() => {
    if (tab !== 'now' || camList !== null) return
    let live = true
    void import('../data/cams.json').then(
      (m) => live && setCamList(m.default as unknown as CamEntry[]),
      () => live && setCamList([]),
    )
    return () => {
      live = false
    }
  }, [tab, camList])
  const minute = Math.floor(realNow.getTime() / 60_000)
  const cams = useMemo<SkyNowCams | null>(() => (camList === null ? null : skyNowCams(venue, camList, new Date(minute * 60_000))), [camList, venue, minute])

  /* Sky › Night: every number src/core/moonNights.ts's, worked out when the tab is shown, again each 10 minutes. */
  const tenMin = Math.floor(realNow.getTime() / 600_000)
  const night = useMemo(() => (tab === 'night' ? moonNightTab(new Date(tenMin * 600_000), venue.lat, venue.lon, timeZone) : null), [tab, tenMin, venue.lat, venue.lon, timeZone])

  const wxAt = (n: string) => wxWhen(n, now)
  /* Batch LIVE, Section 7: the live sky's ground here with Settings › Live sky on everywhere. */
  const live = useLiveSky('sky', venue, now, wxAt('weather_code'), { low: wxAt('cloud_cover_low'), mid: wxAt('cloud_cover_mid'), high: wxAt('cloud_cover_high') }, station === null ? null : stationWord(station.sky))
  const sunNow = getPosition(now, venue.lat, venue.lon)
  const ground = tab === 'night' ? 'night' : (live?.ground ?? groundOf(sunNow.altitude, wxAt('weather_code'), false))

  const how = (
    <>
      <p>Now: the nearest airport station&rsquo;s cloud report and its age; the deck&rsquo;s way and speed are the models&rsquo; wind at 500 hPa, and &ldquo;clears&rdquo; is said only when the models clear it here before the event. The big cam faces the sun within 90 minutes of sunrise or sunset, else it is the nearest; every cam opens on its owner&rsquo;s site, and nothing of it passes through ours.</p>
      <p>The call: the same read as the home&rsquo;s Sky card, from six weather models along the line toward the sun, and from the stations in the hours before. The picture draws the deck at its height, the gap toward the sun when the models read one, and the sun where it sets or rises.</p>
      <p>The light: the sun&rsquo;s height, golden from +6°, blue from −4°, dark from −6° (civil dusk); the colour window is the call&rsquo;s own, else the 20 minutes round the event.</p>
      <p>Rare light: five models&rsquo; hours, by written rules. Fog: dew point within 2°F of the air and wind under 6 kt. Rainbow: showers within 25 km opposite the sun, the sun under 42°. Light rays: low cloud 30–80% with the sun under 15°. Mirror water: a low tide within 90 minutes of sunrise and a light wind. A rule, not a promise.</p>
      <p>Night: the moon&rsquo;s rise, set and bearing on this place&rsquo;s own day, held to the US Naval Observatory&rsquo;s answers within 5 minutes; full and new moon to the minute (Meeus). Big moonrise: within a day of full, rising within 45 minutes of sunset. Moonset at sunrise: 95% lit or more, setting within 30 minutes of sunrise. Darkest nights: the new moon ±3 days. The Milky Way: the core 5° up with the sun 18° down and the moon down or under half lit.</p>
    </>
  )

  /* ------------------------------------------------------------ the tabs */
  const tabs = [
    { id: 'now', label: 'Now' },
    { id: 'tonight', label: eventTabLabel('sunset', calls.sunset.event, realNow, timeZone) },
    { id: 'tmrw-am', label: eventTabLabel('sunrise', calls.sunrise.event, realNow, timeZone) },
    { id: 'night', label: 'Night' },
  ] as const

  const page = (() => {
    if (tab === 'now') return weekOpen ? weekView() : nowView()
    if (tab === 'night') return nightView()
    return eventView(KIND_OF_TAB[tab])
  })()

  /* Back closes the week's list first, then the page. */
  const back = () => (weekOpen ? setWeekOpen(false) : onBack())

  return (
    <TapInPage
      key={jump}
      title="Sky"
      spot={placeName}
      ground={ground}
      kind={`spage spage--${tab}`}
      onBack={back}
      how={how}
      tabs={tabs}
      initialTab={tab}
      onTab={(id) => {
        setTab(id as SkyTabId)
        setWeekOpen(false)
      }}
      {...page}
    />
  )

  /* ------------------------------------------------------------- Now */
  function nowView() {
    const model = brief.wx === null ? null : { low: wxAt('cloud_cover_low'), mid: wxAt('cloud_cover_mid'), high: wxAt('cloud_cover_high') }
    const read = skyNow(fresh?.sky ?? null, model, sunNow.altitude, compassPoint(sunNow.azimuth))
    const named = nowHeadline(read.worth)
    const colourNow = colourNowWords(skyCallNow(brief.days, realNow, venue), realNow, deckOverhead)
    const word = fresh !== null ? stationWord(fresh.sky) : skyCell(model)
    const deck = fresh === null ? null : deckOf(fresh.sky.groups)
    const moving = motion === null ? null : compassPoint(motion.fromDeg + 180)
    const ageMin = fresh === null ? null : Math.max(0, Math.round((realNow.getTime() - fresh.at.getTime()) / 60_000))
    const next = calls[soonest]
    const nowRare = read.worth.find((w) => w.kind !== 'texture') ?? null
    const firstWeek = rows === 'loading' || rows === null ? null : (rows[0] ?? null)
    const out: TapInRow[] = [
      fresh === null
        ? { label: 'Clouds', value: word ?? '—', detail: word === null ? 'no station report, no forecast for this hour' : 'forecast · no station report in 75 min' }
        : { label: 'Clouds', value: deck === null ? (fresh.sky.clear ? 'None under 12,000 ft' : (stationWord(fresh.sky) ?? '—')) : `${AMOUNT_WORD[deck.amount]} ${ft(deck.baseFt)}`, detail: `${fresh.sky.station} · ${ageMin} min` },
      motion === null || moving === null
        ? { label: 'Moving', value: '—', detail: 'the forecast did not say' }
        : { label: 'Moving', value: `${moving} ${Math.round(motion.mps * KT_PER_MPS)} kt`, detail: next.clearsAt !== null && next.event !== null && next.clearsAt.getTime() < next.event.getTime() ? `clears ~${clock(next.clearsAt)}` : 'wind aloft' },
      {
        label: 'Rare light',
        value: nowRare === null ? 'None now' : `${RARE_NOW[nowRare.kind as keyof typeof RARE_NOW]} now`,
        detail: rows === 'loading' ? 'reading the week…' : rows === null ? "the week's forecast did not arrive" : firstWeek === null ? 'none this week' : `next: ${firstWeek.name} ${dayWord(firstWeek.at)} ${clock(firstWeek.at)}`,
        ...(rows === 'loading' || rows === null || rows.length === 0 ? {} : { onClick: () => setWeekOpen(true) }),
      },
      next.event === null
        ? { label: 'Next', value: '—', detail: 'no sunrise or sunset ahead' }
        : { label: 'Next', value: `${soonest === 'sunset' ? 'Sunset' : 'Sunrise'} ${clock(next.event)}`, detail: colorHeadline(next.read?.call ?? null), onClick: () => goTab(TAB_OF_KIND[soonest]) },
    ]
    return {
      hero: {
        eyebrow: 'Looking like · now',
        value: word ?? '—',
        sub: `${colourNow !== null ? `Color now · ${colourNow}` : (named?.head ?? 'Nothing special now')}${moving === null || deck === null ? '' : ` · deck moving ${moving}`}`,
        subData: { 'data-now-head': '' },
      },
      children: <NowCams cams={cams} miles={miles} showRoad={showRoad} onShowRoad={() => setShowRoad((s) => !s)} />,
      rows: out,
      ...(onDetail === undefined ? {} : { onMore: () => onDetail('fire') }),
      safety: 'Cams by their owners · look up too',
    }
  }

  /* The week's rare light, one tap in from Now's Rare light row. */
  function weekView() {
    return {
      hero: { eyebrow: 'Rare light', value: 'This week', sub: 'Only what the numbers found' },
      children: (
        <section className="tipage__card spage__rare" aria-label="Rare light this week">
          <p className="dcard__label">Rare light this week</p>
          {rows === 'loading' ? (
            <p className="spage__none">Reading five forecasts for the week…</p>
          ) : rows === null ? (
            <p className="spage__none">The week's forecast did not arrive.</p>
          ) : rows.length === 0 ? (
            <p className="spage__none">Nothing rare in the forecast this week.</p>
          ) : (
            <ul className="spage__rows">
              {rows.map((r) => (
                <li key={`${r.kind}${r.at.getTime()}`} className="spage__row">
                  <span className="spage__when num">
                    {dayWord(r.at)} {clock(r.at)}
                  </span>
                  <span className="spage__what">
                    <b>{r.name}</b>
                    <span>{r.why}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ),
      rows: [],
      safety: 'A rule, not a promise',
    }
  }

  /* --------------------------------------------------- Tonight, Tmrw AM */
  function eventView(kind: Kind) {
    const c = calls[kind]
    const { event, read, doubt, verdict, sun, lead } = c
    const az = sun === null ? null : sun.azimuth
    const look = read?.lookDeg ?? az
    const pink = az !== null && verdict?.afterglow != null && (verdict.afterglow.sky.fires || verdict.afterglow.sky.belt) ? compassPoint(az + 180) : null
    const word = kind === 'sunset' ? 'Sunset' : 'Sunrise'
    const peak = read?.peak ?? null
    /* The deck the call speaks for: the station's when its report is fresh and the event within 3 hours, else the models' lead layer when it is cloud to light. */
    const near = fresh !== null && event !== null && event.getTime() - realNow.getTime() <= 3 * 3_600_000 ? deckOf(fresh.sky.groups) : null
    const deck = near !== null && near.amount !== 'FEW' ? { baseFt: near.baseFt, lit: lead?.fires === true, by: fresh?.sky.station ?? null } : lead !== null && lead.canvas ? { baseFt: lead.heightM * 3.28084, lit: lead.fires, by: null } : null
    const pic = skyPicture({ sunAzDeg: az, sunAltDeg: sun?.altitude ?? null, deck, gap: read?.confirmed === true ? 'open' : (lead?.gap ?? null) })
    const marks = event === null ? [] : lightMarks(kind, event, (t) => getPosition(t, venue.lat, venue.lon).altitude)
    const segs = event === null ? [] : lightTimeline(kind, event, marks, read?.colorFrom ?? null, read?.colorTo ?? null)
    const seg = (k: 'golden' | 'color' | 'blue') => segs.find((s) => s.key === k) ?? null
    const span = (k: 'golden' | 'color' | 'blue') => {
      const s = seg(k)
      return s === null ? '—' : `${clock(s.from)}–${clock(s.to)}`
    }
    const moon = event === null ? null : tonightMoon(event, venue.lat, venue.lon, timeZone)
    const moonRow: TapInRow =
      moon === null
        ? { label: 'Moon', value: '—' }
        : {
            label: 'Moon',
            value: `${Math.round(moon.lit * 100)}% · ${moon.up ? 'up' : 'down'}`,
            detail: moon.up ? (moon.set === null ? undefined : `sets ${clock(moon.set.at)} ${moon.set.compass}`) : moon.rise === null ? undefined : `rises ${clock(moon.rise.at)} ${moon.rise.compass}`,
          }
    const golden: TapInRow = { label: 'Golden', value: span('golden'), detail: 'soft light' }
    const colour: TapInRow = { label: 'Color', value: span('color'), detail: peak !== null ? `peak ${clock(peak)}` : read?.colorFrom != null ? "the call's window" : `around ${kind}` }
    const blue: TapInRow = { label: 'Blue hour', value: span('blue') }
    const shared = { key: kind === soonest ? 'skycall' : 'skycall-picked', value: colorWords(read?.call ?? null) ?? '' }
    const actions = [
      ...(onBestSky === undefined ? [] : [{ label: 'Best spot near me', onClick: onBestSky, primary: true }]),
      ...(onViewfinder === undefined ? [] : [{ label: 'Viewfinder', onClick: onViewfinder }]),
    ]
    return {
      hero: {
        eyebrow: `${eventTabLabel(kind, event, realNow, timeZone)} · ${event === null ? word : `${word} ${clock(event)}`}`,
        value: brief.status === 'loading' && read === null ? '…' : colorHeadline(read?.call ?? null),
        sub: event === null ? 'No sunrise or sunset ahead in the forecast' : `${peak !== null ? `Peak ${clock(peak)}` : `${word} ${clock(event)}`}${look === null ? '' : ` · look ${compassPoint(look)}`}${pink === null ? '' : ` · pink ${pink} ${kind === 'sunset' ? 'after' : 'before'}`}`,
        shared,
      },
      children: (
        <div className="spage__callwhy">
          <p className="spage__why">{plainReason(read?.why ?? null) ?? (brief.status === 'loading' ? 'Reading the forecast…' : 'The forecast did not say.')}</p>
          {doubt === null ? null : <p className="spage__doubt" data-doubt>{doubt.line}</p>}
        </div>
      ),
      chart: <SkyPicture pic={pic} label={`The sky toward the ${kind}: ${pic?.deck?.label ?? 'no deck to light'}${pic?.gap === null || pic === null ? '' : `, ${pic.gap.label}`}, the sun ${pic?.sun.label ?? '—'}`} />,
      rows: kind === 'sunset' ? [golden, colour, blue, moonRow] : [blue, colour, golden, moonRow],
      ...(onDetail === undefined ? {} : { onMore: () => onDetail('fire') }),
      actions,
      safety: 'Forecasts can be wrong · look first',
    }
  }

  /* -------------------------------------------------------------- Night */
  function nightView() {
    if (night === null) return { hero: { eyebrow: 'Moon tonight', value: '…' }, rows: [], safety: 'Moon times computed on this phone' }
    const m = night.tonight
    const r = night.rows
    const date = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(d).replace(',', '')
    const mw = r.milkyWay
    const sub = [
      m.up ? (m.rise === null ? 'Up now' : `Up since ${clock(m.rise.at)}`) : m.rise === null ? 'No moonrise in the next two days' : `Rises ${clock(m.rise.at)} ${m.rise.compass}`,
      m.set === null ? null : `sets ${clock(m.set.at)} ${m.set.compass}`,
    ]
      .filter((x) => x !== null)
      .join(' · ')
    const out: TapInRow[] = [
      { label: 'Next full', value: date(r.nextFull.at), detail: clock(r.nextFull.at) },
      { label: 'Next new', value: date(r.nextNew.at), detail: clock(r.nextNew.at) },
      { label: 'Darkest nights', value: dayRangeWords(r.darkest.from, r.darkest.to), detail: 'new moon ±3 days' },
      mw.tonight.window !== null
        ? { label: 'Milky Way', value: 'Core up tonight', detail: `${clock(mw.tonight.window.from)}–${clock(mw.tonight.window.to)}` }
        : { label: 'Milky Way', value: 'Core not up', detail: mw.next?.window == null ? 'not in the next 150 nights' : `back ${date(mw.next.window.from)}` },
      r.shower === null ? { label: 'Next shower', value: '—' } : { label: 'Next shower', value: r.shower.shower.name, detail: `peak ${dayRangeWords(r.shower.nights[0], r.shower.nights[1])}` },
    ]
    return {
      hero: { eyebrow: `Moon tonight · ${m.waxing ? 'waxing' : 'waning'}`, value: `${Math.round(m.lit * 100)}% lit`, sub },
      children: (
        <>
          <SkyNightMoon night={night} />
          <SkyNightStrip night={night} />
          <SkyNightMoments night={night} clock={(d) => clock(d)} onPlan={onPlan === undefined ? undefined : (at) => onPlan('sky-night', at)} />
        </>
      ),
      rows: out,
      ...(SKY_SUN_MOON_NIGHT_PAGE && onDetail !== undefined ? { onMore: () => onDetail('now') } : {}),
      safety: 'Moon times computed on this phone',
    }
  }
}

/* --------------------------------------------------------- Now's cams */
const WHY_WORD = { sun: 'faces the sun', deck: 'faces the deck', nearest: 'nearest' } as const

function NowCams({ cams, miles, showRoad, onShowRoad }: { cams: SkyNowCams | null; miles: boolean; showRoad: boolean; onShowRoad: () => void }) {
  const dist = (km: number) => formatRange(km * 1000, miles ? 'ft' : 'm')
  if (cams === null) return <p className="snow__none">Finding the cams near you…</p>
  const big = cams.big
  return (
    <section className="snow" aria-label="Sky cams">
      {big === null ? (
        <p className="tipage__card snow__none">No sky cam within 15 km.</p>
      ) : (
        /* A link out: the owner's page opens in the browser. Nothing of the cam is fetched, shown or kept here (embed false). */
        <a className="tipage__card snow__big" href={big.cam.url} target="_blank" rel="noopener noreferrer" data-embed={String(big.cam.embed)} data-cam={big.cam.id}>
          <span className="snow__chip">
            {big.cam.name}
            {big.cam.facing === null ? '' : ` · faces ${compassPoint(big.cam.facing)}`}
          </span>
          <span className="snow__why">{cams.bigWhy === null ? '' : WHY_WORD[cams.bigWhy]}</span>
          <span className="snow__meta">
            {camKind(big.cam)} · {big.cam.operator} · {dist(big.km)} <b>link out ↗</b>
          </span>
        </a>
      )}
      {cams.strip.length === 0 ? null : (
        <ul className="snow__strip">
          {cams.strip.map((x) => (
            <li key={x.cam.id}>
              <a className="snow__small" href={x.cam.url} target="_blank" rel="noopener noreferrer" data-embed={String(x.cam.embed)}>
                <b>{x.cam.name}</b>
                <span>
                  {camKind(x.cam).replace(' cam', '')} · {x.cam.facing === null ? dist(x.km) : compassPoint(x.cam.facing)} ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {cams.hiddenRoadOnlyCount === 0 ? null : (
        <button type="button" className="snow__showall" aria-expanded={showRoad} onClick={onShowRoad}>
          {showRoad ? 'Hide the road-only cams' : `${cams.hiddenRoadOnlyCount} road-only cam${cams.hiddenRoadOnlyCount === 1 ? '' : 's'} hidden · Show all`}
        </button>
      )}
      {!showRoad ? null : (
        <ul className="snow__road">
          {cams.road.map((x) => (
            <li key={x.cam.id}>
              <a href={x.cam.url} target="_blank" rel="noopener noreferrer" data-embed={String(x.cam.embed)}>
                {x.cam.name} · {dist(x.km)} ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

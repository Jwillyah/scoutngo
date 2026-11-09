import { useEffect, useState } from 'react'
import { readPhotoMeta, type PhotoMeta } from '../lib/compare/photoMeta.ts'
import { OUTCOME_LABEL, readFireLog, type FireEntry, type FireOutcome } from '../lib/fireLog.ts'
import { saveText } from '../lib/saveText.ts'
import { entryFromPhoto, hitRate, readTruthLog, truthFile, withEntries, writeTruthLog, type PhotoFill, type TruthEntry } from '../lib/truthLog.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { formatClock } from '../core/timezone.ts'
import { photoTiming, scoreSky, SCORE_WIDTH } from '../core/skyScore.ts'

/* The photo, read on the phone at 96 px wide for its sky, and a 48 px thumbnail if asked. Nothing else of it is kept. */
async function readSky(file: File, wantThumb: boolean): Promise<{ sky: TruthEntry['sky']; thumb: string | null }> {
  try {
    const bmp = await createImageBitmap(file)
    const h = Math.max(8, Math.round((SCORE_WIDTH * bmp.height) / bmp.width))
    const c = document.createElement('canvas')
    c.width = SCORE_WIDTH
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })
    if (g === null) return { sky: null, thumb: null }
    g.drawImage(bmp, 0, 0, SCORE_WIDTH, h)
    const s = scoreSky(g.getImageData(0, 0, SCORE_WIDTH, h).data, SCORE_WIDTH, h)
    let thumb: string | null = null
    if (wantThumb) {
      const t = document.createElement('canvas')
      t.width = 48
      t.height = Math.max(8, Math.round((48 * bmp.height) / bmp.width))
      t.getContext('2d')?.drawImage(bmp, 0, 0, t.width, t.height)
      thumb = t.toDataURL('image/jpeg', 0.6)
    }
    bmp.close()
    return { sky: { cloud: s.cloud, lit: s.lit, saturation: s.saturation, hue: s.hue, suggest: s.suggest }, thumb }
  } catch {
    return { sky: null, thumb: null }
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/*
 * AFTER THE SHOOT (src/lib/truthLog.ts): pick the photos, and each is read on
 * the phone and set against what the app said for that minute and place; one
 * tap for how it went; your hit rate from this phone's log. Export it as a
 * file, or delete it (with Undo). The photos never leave the phone, and only
 * their numbers are kept.
 */
interface Props {
  timeZone: string
  /** The venue: the place of a photo with none in it, once you say yes. */
  venue: LatLon
  placeName: string
  /** The map pin, for "Pick on map". */
  target: LatLon | null
  onPickTarget?: () => void
  /** A rating went into Sky fire's log: put it at the top of "Your log". */
  onLogged?: (e: FireEntry) => void
}

/* A photo held until it has a place and a time. */
interface Held {
  file: File
  meta: PhotoMeta
}

const dayMonth = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(d)
const localDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

const LIGHT: Record<string, string> = { backlit: 'backlit', 'front-lit': 'front-lit', 'side-lit': 'side-lit' }

export function TruthLoop({ timeZone, venue, placeName, target, onPickTarget, onLogged }: Props) {
  const [log, setLog] = useState<TruthEntry[]>(() => readTruthLog())
  const [batch, setBatch] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [undo, setUndo] = useState<TruthEntry[] | null>(null)
  const [wantThumb, setWantThumb] = useState(false)
  /* Photos with no place or no time, held while you answer (item 8). */
  const [held, setHeld] = useState<Held[]>([])
  const [place, setPlace] = useState<PhotoFill['place'] | null>(null)
  const [awaitPin, setAwaitPin] = useState<LatLon | null | 'none'>(null)
  const [day, setDay] = useState(() => localDay(new Date(), timeZone))

  const keep = (next: TruthEntry[]) => {
    setLog(next)
    if (!writeTruthLog(next)) setNote('Not kept: this phone’s storage is full.')
  }

  /* Read what can be read; hold the rest until it has a place and a time. */
  const read = async (items: Held[], fill: PhotoFill, skippedBefore: string[] = []) => {
    const fires = readFireLog()
    const added: TruthEntry[] = []
    const skipped = [...skippedBefore]
    const still: Held[] = []
    for (const h of items) {
      const e = entryFromPhoto(h.meta, timeZone, fires, h.file.name, fill)
      if ('missing' in e) {
        still.push(h)
        continue
      }
      /* The sky in the picture suggests the answer; the shooter can change it. */
      const { sky, thumb } = await readSky(h.file, wantThumb)
      const timing = photoTiming(e.said.minutesFromEvent, e.heading, e.said.sunAzimuth)
      added.push({ ...e, sky, thumb, timingNote: e.timeFrom === 'asked' ? null : timing.note, outcome: sky?.suggest ?? null })
    }
    if (added.length > 0) {
      keep(withEntries(log, added))
      setBatch(added.map((e) => e.id))
    }
    setHeld(still)
    setUndo(null)
    setNote(`${added.length} ${added.length === 1 ? 'photo' : 'photos'} read on this phone, none uploaded.${skipped.length === 0 ? '' : ` Left out: ${skipped.join('; ')}.`}${still.length === 0 ? '' : ` ${still.length} waiting for ${place === null && still.some((h) => h.meta.lat === null) ? 'a place' : 'a day'}.`}`)
  }

  const add = async (files: FileList | null) => {
    if (files === null || files.length === 0) return
    const items: Held[] = []
    const skipped: string[] = []
    for (const file of Array.from(files)) {
      try {
        items.push({ file, meta: readPhotoMeta(await file.arrayBuffer()) })
      } catch {
        skipped.push(`${file.name}: could not be read`)
      }
    }
    setPlace(null)
    await read(items, {}, skipped)
  }

  /* "Pick on map": the next pin placed is the photos' place. */
  useEffect(() => {
    if (awaitPin === null || target === null) return
    if (awaitPin !== 'none' && target.lat === awaitPin.lat && target.lon === awaitPin.lon) return
    const fill = { at: target, from: 'map' as const }
    setAwaitPin(null)
    setPlace(fill)
    void read(held, { place: fill })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, awaitPin])

  const needPlace = held.some((h) => h.meta.lat === null || h.meta.lon === null) && place === null
  const needDay = !needPlace && held.length > 0

  const rate = (o: FireOutcome) => {
    const rated = log.filter((e) => batch.includes(e.id))
    keep(log.map((e) => (batch.includes(e.id) ? { ...e, outcome: o } : e)))
    /* Into Sky fire's log too, once per event: "Logged: 2 Nov sunrise · It fired". */
    const said: string[] = []
    const seen = new Set<string>()
    for (const e of rated) {
      const ev = new Date(new Date(e.at).getTime() - e.said.minutesFromEvent * 60_000)
      const date = localDay(ev, timeZone)
      const where = distanceMeters({ lat: e.lat, lon: e.lon }, venue) <= 5000 ? placeName : `${e.lat.toFixed(2)}, ${e.lon.toFixed(2)}`
      const key = `${date}|${e.said.event}|${where}`
      if (seen.has(key)) continue
      seen.add(key)
      onLogged?.({ id: `${date}-${e.said.event}-${where}`, date, event: e.said.event, place: where, outcome: o, forecast: e.said.fire, photo: null })
      said.push(`${dayMonth(ev, timeZone)} ${e.said.event}`)
    }
    setNote(said.length === 0 ? `Kept: ${OUTCOME_LABEL[o]}.` : `Logged: ${said.join(', ')} · ${OUTCOME_LABEL[o]}`)
  }

  const r = hitRate(log)
  const shown = log.filter((e) => batch.includes(e.id)).slice(0, 4)

  return (
    <section className="truth" aria-label="After the shoot">
      <p className="fire__head">After the shoot</p>
      <label className="btn btn--small truth__pick">
        Pick photos
        <input type="file" accept="image/*" multiple className="truth__file" onChange={(e) => void add(e.target.files)} />
      </label>
      <label className="truth__keep">
        <input type="checkbox" checked={wantThumb} onChange={(e) => setWantThumb(e.target.checked)} /> Keep a tiny thumbnail (48 px) with the numbers
      </label>
      {!needPlace ? null : (
        <div className="truth__ask" role="group" aria-label="Where it was taken">
          <p className="fire__note">
            {held.length === 1 ? held[0].file.name : `${held.length} photos`} {held.length === 1 ? 'has' : 'have'} no place in {held.length === 1 ? 'it' : 'them'}. Taken at {placeName}?
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                const fill = { at: venue, from: 'venue' as const }
                setPlace(fill)
                void read(held, { place: fill })
              }}
            >
              Yes
            </button>
            {onPickTarget === undefined ? null : (
              <button
                type="button"
                className={`btn btn--small${awaitPin === null ? '' : ' btn--on'}`}
                aria-pressed={awaitPin !== null}
                onClick={() => {
                  setAwaitPin(target ?? 'none')
                  onPickTarget()
                }}
              >
                Pick on map
              </button>
            )}
          </div>
          {awaitPin === null ? null : <p className="fire__note">Tap the map where it was taken.</p>}
        </div>
      )}
      {!needDay ? null : (
        <div className="truth__ask" role="group" aria-label="Which sunrise or sunset">
          <p className="fire__note">
            No time in {held.length === 1 ? held[0].file.name : `${held.length} photos`}: the sunrise or sunset of which day?
          </p>
          <div className="btn-row">
            <input type="date" className="truth__day" value={day} max={localDay(new Date(), timeZone)} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
            {(['sunrise', 'sunset'] as const).map((ev) => (
              <button key={ev} type="button" className="btn btn--small" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(day)} onClick={() => void read(held, { place: place ?? undefined, day: { date: day, event: ev } })}>
                {ev === 'sunrise' ? 'Sunrise' : 'Sunset'}
              </button>
            ))}
          </div>
        </div>
      )}
      {shown.length === 0 ? null : (
        <>
          <ul className="truth__list">
            {shown.map((e) => (
              <li key={e.id}>
                {e.timeFrom === 'asked' ? `${dayMonth(new Date(e.at), timeZone)} ${e.said.event}` : formatClock(new Date(e.at), timeZone)}
                {e.placeFrom === 'venue' ? ` at ${placeName}` : e.placeFrom === 'map' ? ' at the pin' : ''}
                {e.timeFrom === 'asked' ? ' (no time in the file)' : ` · ${e.said.minutesFromEvent >= 0 ? `${e.said.minutesFromEvent} min after` : `${-e.said.minutesFromEvent} min before`} ${e.said.event} · sun ${Math.round(e.said.sunAltitude)}° up`}
                {e.said.light === null ? '' : `, ${LIGHT[e.said.light]}`}
                {e.said.golden ? ', golden hour' : ''}
                {e.said.fire === null ? ` · no ${e.said.event} color forecast shown` : ` · it said ${e.said.fire}`}
                {e.thumb ? <img src={e.thumb} alt="" className="truth__thumb" /> : null}
                {e.sky ? (
                  <span className="truth__sky">
                    {' '}· its sky: cloud {pct(e.sky.cloud)}, lit {pct(e.sky.lit)} · suggests <b>{OUTCOME_LABEL[e.sky.suggest]}</b>
                    {e.outcome !== null && e.outcome !== e.sky.suggest ? ` (you said ${OUTCOME_LABEL[e.outcome]})` : ''}
                  </span>
                ) : null}
                {e.timingNote ? <span className="truth__note"> · {e.timingNote}</span> : null}
              </li>
            ))}
          </ul>
          <div className="btn-row" role="group" aria-label="How it went">
            {(['fired', 'meh', 'nothing', 'clear'] as const).map((o) => (
              <button key={o} type="button" className={`btn btn--small${shown.length > 0 && shown.every((e) => e.outcome === o) ? ' btn--on' : ''}`} aria-pressed={shown.length > 0 && shown.every((e) => e.outcome === o)} onClick={() => rate(o)}>
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
        </>
      )}
      {note === null ? null : <p className="fire__note fire__kept" role="status">{note}</p>}

      <p className="fire__head">Your hit rate</p>
      <p className="fire__note">
        {r.shoots === 0
          ? 'No shoots logged yet. Pick the photos after a sunrise or sunset to start.'
          : `${r.shoots} ${r.shoots === 1 ? 'shoot' : 'shoots'} logged. ${r.firesaid === 0 ? 'Sky color was not shown for any of them.' : `When Sky color said possible or likely it fired ${r.firedWhenSaid} of ${r.firesaid} times.`}${r.unlikelySaid === 0 ? '' : ` When it said unlikely it fired ${r.firedWhenUnlikely} of ${r.unlikelySaid}.`} ${r.golden} of ${r.photos} photos in golden hour.`}
      </p>
      {log.length === 0 && undo === null ? null : (
        <div className="btn-row">
          {log.length === 0 ? null : (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => saveText(truthFile(log), 'application/json', 'scoutngo-truth-log.json')}>
              Export
            </button>
          )}
          {undo !== null ? (
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                keep(undo)
                setUndo(null)
                setNote('Log restored.')
              }}
            >
              Undo delete
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--small btn--quiet"
              onClick={() => {
                setUndo(log)
                keep([])
                setBatch([])
                setNote('Log deleted from this phone.')
              }}
            >
              Delete log
            </button>
          )}
        </div>
      )}
    </section>
  )
}

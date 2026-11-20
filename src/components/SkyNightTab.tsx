import type { MoonMoment, MoonNightTab } from '../core/moonNights.ts'
import { MoonDrawing } from './MoonDrawing.tsx'

/*
 * SKY › NIGHT'S PICTURES (Batch SIMPLE-2, Section 4; mockup Sky_Night):
 * tonight's moon drawn, the next 14 nights with FULL and NEW marked, and the
 * moment cards with "Plan ›". Every number is src/core/moonNights.ts's (held
 * to USNO in tests/moonFixture.test.ts); this file draws. The hero and the
 * rows are the page's (src/components/SkyPage.tsx).
 */
const day = (date: string) => Number(date.slice(8, 10))
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekday = (date: string) => WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()]

export function SkyNightMoon({ night }: { night: MoonNightTab }) {
  return (
    <div className="snight__moon" aria-hidden="true">
      <MoonDrawing lit={night.tonight.lit} waxing={night.tonight.waxing} size={96} strong />
    </div>
  )
}

export function SkyNightStrip({ night }: { night: MoonNightTab }) {
  return (
    <section className="tipage__card snight__strip" aria-label="The next two weeks">
      <p className="snight__label">Next 2 weeks</p>
      <ol className="snight__days">
        {night.strip.map((n, i) => (
          <li key={n.date} className={`snight__day${n.mark === null ? '' : ` snight__day--${n.mark}`}`} data-mark={n.mark ?? undefined}>
            <MoonDrawing lit={n.lit} waxing={n.waxing} size={22} />
            <span className="snight__num">{i === 0 ? weekday(n.date) : day(n.date)}</span>
            <span className="snight__mark">{n.mark === 'full' ? 'FULL' : n.mark === 'new' ? 'NEW' : ''}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

interface MomentWords {
  eyebrow: string
  title: string
  line: string
  at: Date
}

/** A moment in words: "BIG MOONRISE · TUE 24", "Moonrise 4:38 PM ENE", "11 min before sunset · 100% lit". */
function momentWords(m: MoonMoment, clock: (d: Date) => string): MomentWords {
  const when = `${weekday(m.date).toUpperCase()} ${day(m.date)}`
  const lit = `${Math.round(m.lit * 100)}% lit`
  if (m.kind === 'big-moonrise') {
    const lead = m.minutesBeforeSunset
    const rel = lead === 0 ? 'at sunset' : lead > 0 ? `${lead} min before sunset` : `${-lead} min after sunset`
    return { eyebrow: `Big moonrise · ${when}`, title: `Moonrise ${clock(m.moonrise.at)} ${m.moonrise.compass}`, line: `${rel} · ${lit}`, at: m.moonrise.at }
  }
  const after = m.minutesAfterSunrise
  const rel = after === 0 ? 'at sunrise' : after > 0 ? `${after} min after sunrise` : `${-after} min before sunrise`
  return { eyebrow: `Moonset at sunrise · ${when}`, title: `Moonset ${clock(m.moonset.at)} ${m.moonset.compass}`, line: `${rel} (${clock(m.sunrise)}) · ${lit}`, at: m.moonset.at }
}

/** At most this many moment cards: the soonest. */
const MOMENTS_SHOWN = 2

export function SkyNightMoments({ night, clock, onPlan }: { night: MoonNightTab; clock: (d: Date) => string; onPlan?: (at: Date) => void }) {
  const shown = night.moments.slice(0, MOMENTS_SHOWN)
  if (shown.length === 0) return null
  return (
    <section className="tipage__card snight__moments" aria-label="Moon moments">
      {shown.map((m) => {
        const w = momentWords(m, clock)
        return (
          <div key={`${m.kind}${m.date}`} className="snight__moment" data-moment={m.kind}>
            <div className="snight__mtext">
              <p className="snight__meyebrow">{w.eyebrow}</p>
              <p className="snight__mtitle">{w.title}</p>
              <p className="snight__mline">{w.line}</p>
            </div>
            {onPlan === undefined ? null : (
              <button type="button" className="snight__plan" onClick={() => onPlan(w.at)}>
                Plan ›
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

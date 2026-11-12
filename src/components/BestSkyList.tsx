import { BETTER_FROM_KM, distanceWords, type RadiusMi, type RankedSpot } from '../core/bestSky.ts'
import { bestSkyIcs, bestSkyIcsFilename, remindAt } from '../core/bestSkyIcs.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { formatClock } from '../core/timezone.ts'
import { saveText } from '../lib/saveText.ts'
import '../styles/bestsky-list.css'
import type { BestSky, BestSkyEvent } from '../lib/useBestSky.ts'
import { clockSpan, gridSummary, radiusWords } from '../core/bestSkyWords.ts'
import { RadiusChips, WordPill } from './bestSkyBits.tsx'

/*
 * PAGE 2 · THE LIST (Batch BEST SKY, Section 4; board BestSky_Card). "Best
 * 6 mi NW", what the grid says in a line, three ranked spots (name ·
 * distance · facing · why), where you are, and the two buttons: the map at
 * the spot and the colour's time; a reminder file made on the phone.
 */
export function BestSkyList({ venue, placeName, radius, sky, top, miles, timeZone, now, chosen, onPick, onRadius, onShowOnMap }: { venue: LatLon; now: Date; placeName: string; radius: RadiusMi; sky: BestSky; top: RankedSpot[]; miles: boolean; timeZone: string; chosen: RankedSpot | null; onPick: (id: string) => void; onRadius: (r: RadiusMi) => void; onShowOnMap: (at: LatLon, when: Date) => void }) {
  const ev = sky.event
  const best = top[0] ?? null
  return (
    <section className="bsky__page" aria-label="List">
      <p className="bsky__event">{ev === null ? '' : `${ev.kind === 'sunset' ? 'Sunset' : 'Sunrise'} ${formatClock(ev.at, timeZone)} · color ${clockSpan(ev.colorFrom, ev.colorTo, timeZone)}`}</p>
      <p className="bsky__big" data-bsky-best>
        {best === null ? (sky.status === 'loading' ? '…' : 'Little anywhere') : distanceMeters(venue, best.spot.at) / 1000 < BETTER_FROM_KM ? 'Best right here' : `Best ${distanceWords(venue, best.spot.at, miles)}`}
      </p>
      <p className="bsky__sum">{gridSummary(sky.ranked)}</p>
      <RadiusChips radius={radius} miles={miles} onRadius={onRadius} />
      <div className="bsky__list">
        <p className="bsky__label">Best within {radiusWords(radius, miles)}</p>
        <ol className="bsky__rows">
          {top.map((r, i) => (
            <li key={r.spot.id}>
              <button type="button" className="bsky__row" data-bsky-rank={i + 1} onClick={() => onPick(r.spot.id)}>
                <span className={`bsky__n${i === 0 ? ' bsky__n--first' : ''}`}>{i + 1}</span>
                <span className="bsky__rtext">
                  <span className="bsky__rname">{r.spot.name}</span>
                  <span className="bsky__rline">
                    {distanceWords(venue, r.spot.at, miles)} · {r.view} · {r.why[0]}
                  </span>
                </span>
                <WordPill word={r.word} />
              </button>
            </li>
          ))}
          <li>
            <div className="bsky__row bsky__row--here">
              <span className="bsky__n bsky__n--here" aria-hidden="true" />
              <span className="bsky__rtext">
                <span className="bsky__rname">Where you are · {placeName}</span>
                <span className="bsky__rline">{sky.here === null ? '—' : sky.here.why.join(' · ')}</span>
              </span>
              {sky.here === null ? null : <WordPill word={sky.here.word} />}
            </div>
          </li>
        </ol>
      </div>
      <BestSkyActions sky={sky} chosen={chosen} timeZone={timeZone} now={now} onShowOnMap={onShowOnMap} />
    </section>
  )
}

/** "Show on map" and "Remind me 4:30", under the list and the spot. */
export function BestSkyActions({ sky, chosen, timeZone, now, onShowOnMap }: { sky: BestSky; chosen: RankedSpot | null; timeZone: string; now: Date; onShowOnMap: (at: LatLon, when: Date) => void }) {
  const ev = sky.event
  const ready = chosen !== null && ev !== null
  return (
    <div className="bsky__actions">
      <button type="button" className="bsky__btn bsky__btn--main" disabled={!ready} onClick={() => ready && onShowOnMap(chosen.spot.at, ev.peak)}>
        Show on map
      </button>
      {!ready || remindAt(ev.setUp).getTime() <= now.getTime() ? null : (
        <button type="button" className="bsky__btn bsky__btn--glass" data-bsky-remind onClick={() => remind(ev, chosen)}>
          Remind me {formatClock(remindAt(ev.setUp), timeZone)}
        </button>
      )}
    </div>
  )
}

function remind(ev: BestSkyEvent, r: RankedSpot): void {
  const input = { kind: ev.kind, spotName: r.spot.name, word: r.word, setUp: ev.setUp, colorFrom: ev.colorFrom, colorTo: ev.colorTo, stamp: new Date() }
  saveText(bestSkyIcs(input), 'text/calendar;charset=utf-8', bestSkyIcsFilename(input))
}

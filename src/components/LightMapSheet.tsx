import { formatClock } from '../core/timezone.ts'
import { GOLDEN_MIN, type LightMap, type LightPreset } from '../lib/lightmap/lightMapFor.ts'

/*
 * THE LIGHT MAP: where the sun reaches the ground around the venue, metre by
 * metre, for one question at a time, drawn on the map (src/lib/lightmap/).
 *
 * Beginner first: the map is the picture; one sentence says what the colour
 * means; the legend is a little row of suns from none to all of the time;
 * then the window and how it was worked out.
 */
export type LightMapState = LightMap | { loading: number } | 'no-scan' | 'no-window'

interface LightMapSheetProps {
  state: LightMapState
  preset: LightPreset
  onPreset: (p: LightPreset) => void
  timeZone: string
  scanYear: number | null
  /** A morning shoot: golden is the first minutes after sunrise (lightMapFor.ts presetWindow). */
  morning: boolean
  onClose: () => void
  /** The 3D scan's download, offered right here when there is none (ScanOffer.tsx). */
  scanOffer: React.ReactNode
}

const PRESETS: [LightPreset, string][] = [
  ['golden', 'Where golden light lands'],
  ['shade', 'Shade all afternoon'],
  ['even', 'Even light'],
]

const LEAD: Record<LightPreset, string> = {
  golden: `The brighter the gold, the more of the last ${GOLDEN_MIN} minutes before sunset that spot is in the sun.`,
  /* Replaced for a morning shoot, below. */
  shade: 'Blue is ground the sun does not reach from noon to sunset, or barely: under a tenth of the time.',
  even: 'Gold stays in the sun the whole shoot window, blue stays in shade; unmarked ground changes from one to the other.',
}

function Sun({ fill }: { fill: number }) {
  /* A little sun, its fill the share of the time in the sun. */
  return (
    <svg viewBox="0 0 20 20" className="lmap__sun" aria-hidden="true">
      <circle cx="10" cy="10" r="5" className="lmap__sunring" />
      <circle cx="10" cy="10" r="5" className="lmap__sunfill" style={{ opacity: fill }} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1={10 + 7 * Math.cos((a * Math.PI) / 180)} y1={10 + 7 * Math.sin((a * Math.PI) / 180)} x2={10 + 9 * Math.cos((a * Math.PI) / 180)} y2={10 + 9 * Math.sin((a * Math.PI) / 180)} className="lmap__sunray" style={{ opacity: fill }} />
      ))}
    </svg>
  )
}

const MORNING_LEAD = `The brighter the gold, the more of the first ${GOLDEN_MIN} minutes after sunrise that spot is in the sun.`

export function LightMapSheet({ state, preset, onPreset, timeZone, scanYear, morning, onClose, scanOffer }: LightMapSheetProps) {
  const map = typeof state === 'object' && 'minutes' in state ? state : null
  return (
    <section className="tides lmap" aria-label="Light map">
      <div className="tides__head">
        <p className="tides__title">Light map</p>
        <button type="button" className="card2__x" onClick={onClose} aria-label="Back to the shoot">
          ×
        </button>
      </div>
      <div className="lmap__presets" role="group" aria-label="What to show">
        {PRESETS.map(([k, label]) => (
          <button key={k} type="button" className={`seg__btn${preset === k ? ' seg__btn--on' : ''}`} aria-pressed={preset === k} onClick={() => onPreset(k)}>
            {label}
          </button>
        ))}
      </div>
      {state === 'no-scan' ? (
        scanOffer
      ) : state === 'no-window' ? (
        <p className="pf__prompt">{preset === 'even' ? 'Set a shoot window in Setup to see where the light holds through it.' : 'The sun does not set here that day.'}</p>
      ) : map === null ? (
        <p className="pf__prompt num">Working it out on this phone… {Math.round(Math.min(1, (state as { loading: number }).loading) * 100)}%</p>
      ) : (
        <>
          <p className="skyl__lead">{preset === 'golden' && morning ? MORNING_LEAD : LEAD[preset]}</p>
          {preset === 'golden' ? (
            <div className="lmap__legend" aria-label="Legend: time in the sun">
              <span className="pf__small">none</span>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <Sun key={f} fill={f} />
              ))}
              <span className="pf__small">all {GOLDEN_MIN} min</span>
            </div>
          ) : null}
          {preset === 'shade' ? null : (
            <p className="pf__small lmap__walls">
              <span className="lmap__wallkey" aria-hidden="true" /> Bright edge: a wall in the sun, on the side facing it.
            </p>
          )}
          <p className="pf__small num">
            {formatClock(map.from, timeZone)} to {formatClock(map.to, timeZone)}, the sun every 5 min, each metre of ground 300 m around the venue. From the {scanYear ?? 'public'} lidar scan: roofs and trees as
            measured then, anything built or grown since is not in it.
            {map.edgeM < 150 ? ' Near the edge of the map, what stands beyond the scan is not known and casts no shadow here.' : ''}
          </p>
        </>
      )}
    </section>
  )
}

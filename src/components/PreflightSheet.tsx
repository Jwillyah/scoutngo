import { FLIGHT_CARD_CLOSE, toGpx, toKml } from '../core/flight.ts'
import { MOVE_LABEL, POINTS_NEEDED, type MoveKind, type Preflight } from '../lib/preflight/usePreflight.ts'
import type { Look } from '../three/cinema.ts'

/*
 * PREFLIGHT: DRAW A MOVE, READ ITS CARD, PLAY IT IN 3D.
 *
 * The move is drawn on the map (taps add its points), flown at a steady
 * speed no higher than the lower of the grid ceiling and your approved
 * ceiling, and played in the 3D view through the camera's own field of view
 * at the time on the bar. The card is arithmetic (src/core/flight.ts), each
 * number worked out two ways. It never says a flight is safe, legal or clear;
 * it always ends by sending you to LAANC, the TFRs and the site.
 *
 * Exports go to the phone's share sheet only: GPX and KML. Importing into
 * DJI Fly is not offered: it has no import, and the known workaround
 * (replacing a mission file DJI Fly made) was not tested here.
 */
interface PreflightSheetProps {
  pf: Preflight
  /** Whether the map's next tap adds a point. */
  picking: boolean
  onPick: (next: boolean) => void
  onPlay: () => void
  /** Fly it yourself in the 3D view, the sticks on screen; recorded when asked. */
  onFly: (record: boolean) => void
  onRecord: () => void
  recordNote: string | null
  /** How far a recording's frame-by-frame render has got, 0 to 1, or null when none is running. */
  renderShare: number | null
  /** The preview's look: Real (the imagery as it is) or Animated (painted). */
  look: Look
  onLook: (look: Look) => void
  /** The recorded preview, to hand to the share sheet. */
  clip: Blob | null
  /** Where the pilot stands: the plan's own pilot position. */
  onPlacePilot: () => void
  pilotSet: boolean
  onClose: () => void
}

/* Real: the imagery as it is. Animated: soft painted colours, often easier to read than blurry imagery when low and close. */
const LOOKS: [Look, string][] = [
  ['real', 'Real'],
  ['animated', 'Animated'],
]

const KINDS: MoveKind[] = ['orbit', 'push-in', 'pull-back', 'rise', 'fly-along', 'waypoints']

const PROMPT: Record<MoveKind, string> = {
  orbit: 'Circles the venue. Set the radius below.',
  'push-in': 'Tap where the move starts: it flies toward the venue.',
  'pull-back': 'Tap where the move starts: it flies away from the venue.',
  rise: 'Tap where it rises from.',
  'fly-along': 'Tap the line to fly, point by point.',
  waypoints: 'Tap each waypoint in order.',
}

async function share(name: string, text: string | Blob, type: string): Promise<string | null> {
  const file = new File([text], name, { type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (typeof nav.share !== 'function' || (nav.canShare !== undefined && !nav.canShare({ files: [file] }))) return 'This browser cannot hand files to the share sheet.'
  try {
    await nav.share({ files: [file], title: name })
    return null
  } catch {
    return null
  }
}

export function PreflightSheet({ pf, picking, onPick, onPlay, onFly, onRecord, recordNote, renderShare, look, onLook, clip, onPlacePilot, pilotSet, onClose }: PreflightSheetProps) {
  const card = pf.card
  const need = POINTS_NEEDED[pf.kind]
  return (
    <section className="pf" aria-label="Preflight">
      <div className="tides__head">
        <p className="tides__title">Preflight</p>
        <button type="button" className="card2__x" onClick={onClose} aria-label="Back to the shoot">
          ×
        </button>
      </div>

      <div className="pf__kinds" role="group" aria-label="The move">
        {KINDS.map((k) => (
          <button key={k} type="button" className={`seg__btn${pf.kind === k ? ' seg__btn--on' : ''}`} aria-pressed={pf.kind === k} onClick={() => pf.setKind(k)}>
            {MOVE_LABEL[k]}
          </button>
        ))}
      </div>

      <p className="pf__prompt">
        {PROMPT[pf.kind]}
        {need === 0 ? null : (
          <>
            {' '}
            <button type="button" className="clay__link" onClick={() => onPick(!picking)}>
              {picking ? 'Done tapping' : pf.points.length === 0 ? 'Tap the map' : `${pf.points.length} point${pf.points.length === 1 ? '' : 's'}: add more`}
            </button>
            {pf.points.length === 0 ? null : (
              <button type="button" className="clay__link" onClick={pf.clearPoints}>
                {' '}· Start again
              </button>
            )}
          </>
        )}
      </p>

      <div className="pf__controls">
        <label className="pf__ctl num">
          Height {pf.heightFt} ft{pf.heightFt > pf.capFt ? ` (held at ${pf.capFt})` : ''}
          <input type="range" min={20} max={Math.max(pf.capFt, 400)} step={10} value={pf.heightFt} onChange={(e) => pf.setHeightFt(Number(e.target.value))} />
        </label>
        <label className="pf__ctl num">
          Speed {pf.speedMps} m/s
          <input type="range" min={1} max={15} step={1} value={pf.speedMps} onChange={(e) => pf.setSpeedMps(Number(e.target.value))} />
        </label>
        {pf.kind !== 'orbit' ? null : (
          <label className="pf__ctl num">
            Radius {pf.radiusM} m
            <input type="range" min={20} max={300} step={5} value={pf.radiusM} onChange={(e) => pf.setRadiusM(Number(e.target.value))} />
          </label>
        )}
        <div className="seg" role="group" aria-label="Camera">
          {([24, 70] as const).map((f) => (
            <button key={f} type="button" className={`seg__btn${pf.focal === f ? ' seg__btn--on' : ''}`} aria-pressed={pf.focal === f} onClick={() => pf.setFocal(f)}>
              {f} mm
            </button>
          ))}
        </div>
        <label className="pf__ctl num">
          Your approved ceiling {pf.approvedFt} ft{pf.gridFt === null ? ' · no grid ceiling here' : ` · grid ${pf.gridFt} ft`}
          <input type="range" min={0} max={400} step={50} value={pf.approvedFt} onChange={(e) => pf.setApprovedFt(Number(e.target.value))} />
        </label>
        <label className="pf__ctl num">
          Flight time {pf.flightMinutes} min (Air 3S spec 45)
          <input type="range" min={10} max={50} step={1} value={pf.flightMinutes} onChange={(e) => pf.setFlightMinutes(Number(e.target.value))} />
        </label>
        <button type="button" className="clay__link" onClick={onPlacePilot}>
          {pilotSet ? 'Move where you stand' : 'Tap where you will stand (else the venue pin)'}
        </button>
      </div>

      <p className="pf__prompt">
        {pf.flown !== null ? 'This is the flight you flew by hand; pick a move to draw instead. ' : ''}
        <button type="button" className="btn btn--small" onClick={() => onFly(false)}>
          Fly it yourself
        </button>{' '}
        <button type="button" className="clay__link" onClick={() => onFly(true)}>
          Fly and record
        </button>
      </p>

      {card === null ? (
        <p className="pf__prompt">{need === 0 ? 'Set a venue to draw the move.' : 'Tap the map to draw the move.'}</p>
      ) : (
        <div className="pf__card">
          {card.lines.slice(0, -1).map((l) => (
            <p key={l} className="pf__line">
              {l}
            </p>
          ))}
          <p className="pf__small num">
            Checked two ways: length {Math.round(card.lengthCheckM)} m by the move's own shape; hidden {Math.round(card.hiddenCheckS)} s by the horizon method
            {card.clearance?.checkMetres == null ? '' : `; clearance ${Math.round(card.clearance.checkMetres / 0.3048)} ft over the map's boxes`}.
            {pf.heightsSource.kind === 'map' ? ' No 3D scan here: ground taken as flat, buildings as boxes of their known heights.' : ''}
          </p>
          <p className="pf__close">{FLIGHT_CARD_CLOSE}</p>
          <div className="seg" role="group" aria-label="Look">
            {LOOKS.map(([k, label]) => (
              <button key={k} type="button" className={`seg__btn${look === k ? ' seg__btn--on' : ''}`} aria-pressed={look === k} onClick={() => onLook(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="pf__actions">
            <button type="button" className="btn btn--small" onClick={onPlay}>
              Play in 3D
            </button>
            <button type="button" className="btn btn--small" onClick={onRecord} disabled={renderShare !== null}>
              {renderShare === null ? 'Record the preview' : `Rendering ${Math.round(renderShare * 100)}%`}
            </button>
            <button type="button" className="clay__link" onClick={() => void share('scoutngo-move.gpx', toGpx(MOVE_LABEL[pf.kind], pf.path, 0, new Date()), 'application/gpx+xml')}>
              GPX
            </button>
            <button type="button" className="clay__link" onClick={() => void share('scoutngo-move.kml', toKml(MOVE_LABEL[pf.kind], pf.path), 'application/vnd.google-earth.kml+xml')}>
              KML
            </button>
          </div>
          {recordNote === null ? null : <p className="pf__small">{recordNote}</p>}
          {clip === null ? null : (
            <button type="button" className="btn btn--small" onClick={() => void share(clip.type.includes('mp4') ? 'scoutngo-preview.mp4' : 'scoutngo-preview.webm', clip, clip.type)}>
              Share the video
            </button>
          )}
        </div>
      )}
    </section>
  )
}

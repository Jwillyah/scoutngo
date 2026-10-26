import { useId, useMemo, useState, type CSSProperties } from 'react'
import { METER_RIGHT_STOPS } from '../core/exposure.ts'
import { effectiveSensor, type KitProfile } from '../core/kit.ts'
import {
  APERTURE_STOPS,
  DISTANCE_RANGE,
  ISO_STOPS,
  LIGHTS,
  PHOTO,
  PRESETS,
  REFERENCE,
  SCENE,
  SHUTTER_STOPS,
  playgroundFrame,
  shutterWords,
  surferBox,
  type Light,
  type Settings,
} from '../core/playground.ts'
import { shippedTile, type IconId } from '../lib/iconPalette.ts'
import type { KitSelection } from '../lib/kitSelection.ts'

/*
 * THE EXPOSURE PLAYGROUND, at Sky › Exposure and from Kit.
 *
 * FOR BEGINNERS FIRST. Three sliders in plain words, with the camera's own
 * term small underneath. The photograph answers each one live: brighter or
 * darker, the surfer smearing sideways, the crowd going soft, the grain
 * coming up. Every one of those is a number from src/core (playground.ts and
 * exposure.ts); this file only draws it.
 *
 * ONE SVG, IN THE PHOTO'S OWN PIXELS. The viewBox is the original frame, so a
 * blur the maths gives in frame pixels is drawn in frame pixels and scales
 * with the picture on any screen.
 *
 * ON THE PHONE ONLY. Two local pictures and arithmetic; nothing is sent.
 * The faces in the crowd were blurred in the file before it shipped, so no
 * setting here can bring one back.
 */
interface ExposurePlaygroundProps {
  kit: KitProfile
  bag: KitSelection
}

const PRESET_TILES: Record<string, IconId> = { freeze: 'about', golden: 'plan', spray: 'sunmoon', night: 'callsheet' }

/* The slider's position for a value: the nearest stop. */
const nearest = (stops: readonly number[], value: number) =>
  stops.reduce((best, s, i) => (Math.abs(Math.log(s / value)) < Math.abs(Math.log(stops[best] / value)) ? i : best), 0)

export function ExposurePlayground({ kit, bag }: ExposurePlaygroundProps) {
  const uid = useId().replace(/:/g, '')
  const bodies = kit.bodies.filter((b) => bag.bodyIds.includes(b.id) && b.role !== 'drone')
  const lenses = kit.lenses.filter((l) => bag.lensIds.includes(l.id))
  /* The photo's own camera when it is in the bag, else the first; the longest lens, which is what the photo was shot on. */
  const [bodyId, setBodyId] = useState(() => (bodies.find((b) => b.id === 'a7iv') ?? bodies[0])?.id ?? null)
  const [lensId, setLensId] = useState(() => [...lenses].sort((a, b) => b.maxFocalLength - a.maxFocalLength)[0]?.id ?? null)
  const body = bodies.find((b) => b.id === bodyId) ?? bodies[0] ?? null
  const lens = lenses.find((l) => l.id === lensId) ?? lenses[0] ?? null

  const focal = lens === null ? REFERENCE.focalMm : Math.min(lens.maxFocalLength, Math.max(lens.minFocalLength, REFERENCE.focalMm))
  const sensor = lens !== null && body !== null ? effectiveSensor(lens, body) : REFERENCE.sensor
  const widest = lens?.maxAperture ?? APERTURE_STOPS[0]
  const apertures = APERTURE_STOPS.filter((n) => n >= widest - 0.05)

  const [light, setLight] = useState<Light>('midday')
  const [distance, setDistance] = useState<number>(DISTANCE_RANGE.start)
  const [settings, setSettings] = useState<Settings>({ seconds: REFERENCE.seconds, aperture: REFERENCE.aperture, iso: REFERENCE.iso })
  const aperture = apertures.includes(settings.aperture as (typeof apertures)[number]) ? settings.aperture : apertures[nearest(apertures, settings.aperture)]
  const s = { ...settings, aperture }

  const frame = useMemo(() => playgroundFrame(s, focal, sensor, light, distance), [s.seconds, s.aperture, s.iso, focal, sensor, light, distance]) // eslint-disable-line react-hooks/exhaustive-deps
  const box = surferBox()
  const { width: W, height: H } = PHOTO.original

  /* Sharp on the left, soft on the right: the widest aperture is the softest background. */
  const apertureRow = [...apertures].reverse()
  const meterAt = Math.max(-3, Math.min(3, frame.stops))

  return (
    <div className="play">
      <p className="play__demo">A demo of how the settings change a photo. Not a measurement.</p>

      <figure className="play__photo">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The surfer photo at ${shutterWords(s.seconds)}, f/${s.aperture}, ISO ${s.iso}: ${frame.reading}`}>
          <defs>
            <filter id={`${uid}-bg`} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
              <feGaussianBlur stdDeviation={frame.backgroundSigmaPx} edgeMode="duplicate" />
            </filter>
            <filter id={`${uid}-motion`} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x={box.x - 400} y={box.y - 50} width={box.width + 800} height={box.height + 100}>
              <feGaussianBlur stdDeviation={`${frame.motionSigmaPx} 0`} />
            </filter>
            <filter id={`${uid}-look`} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x={0} y={0} width={W} height={H} colorInterpolationFilters="sRGB">
              <feComponentTransfer in="SourceGraphic" result="lit">
                <feFuncR type="linear" slope={frame.brightness} />
                <feFuncG type="linear" slope={frame.brightness} />
                <feFuncB type="linear" slope={frame.brightness} />
              </feComponentTransfer>
              <feTurbulence type="fractalNoise" baseFrequency={0.55} numOctaves={1} seed={7} result="noise" />
              <feColorMatrix in="noise" type="saturate" values="0" result="grey" />
              {/* lit + amp * (noise - 0.5): fractal noise here spreads about 0.12 either side, so amp = grain / 0.12. */}
              <feComposite in="lit" in2="grey" operator="arithmetic" k1={0} k2={1} k3={frame.grain / 0.12} k4={(-0.5 * frame.grain) / 0.12} />
            </filter>
          </defs>
          <g filter={`url(#${uid}-look)`}>
            <image href="/playground/background.jpg" width={W} height={H} filter={`url(#${uid}-bg)`} />
            <image href="/playground/surfer.webp" x={box.x} y={box.y} width={box.width} height={box.height} filter={`url(#${uid}-motion)`} />
          </g>
        </svg>
        <figcaption className="play__credit">Photo by Jwillyagaze. Faces in the crowd are blurred.</figcaption>
      </figure>

      <div className={`play__meter play__meter--${frame.reading.replace(' ', '-')}`} aria-label={`Light meter: ${frame.reading}`}>
        <div className="play__meterbar">
          <span className="play__meterright" style={{ left: `${50 - (METER_RIGHT_STOPS / 6) * 100}%`, width: `${(METER_RIGHT_STOPS / 3) * 100}%` }} />
          <span className="play__needle" style={{ left: `${50 + (meterAt / 6) * 100}%` }} />
        </div>
        <div className="play__meterwords">
          <span>Too dark</span>
          <span>Right</span>
          <span>Too bright</span>
        </div>
        <p className="play__reading num">
          {frame.reading === 'right' ? 'Right' : frame.reading === 'too dark' ? 'Too dark' : 'Too bright'}
          {frame.reading === 'right' ? '' : `, ${Math.abs(frame.stops).toFixed(1)} stops`}
        </p>
      </div>

      <div className="play__presets" role="group" aria-label="Presets">
        {PRESETS.map((p) => {
          const t = shippedTile(PRESET_TILES[p.id] ?? 'plan')
          return (
            <button
              key={p.id}
              type="button"
              className="play__preset"
              style={{ '--chip-light': t.light, '--chip-middle': t.middle, '--chip-dark': t.dark } as CSSProperties}
              onClick={() => {
                setLight(p.light)
                setSettings(p.settings)
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <Slider
        words="Freeze motion"
        other="Show motion"
        term={`Shutter speed · ${shutterWords(s.seconds)}`}
        stops={SHUTTER_STOPS}
        index={nearest(SHUTTER_STOPS, s.seconds)}
        onIndex={(i) => setSettings({ ...s, seconds: SHUTTER_STOPS[i] })}
      />
      <Slider
        words="Background sharp"
        other="Background soft"
        term={`Aperture · f/${s.aperture}`}
        stops={apertureRow}
        index={apertureRow.indexOf(s.aperture as (typeof apertureRow)[number])}
        onIndex={(i) => setSettings({ ...s, aperture: apertureRow[i] })}
      />
      <Slider
        words="Clean, dark"
        other="Grainy, bright"
        term={`ISO · ${s.iso}`}
        stops={ISO_STOPS}
        index={nearest(ISO_STOPS, s.iso)}
        onIndex={(i) => setSettings({ ...s, iso: ISO_STOPS[i] })}
      />

      <label className="play__slider">
        <span className="play__ends">
          <span>How far away is he</span>
        </span>
        <input
          type="range"
          min={DISTANCE_RANGE.min}
          max={DISTANCE_RANGE.max}
          step={1}
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          aria-valuetext={`${distance} m`}
        />
        <span className="play__term num">
          Distance · {distance} m
        </span>
      </label>

      <div className="play__light" role="group" aria-label="The light">
        {LIGHTS.map((l) => (
          <button key={l.id} type="button" className="seg__btn" aria-pressed={light === l.id} onClick={() => setLight(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="play__kit">
        <label className="field">
          <span className="field__label">Body</span>
          <select className="input" value={body?.id ?? ''} onChange={(e) => setBodyId(e.target.value)} disabled={bodies.length === 0}>
            {bodies.length === 0 ? <option value="">No body in the bag</option> : null}
            {bodies.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Lens</span>
          <select className="input" value={lens?.id ?? ''} onChange={(e) => setLensId(e.target.value)} disabled={lenses.length === 0}>
            {lenses.length === 0 ? <option value="">No lens in the bag</option> : null}
            {lenses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="play__note num">
        {focal}mm on this {sensor === 'fullFrame' ? 'full frame' : 'APS-C'} body, focused on him at {Math.round(frame.subjectMeters)} m. Assumed: the crowd{' '}
        {SCENE.backgroundBehindMeters} m behind him, him moving at {SCENE.subjectSpeedMps} m/s, and a {SCENE.boardMeters} m board for the scale of the streak. The distance
        changes only the blur behind him; the photo stays framed as shot. It cannot show the photo sharper or cleaner than it was taken (
        {shutterWords(REFERENCE.seconds)}, f/{REFERENCE.aperture}, ISO {REFERENCE.iso}).
      </p>
      <p className="play__note">Everything here runs on this phone. Nothing is uploaded.</p>
    </div>
  )
}

function Slider({
  words,
  other,
  term,
  stops,
  index,
  onIndex,
}: {
  words: string
  other: string
  term: string
  stops: readonly number[]
  index: number
  onIndex: (i: number) => void
}) {
  return (
    <label className="play__slider">
      <span className="play__ends">
        <span>{words}</span>
        <span aria-hidden="true">↔</span>
        <span>{other}</span>
      </span>
      <input type="range" min={0} max={stops.length - 1} step={1} value={Math.max(0, index)} onChange={(e) => onIndex(Number(e.target.value))} aria-valuetext={term} />
      <span className="play__term num">{term}</span>
    </label>
  )
}

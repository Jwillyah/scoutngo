import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { LAYER_BAND_M, type LayerRead, type ModelRead } from '../core/fireOutlook.ts'
import { EARTH_RADIUS_KM, PATH_KM, type ModelPath } from '../core/skyFire.ts'
import { geometricFromApparent, LAYER_WORD, lightHex, rayWalk, type Layer } from '../core/skyColour.ts'

/*
 * THE SIDE VIEW (Batch G, Section 4: less text, more picture). Looking
 * side-on along the sun's line: you at the left, the forecast's cloud layers
 * at their heights out to 400 km toward the sun, and THE RAY ITSELF, the one
 * the verdict walked (src/core/fireOutlook.ts): from the sun below the
 * horizon, grazing the Earth at its lowest and up under the lit edge of the
 * cloud, at the minute of the deepest glow. Past the 400 km the forecast was
 * asked for, the view goes on to where the ray grazes, marked "not asked". The lit edge is drawn in the
 * colour clock's colour for that minute. Heights on a square-root scale, so a
 * deck at 1 km stands clear of the ground and one at 8 km still fits.
 */
const W = 320
const H = 150
const GROUND = 116
const LEFT = 30
const ASKED_KM = PATH_KM[PATH_KM.length - 1]
const y = (m: number) => GROUND - Math.sqrt(Math.max(0, m) / 12000) * (GROUND - 10)

/** The minute the picture is drawn for: the lead layer's deepest glow, else its first glow, else its first light. */
function rayMinute(l: LayerRead): { at: Date; colour: string | null } | null {
  const at = l.times?.deepest ?? l.times?.glowFrom ?? l.times?.firstLit ?? null
  if (at === null) return null
  const light = l.strip?.minutes.find((m) => m.at.getTime() === at.getTime())?.light ?? null
  return { at, colour: light === null ? null : lightHex(light) }
}

export function FireSideView({ read, path, venue, kind, label }: { read: ModelRead; path: ModelPath; venue: LatLon; kind: 'sunrise' | 'sunset'; label?: string }) {
  const lead = read.layers.find((l) => l.fires) ?? read.layers.find((l) => l.canvas) ?? null
  const minute = lead === null ? null : rayMinute(lead)
  /* The ray, as the verdict walked it, from the lit edge toward the sun. */
  const ray =
    lead === null || minute === null || lead.reachKm === null
      ? []
      : rayWalk(geometricFromApparent(getPosition(minute.at, venue.lat, venue.lon).altitude) + ((lead.reachKm / EARTH_RADIUS_KM) * 180) / Math.PI, lead.heightM, 4000).map((s) => ({ km: (lead.reachKm as number) + s.km, z: s.z }))
  /* Down to its lowest point, where it grazes the Earth; from there it is drawn on to the sun, below your horizon. */
  const lowest = ray.reduce<number>((at, s, i) => (s.z < (ray[at]?.z ?? Infinity) ? i : at), 0)
  const down = ray.slice(0, lowest + 1)
  /* The distance shown: the 400 km asked, or out to where the ray grazes, whichever is further. */
  const span = Math.min(900, Math.max(ASKED_KM, (down.at(-1)?.km ?? 0) + 40))
  const x = (km: number) => LEFT + (Math.min(span, km) / span) * (W - LEFT - 22)
  const sun = { cx: W - 9, cy: GROUND + 14 }
  const rayPts = lead === null || lead.reachKm === null || down.length === 0 ? '' : [`${x(lead.reachKm)},${y(lead.heightM)}`, ...down.map((s) => `${x(s.km)},${y(s.z)}`), `${sun.cx},${sun.cy}`].join(' ')
  const layers: Layer[] = ['high', 'mid', 'low']
  /* Each sample stands for the stretch halfway to its neighbours, the first from you, the last to the 400 km asked. */
  const from = (i: number) => (i === 0 ? x(0) : x((PATH_KM[i - 1] + PATH_KM[i]) / 2))
  const to = (i: number) => (i === PATH_KM.length - 1 ? x(ASKED_KM) : x((PATH_KM[i] + PATH_KM[i + 1]) / 2))
  const ticks = [100, 200, 300, 400, 600, 800].filter((km) => km < span - 20)
  return (
    <svg className="fire__side" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? `Side view toward the ${kind}: the forecast's cloud at its heights, and the sun's ray under it${lead === null ? '' : ` to the ${LAYER_WORD[lead.layer]}`}`}>
      {layers.map((layer) => {
        const [lo, hi] = LAYER_BAND_M[layer]
        const top = y(hi)
        const h = y(lo) - top
        return (
          <g key={layer}>
            {PATH_KM.map((km, i) => {
              const c = path.samples[i]?.[layer] ?? null
              if (c === null || c < 5) return null
              return <rect key={km} x={from(i)} y={top + h * 0.3} width={Math.max(2, to(i) - from(i) - 1)} height={h * 0.4} rx={2} className={`fire__deck fire__deck--${layer}`} opacity={Math.min(0.9, 0.12 + c / 120)} />
            })}
            <text x={2} y={top + h / 2 + 3} className="fire__axis">
              {layer}
            </text>
          </g>
        )
      })}
      {span <= ASKED_KM + 1 ? null : (
        <>
          <rect x={x(ASKED_KM)} y={6} width={x(span) - x(ASKED_KM)} height={GROUND - 6} className="fire__unasked" />
          <text x={(x(ASKED_KM) + x(span)) / 2} y={14} className="fire__axis" textAnchor="middle">
            not asked
          </text>
        </>
      )}
      <line x1={0} x2={W} y1={GROUND} y2={GROUND} className="fire__ground" />
      {/* A layer that does not fire (hidden, or the light shut out) gets its ray drawn muted, and no lit edge. */}
      {rayPts === '' ? null : <polyline points={rayPts} className={`fire__ray${lead?.fires === true ? '' : ' fire__ray--off'}`} />}
      {/* The sun, below the horizon, toward the right. */}
      <circle cx={sun.cx} cy={sun.cy} r={6} className="fire__sun" />
      {lead === null || !lead.fires || lead.reachKm === null || minute === null ? null : (
        <circle cx={x(lead.reachKm)} cy={y(lead.heightM)} r={4.5} className="fire__lit" fill={minute.colour ?? undefined} />
      )}
      <circle cx={x(0)} cy={GROUND - 3} r={3} className="fire__you" />
      <text x={x(0)} y={GROUND + 13} className="fire__axis" textAnchor="middle">
        you
      </text>
      {ticks.map((km) => (
        <text key={km} x={x(km)} y={GROUND + 13} className="fire__axis num" textAnchor="middle">
          {km} km
        </text>
      ))}
      <text x={W - 18} y={H - 3} className="fire__axis" textAnchor="end">
        toward the sun →
      </text>
    </svg>
  )
}

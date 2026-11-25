import { useId } from 'react'
import { moonLitPath } from '../lib/moonGlyph.ts'
import { phaseFromLit } from '../lib/moonLit.ts'

/*
 * THE ONE MOON DRAWING (Batch SIMPLE-2, Section 1). The real phase, from how
 * much is lit and whether it is waxing or waning: waxing is lit on the RIGHT,
 * waning on the LEFT (the northern-hemisphere view). The geometry is
 * moonLitPath in src/lib/moonGlyph.ts, the path every small moon in the app
 * already draws (calendar, map pills, time bar); this only turns "72% lit,
 * waxing" into the phase that path takes, so a big moon and a small one can
 * never show different phases. Nothing is drawn as lit for a moon with no
 * fraction given.
 *
 * MOON-COLOURED (Batch SIMPLE-3, Section 2b.3: "a flat purple disc"). The lit
 * part is the moon's own warm cream (--moon-face), the dark part a faint
 * warm grey, and from MARIA_FROM px up a few soft seas (--moon-mare) at
 * their places on the near side as seen from the north, clipped to the lit
 * part: the phase cuts across them as it does on the sky.
 */

/** A drawing this big or bigger shows the seas; a strip's 22 px moon does not. */
const MARIA_FROM = 48

/** The near side's larger seas: centre and radius as shares of the disc's radius, x to the right (east limb on the left as seen), y down. */
const MARIA: readonly { name: string; x: number; y: number; r: number }[] = [
  { name: 'Imbrium', x: -0.3, y: -0.38, r: 0.27 },
  { name: 'Serenitatis', x: 0.16, y: -0.36, r: 0.17 },
  { name: 'Tranquillitatis', x: 0.34, y: -0.06, r: 0.2 },
  { name: 'Crisium', x: 0.68, y: -0.3, r: 0.11 },
  { name: 'Fecunditatis', x: 0.55, y: 0.18, r: 0.13 },
  { name: 'Nubium', x: -0.16, y: 0.36, r: 0.15 },
  { name: 'Procellarum', x: -0.6, y: 0.02, r: 0.28 },
]

export function MoonDrawing({ lit, waxing, size = 100, strong = false }: { lit: number; waxing: boolean; size?: number; strong?: boolean }) {
  const id = useId().replace(/:/g, '')
  const c = size / 2
  const r = c - 1
  const path = moonLitPath(phaseFromLit(lit, waxing), size)
  const seas = size >= MARIA_FROM
  return (
    <svg className={`calm mdraw${strong ? ' calm--strong' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" data-moon-face>
      {path === null || !seas ? null : (
        <defs>
          <clipPath id={`mlit${id}`}>
            <path d={path} />
          </clipPath>
        </defs>
      )}
      <circle cx={c} cy={c} r={r} className="mdraw__dark" />
      {path === null ? null : <path d={path} className="calm__lit mdraw__lit" />}
      {path === null || !seas ? null : (
        <g clipPath={`url(#mlit${id})`} data-maria={MARIA.length}>
          {MARIA.map((m) => (
            <circle key={m.name} cx={c + m.x * r} cy={c + m.y * r} r={m.r * r} className="mdraw__mare" />
          ))}
        </g>
      )}
    </svg>
  )
}

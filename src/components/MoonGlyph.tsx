import { moonLitPath } from '../lib/moonGlyph.ts'

/** The moon at its phase (src/lib/moonGlyph.ts), a little brighter on the day it is new or full. */
export function MoonGlyph({ phase, size = 12, strong = false }: { phase: number; size?: number; strong?: boolean }) {
  const c = size / 2
  const lit = moonLitPath(phase, size)
  return (
    <svg className={`calm${strong ? ' calm--strong' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={c - 1} className="calm__dark" />
      {lit === null ? null : <path d={lit} className="calm__lit" />}
    </svg>
  )
}

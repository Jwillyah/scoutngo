import type { SkyPictureOut } from '../core/skyPicture.ts'

/*
 * THE SKY PICTURE, DRAWN (Batch SIMPLE-2, Section 4; mockup Sky_Tonight).
 * Geometry from src/core/skyPicture.ts, colours from the tokens (sky.css):
 * a sky, the deck at its height (warm when the models light it), the gap
 * toward the sun under it, the sun on the horizon, the compass points along
 * the foot. SVG only: no photo, no generated image, ever.
 */
const W = 330
const H = 170
const FOOT = 22

export function SkyPicture({ pic, label }: { pic: SkyPictureOut | null; label: string }) {
  if (pic === null) return <p className="skypic__none">No sun position for this event, so nothing to draw.</p>
  const y = (v: number) => v * (H - FOOT)
  const x = (v: number) => v * W
  const deckPath = pic.deck === null ? null : `M ${x(0.03)} ${y(pic.deck.y) + 4} C ${x(0.3)} ${y(pic.deck.y) - 10}, ${x(0.55)} ${y(pic.deck.y) + 14}, ${x(0.97)} ${y(pic.deck.y) - 2}`
  return (
    <svg className="skypic" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-sky-picture>
      <defs>
        <linearGradient id="skypic-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="skypic__top" />
          <stop offset="1" className="skypic__low" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={y(pic.horizonY)} rx="14" className="skypic__sky" fill="url(#skypic-sky)" />
      {pic.gap === null ? null : (
        <g data-gap>
          <rect x={x(pic.gap.x)} y={y(pic.gap.top)} width={x(pic.gap.w)} height={y(pic.horizonY) - y(pic.gap.top)} className="skypic__gap" />
          <text x={x(pic.gap.x) + 6} y={y(pic.gap.top) + 16} className="skypic__gapt">
            {pic.gap.label}
          </text>
        </g>
      )}
      {pic.deck === null || deckPath === null ? null : (
        <g data-deck>
          <path d={deckPath} className={`skypic__deck${pic.deck.lit ? ' skypic__deck--lit' : ''}`} />
          <text x={x(0.04)} y={Math.max(14, y(pic.deck.y) - 14)} className="skypic__deckt">
            {pic.deck.label}
          </text>
        </g>
      )}
      <line x1="0" x2={W} y1={y(pic.horizonY)} y2={y(pic.horizonY)} className="skypic__horizon" />
      <circle cx={x(pic.sun.x)} cy={y(pic.sun.y)} r="9" className="skypic__sun" />
      {pic.ticks.map((t) => (
        <text key={t.label} x={Math.min(W - 4, Math.max(4, x(t.x)))} y={H - 4} textAnchor={t.x < 0.05 ? 'start' : t.x > 0.95 ? 'end' : 'middle'} className="skypic__tick">
          {t.label}
        </text>
      ))}
    </svg>
  )
}

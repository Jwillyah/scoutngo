import type { SkySceneOut } from '../core/skyScene.ts'

/*
 * THE SKY SCENE, DRAWN (Batch SIMPLE-3, Section 3.2; mockups Sky_Sunrise2,
 * Sky_Sunset2). Geometry and the sentence from src/core/skyScene.ts, colours
 * from the tokens (sky.css): the sky's gradient in the call's tone, each
 * cloud layer at its height with its undersides warm where the call lights
 * it, the fog band, the sun, water or land along the horizon, the compass
 * points along the foot, the height labels at the right. SVG only: no photo,
 * no generated image, ever.
 */
const W = 330
const H = 190
const FOOT = 22

export function SkyScene({ scene, label }: { scene: SkySceneOut | null; label: string }) {
  if (scene === null) return <p className="skypic__none">No sun position for this event, so nothing to draw.</p>
  const y = (v: number) => v * (H - FOOT)
  const x = (v: number) => v * W
  const hy = y(scene.horizonY)
  const id = `scene-${scene.tone}`
  return (
    <figure className="scene" data-sky-scene data-tone={scene.tone}>
      <svg className="scene__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-sky-picture>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className={`scene__top scene__top--${scene.tone}`} />
            <stop offset="0.6" className={`scene__mid scene__mid--${scene.tone}`} />
            <stop offset="1" className={`scene__low scene__low--${scene.tone}`} />
          </linearGradient>
          <radialGradient id={`${id}-sun`} cx="0.5" cy="1" r="0.6">
            <stop offset="0" className="scene__glow" />
            <stop offset="1" className="scene__glow scene__glow--out" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={W} height={hy} className="scene__sky" fill={`url(#${id})`} />
        {scene.tone === 'grey' ? null : <rect x="0" y={hy * 0.35} width={W} height={hy * 0.65} fill={`url(#${id}-sun)`} className="scene__sunglow" />}
        {scene.gap === null ? null : <rect data-gap x={x(scene.gap.x)} y={y(scene.gap.top)} width={x(scene.gap.w)} height={hy - y(scene.gap.top)} className="scene__gap" />}
        {scene.layers.map((l) => (
          <g key={`${l.layer}${l.y}`} data-layer={l.name} data-lit={String(l.lit)}>
            {l.puffs.map((p, i) => {
              const cx = x(p.x + p.w / 2)
              const cy = y(l.y)
              const rx = x(p.w) / 2
              const ry = l.name === 'high' ? 3 : l.name === 'mid' ? 6 : 9
              return (
                <g key={i}>
                  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className={`scene__cloud scene__cloud--${l.name}`} />
                  {l.lit ? <ellipse cx={cx} cy={cy + ry * 0.55} rx={rx * 0.85} ry={Math.max(1.5, ry * 0.45)} className="scene__under" /> : null}
                </g>
              )
            })}
            <text x={W - 6} y={Math.max(13, y(l.y) - (l.name === 'high' ? 6 : 10))} textAnchor="end" className="scene__label">
              {l.label}
            </text>
          </g>
        ))}
        <circle cx={x(scene.sun.x)} cy={y(scene.sun.y)} r="10" className="scene__sun" />
        {scene.fog === null ? null : (
          <g data-fog>
            <rect x="0" y={y(scene.fog.top)} width={W} height={hy - y(scene.fog.top)} className="scene__fog" />
            <text x={6} y={y(scene.fog.top) - 3} className="scene__label">
              {scene.fog.label}
            </text>
          </g>
        )}
        {scene.ground.map((g) =>
          g.kind === 'water' ? (
            <rect key={g.x0} data-ground="water" x={x(g.x0)} y={hy} width={x(g.x1 - g.x0) + 0.5} height={H - FOOT - hy + FOOT} className="scene__water" />
          ) : (
            <path key={g.x0} data-ground="land" d={landPath(x(g.x0), x(g.x1), hy, H)} className="scene__land" />
          ),
        )}
        {scene.glint ? <path data-glint d={`M ${x(scene.sun.x) - 22} ${hy + 2} L ${x(scene.sun.x) + 22} ${hy + 2} L ${x(scene.sun.x) + 4} ${H - FOOT} L ${x(scene.sun.x) - 4} ${H - FOOT} Z`} className="scene__glint" /> : null}
        {scene.ticks.map((t) => (
          <text key={t.label} x={Math.min(W - 4, Math.max(4, x(t.x)))} y={H - 6} textAnchor={t.x < 0.05 ? 'start' : t.x > 0.95 ? 'end' : 'middle'} className="scene__tick">
            {t.label}
          </text>
        ))}
      </svg>
      <figcaption className="scene__why spage__why" data-scene-sentence>
        {scene.sentence}
      </figcaption>
    </figure>
  )
}

/** A low ridge line over a run of land: a few soft rises, the same for the same run. */
function landPath(x0: number, x1: number, hy: number, h: number): string {
  const n = Math.max(2, Math.round((x1 - x0) / 40))
  const step = (x1 - x0) / n
  let d = `M ${x0} ${h} L ${x0} ${hy - 2}`
  for (let i = 0; i < n; i += 1) {
    const a = x0 + i * step
    const peak = hy - 6 - ((i * 7 + Math.round(x0)) % 5)
    d += ` L ${a + step * 0.5} ${peak} L ${a + step} ${hy - 2}`
  }
  return `${d} L ${x1} ${h} Z`
}

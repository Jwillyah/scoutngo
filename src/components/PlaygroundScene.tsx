/*
 * THE EXPOSURE PLAYGROUND'S TEST SCENE, DRAWN IN CODE (Batch C2, 1 Nov).
 *
 * It was a photograph of the shooter's, with its credit. No personal photo
 * ships in the app any more, so the scene is drawn: a sky going warm at the
 * top, the sun, a headland on the horizon and swell lines on the water, so
 * the background has edges to soften with the aperture, and a figure on a
 * board in the same box the photo's surfer filled (src/core/playground.ts
 * surferBox), so the motion blur and the sizes the numbers assume are
 * unchanged. A demo picture, as the page says, not a measurement.
 */
interface Size {
  W: number
  H: number
}

/** The sky, the sun, the far shore and the water: everything the aperture blurs. */
export function SceneBackground({ W, H, id }: Size & { id: string }) {
  const horizon = H * 0.36
  const swells = Array.from({ length: 14 }, (_, i) => {
    const y = horizon + (H - horizon) * ((i + 1) / 15) ** 1.6
    const amp = 6 + i * 3
    const d = `M0 ${y} ${Array.from({ length: 9 }, (_, k) => `Q ${(k + 0.5) * (W / 8)} ${y - amp} ${(k + 1) * (W / 8)} ${y}`).join(' ')}`
    return <path key={i} d={d} fill="none" stroke="#dbeef5" strokeOpacity={0.35 + i * 0.03} strokeWidth={4 + i * 1.5} />
  })
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9a15f" />
          <stop offset="0.6" stopColor="#f3cf9c" />
          <stop offset="1" stopColor="#a9cfe0" />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c8aa6" />
          <stop offset="1" stopColor="#163a4f" />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor="#fff7dc" />
          <stop offset="0.45" stopColor="#ffe2a1" />
          <stop offset="1" stopColor="#ffe2a1" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={W} height={horizon} fill={`url(#${id}-sky)`} />
      <circle cx={W * 0.78} cy={horizon * 0.42} r={W * 0.16} fill={`url(#${id}-sun)`} />
      <circle cx={W * 0.78} cy={horizon * 0.42} r={W * 0.055} fill="#fffaf0" />
      <path d={`M0 ${horizon} L0 ${horizon - 70} C ${W * 0.12} ${horizon - 130} ${W * 0.22} ${horizon - 40} ${W * 0.34} ${horizon - 55} L ${W * 0.42} ${horizon} Z`} fill="#4f5d5a" />
      <rect y={horizon} width={W} height={H - horizon} fill={`url(#${id}-sea)`} />
      {swells}
    </g>
  )
}

/** A figure on a board, filling `box`: what the shutter freezes or smears. */
export function SceneFigure({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  /* Drawn in a 100 x 130 frame and scaled into the box. */
  return (
    <g transform={`translate(${x} ${y}) scale(${width / 100} ${height / 130})`}>
      <path d="M2 112 C 30 100 70 98 98 106 C 70 116 30 120 2 112 Z" fill="#f4f1e8" />
      <path d="M8 118 C 30 128 70 128 96 112 L 98 124 C 70 130 30 130 6 126 Z" fill="#ffffff" fillOpacity={0.75} />
      <g fill="#1d2326">
        <circle cx="52" cy="14" r="8" />
        <path d="M46 22 C 40 34 38 46 42 58 L 30 72 L 22 96 L 30 98 L 40 76 L 50 66 L 60 80 L 66 102 L 74 100 L 70 76 L 60 58 C 64 46 62 32 58 22 Z" />
        <path d="M46 30 L 24 42 L 22 47 L 46 38 Z" />
        <path d="M58 30 L 82 36 L 84 41 L 58 38 Z" />
      </g>
    </g>
  )
}

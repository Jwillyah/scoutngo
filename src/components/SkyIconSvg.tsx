import type { ReactNode } from 'react'
import type { SkyIcon } from '../core/homeDay.ts'

/* The home's sky icons (Batch M), shared with the Weather page (Batch Pages, Section 2). */
const ICON: Record<SkyIcon, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  moon: <path d="M15 4a8 8 0 1 0 5 14A7 7 0 0 1 15 4z" />,
  partly: (
    <>
      <circle cx="9" cy="9" r="3.5" />
      <path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1" />
      <path d="M8 19h9.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 8.5 13 3 3 0 0 0 8 19z" />
    </>
  ),
  'partly-night': (
    <>
      <path d="M11 3.5a5 5 0 0 0 4 7.8 5 5 0 0 1-4-7.8z" />
      <path d="M7 19h9.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.5 13 3 3 0 0 0 7 19z" />
    </>
  ),
  cloud: <path d="M6.5 18h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 18z" />,
  fog: <path d="M4 9h16M3 13h18M5 17h14" />,
  drizzle: (
    <>
      <path d="M6.5 14h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 14z" />
      <path d="M9 17.5v1M13 17.5v1M17 17.5v1" />
    </>
  ),
  rain: (
    <>
      <path d="M6.5 14h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 14z" />
      <path d="M8.5 16.5l-1 3M12.5 16.5l-1 3M16.5 16.5l-1 3" />
    </>
  ),
  snow: (
    <>
      <path d="M6.5 14h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 14z" />
      <path d="M9 18h.01M13 18h.01M17 18h.01M11 21h.01M15 21h.01" />
    </>
  ),
  storm: (
    <>
      <path d="M6.5 13h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 13z" />
      <path d="M12.5 14l-2.5 4h3l-2 4" />
    </>
  ),
}

export function SkyIconSvg({ icon, className }: { icon: SkyIcon; className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {ICON[icon]}
    </svg>
  )
}


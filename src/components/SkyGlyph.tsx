import type { ReactNode } from 'react'
import type { SkyIcon } from '../core/weatherWords.ts'

/** The Weather tab's sky icons, drawn in the text colour (Batch K addendum). */
export function SkyGlyph({ icon, size = 20 }: { icon: SkyIcon | 'sunset' | 'sunrise'; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const cloud = <path {...p} d="M7 17h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 17z" />
  const body: Record<string, ReactNode> = {
    sun: <><circle {...p} cx="12" cy="12" r="4" /><path {...p} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
    part: <><circle {...p} cx="8.5" cy="8.5" r="3" /><path {...p} d="M8.5 3v1.2M3 8.5h1.2M4.6 4.6l.9.9" />{cloud}</>,
    cloud,
    rain: <>{cloud}<path {...p} d="M9 19.5l-1 2M13 19.5l-1 2M17 19.5l-1 2" /></>,
    storm: <>{cloud}<path {...p} d="M12.5 17.5 10.5 21h3l-2 3" /></>,
    sunset: <><path {...p} d="M4 18h16M7 18a5 5 0 0 1 10 0M12 6v4M9.5 8.5 12 11l2.5-2.5" /></>,
    sunrise: <><path {...p} d="M4 18h16M7 18a5 5 0 0 1 10 0M12 11V7M9.5 8.5 12 6l2.5 2.5" /></>,
  }
  return <svg className="wxl__glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{body[icon]}</svg>
}

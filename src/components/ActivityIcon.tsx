import type { ReactNode } from 'react'
import type { Activity } from '../core/homeDay.ts'

/* The five things you do outside, as line icons (Batch M: the home's windows, the week, the picker). */

const ACT_PATH: Record<Activity, ReactNode> = {
  surf: <path d="M2 17c2.5 0 3.5-1.5 4.5-4C8 9 10.5 6 15 6c3 0 5 1.6 5 4-1.2-1-2.6-1.2-3.8-.6-1.6.8-1.7 3-.2 4.3 1.2 1 3 1.2 5 .3-1 2-3.3 3-6 3H2" />,
  shoot: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8 7l1.5-2.5h5L16 7" />
    </>
  ),
  drone: (
    <>
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="19" cy="6" r="2.5" />
      <path d="M7 7.5l3 3h4l3-3M10 10.5v3h4v-3M12 13.5v4" />
    </>
  ),
  fish: <path d="M3 12c3-4 8-5 12-3l4-3v12l-4-3c-4 2-9 1-12-3zM15 11.5h.01" />,
  weather: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
}

export function ActivityIcon({ activity, className = 'hbest__icon' }: { activity: Activity; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {ACT_PATH[activity]}
    </svg>
  )
}


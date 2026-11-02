import { useEffect, useState } from 'react'

/*
 * THE CALENDAR FEED, OPT-IN (Batch H, Section 4): off unless switched on in
 * Settings › Alerts, kept on this phone. On, Settings offers the subscribe
 * link; nothing is sent until the calendar app subscribes.
 */
const KEY = 'scoutngo.calendarFeed.v1'
const EVENT = 'scoutngo:calendar-feed'

export function readCalendarFeed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function useCalendarFeed(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readCalendarFeed)
  useEffect(() => {
    const changed = () => setOn(readCalendarFeed())
    window.addEventListener(EVENT, changed)
    return () => window.removeEventListener(EVENT, changed)
  }, [])
  const write = (next: boolean) => {
    try {
      if (next) localStorage.setItem(KEY, '1')
      else localStorage.removeItem(KEY)
    } catch {
      /* Not kept; this session follows it. */
    }
    setOn(next)
    window.dispatchEvent(new CustomEvent(EVENT))
  }
  return [on, write]
}

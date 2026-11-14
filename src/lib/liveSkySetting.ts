import { useEffect, useState } from 'react'
import { LIVE_SKY_STATES, type LiveSkyState } from '../core/liveSky.ts'

/*
 * SETTINGS › LIVE SKY (Batch LIVE, Section 7.4): where the live sky is drawn.
 * 'home' by default (it goes everywhere once Jwilly has approved the contact
 * sheet); 'all' the home, the Sky page and the Weather page; 'off' none.
 * Kept on this phone only.
 *
 * FORCE_KEY sets the state drawn, whatever the weather: for the contact sheet
 * of all eight (scripts and the shots set it); nothing in the app writes it.
 */
export type LiveSkyWhere = 'home' | 'all' | 'off'
const KEY = 'scoutngo.liveSky.v1'
export const FORCE_KEY = 'scoutngo.liveSky.force.v1'
const EVENT = 'scoutngo:liveSky'

export function readLiveSky(): LiveSkyWhere {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'all' || v === 'off' ? v : 'home'
  } catch {
    return 'home'
  }
}

export function readForcedSky(): LiveSkyState | null {
  try {
    const v = localStorage.getItem(FORCE_KEY)
    return LIVE_SKY_STATES.includes(v as LiveSkyState) ? (v as LiveSkyState) : null
  } catch {
    return null
  }
}

export function useLiveSkySetting(): [LiveSkyWhere, (w: LiveSkyWhere) => void] {
  const [where, setWhere] = useState(readLiveSky)
  useEffect(() => {
    const f = () => setWhere(readLiveSky())
    window.addEventListener(EVENT, f)
    return () => window.removeEventListener(EVENT, f)
  }, [])
  return [
    where,
    (next) => {
      try {
        localStorage.setItem(KEY, next)
      } catch {
        /* Not kept. */
      }
      window.dispatchEvent(new Event(EVENT))
    },
  ]
}

/** Whether a page draws the live sky: the home when on at all, the others with 'all'. */
export const liveSkyOn = (where: LiveSkyWhere, page: 'home' | 'sky' | 'weather'): boolean => where !== 'off' && (page === 'home' || where === 'all')

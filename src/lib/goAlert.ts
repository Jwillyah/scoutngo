import { useEffect, useState } from 'react'
import { goAlertDue, goAlertKey } from '../core/goAlert.ts'
import type { SkyCall } from '../core/skyCall.ts'

/*
 * SETTINGS › GO ALERT (Batch CORE, Section 1.4): off until you turn it on;
 * turning it on asks the phone for permission. What has been said is kept
 * here, on this phone only, so each event is said once.
 */
const KEY = 'scoutngo.goAlert.v1'
const SENT = 'scoutngo.goAlert.sent.v1'
const EVENT = 'scoutngo:goAlert'

export function readGoAlert(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

function readSent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SENT) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export type GoPermission = 'granted' | 'denied' | 'default' | 'unsupported'
export const goPermission = (): GoPermission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

export function useGoAlertSetting(): [boolean, (on: boolean) => void, GoPermission] {
  const [on, setOn] = useState(readGoAlert)
  const [perm, setPerm] = useState<GoPermission>(goPermission)
  useEffect(() => {
    const f = () => setOn(readGoAlert())
    window.addEventListener(EVENT, f)
    return () => window.removeEventListener(EVENT, f)
  }, [])
  const set = (next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off')
    } catch {
      /* Not kept. */
    }
    window.dispatchEvent(new Event(EVENT))
    /* Asked on the tap that turns it on: the phone allows the question only from a tap. */
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().then((p) => setPerm(p))
  }
  return [on, set, perm]
}

async function notify(body: string, tag: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg !== undefined) await reg.showNotification('ScoutNGo', { body, tag })
    else new Notification('ScoutNGo', { body, tag })
  } catch {
    /* The phone would not show it; the "Color now" line on the home still says it. */
  }
}

/** Says the Go once per event while the app is open, when the setting is on. */
export function useGoAlert(call: SkyCall | null, now: Date, timeZone: string): void {
  const due = readGoAlert() ? goAlertDue(call, now, readSent(), timeZone) : null
  const key = call === null ? null : goAlertKey(call)
  useEffect(() => {
    if (due === null || key === null) return
    try {
      localStorage.setItem(SENT, JSON.stringify([...readSent(), key].slice(-20)))
    } catch {
      /* Said again next time, rather than never. */
    }
    void notify(due, key)
  }, [due, key])
}

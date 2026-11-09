import { useEffect, useState } from 'react'
import { connectivity } from '../lib/connectivity.ts'
import { netLines } from '../lib/netLog.ts'
import { weatherBusy } from '../lib/weatherStore.ts'

/*
 * THE NETWORK, AS THIS PHONE SAW IT (Batch N E1; Batch Map A3 put it on the
 * map and the detail pages too: on 9 Nov the home loaded on LTE while the
 * Wind, Buoys and Surf pages and the map did not, and the lines were only on
 * the home). Hidden: a triple tap on the date, the place line or the map's
 * title. In memory only (src/lib/netLog.ts): nothing is kept or sent.
 */
export function NetDebug({ onClose }: { onClose: () => void }) {
  const [at, setAt] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAt(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; type?: string } }).connection
  const busy = weatherBusy(at)
  const lines = netLines(at, navigator.onLine !== false, connectivity.isOnline(), navigator.serviceWorker?.controller != null, conn === undefined ? null : `${conn.type ?? ''} ${conn.effectiveType ?? ''}`.trim() || null)
  if (busy !== null) lines.splice(1, 0, `weather held back ${Math.round((busy.until - at) / 1000)}s more (${busy.why})`)
  return (
    <button type="button" className="netdebug" onClick={onClose} aria-label="Network debug lines; tap to close">
      {lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </button>
  )
}


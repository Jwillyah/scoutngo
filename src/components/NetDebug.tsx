import { useEffect, useState } from 'react'
import { connectivity } from '../lib/connectivity.ts'
import { netCopyText, netLines } from '../lib/netLog.ts'
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
  /* Batch MAP2, Section 4: one tap copies the last 30 requests (host, status, time; no paths, no coordinates) to paste into a message. */
  const [copied, setCopied] = useState<string | null>(null)
  const copy = () => {
    const text = netCopyText(at, lines[0])
    const done = () => setCopied('Copied: paste it into a message')
    if (navigator.clipboard?.writeText !== undefined) {
      navigator.clipboard.writeText(text).then(done, () => setCopied(text))
    } else setCopied(text)
  }
  return (
    <div className="netdebug netdebug--box">
      <button type="button" className="netdebug__lines" onClick={onClose} aria-label="Network debug lines; tap to close">
        {lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </button>
      <button type="button" className="ui-chip netdebug__copy" onClick={copy}>
        Copy debug
      </button>
      {copied === null ? null : copied.startsWith('Copied') ? (
        <span className="netdebug__note">{copied}</span>
      ) : (
        /* No clipboard here: the text, selectable, to copy by hand. */
        <textarea className="netdebug__text" readOnly value={copied} aria-label="Debug text to copy" />
      )}
    </div>
  )
}


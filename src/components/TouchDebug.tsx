import { useState } from 'react'
import { buildLabelWithDate } from '../lib/build.ts'
import { clearTouchLog, useTouchLog } from '../lib/touchDebug.ts'

/*
 * THE DEBUG TOUCH BOX (src/lib/touchDebug.ts): fingers, Safari's gesture
 * scale, the zoom, and the newest lines of the log. It takes no touch but its
 * two buttons, so a pinch through it is a pinch on the map. Copy puts the
 * whole log on your own clipboard; nothing is sent.
 */
export function TouchDebug() {
  const { fingers, scale, zoom, lines } = useTouchLog()
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async () => {
    /* The build first, so a pasted log says which code it came from. */
    const text = [`build ${buildLabelWithDate()}`, ...lines].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(`Copied ${lines.length} lines`)
    } catch {
      setCopied('Could not copy: the whole log is below, select it')
    }
  }

  return (
    <div className="touchdbg" role="region" aria-label="Debug touch">
      <p className="touchdbg__now num">
        {buildLabelWithDate()} · fingers {fingers} · scale {scale === null ? '—' : scale.toFixed(3)} · zoom {zoom === null ? '—' : zoom.toFixed(3)}
      </p>
      <pre className="touchdbg__log num">{lines.slice(-10).join('\n')}</pre>
      <div className="touchdbg__actions">
        <button type="button" className="touchdbg__btn" onClick={() => void copy()}>
          Copy log
        </button>
        <button type="button" className="touchdbg__btn" onClick={() => { clearTouchLog(); setCopied(null) }}>
          Clear
        </button>
        {copied === null ? null : <span className="touchdbg__note">{copied}</span>}
      </div>
      {copied?.startsWith('Could not') ? <textarea className="touchdbg__all num" readOnly value={[`build ${buildLabelWithDate()}`, ...lines].join('\n')} /> : null}
    </div>
  )
}

import { useState } from 'react'
import { readProbe } from '../lib/storageProbe.ts'

/*
 * THE HOME SCREEN STORAGE TEST, RUN ON THE PHONE ITSELF.
 *
 * UNTESTED UNTIL SOMEBODY RUNS IT. This card says what to do and shows the
 * evidence; it does not claim a result, because the result is a fact about
 * one phone's Safari that nothing in this repo has observed. When it has been
 * run, the answer belongs in the line below the steps -- see src/lib/storageProbe.ts.
 */
export function StorageProbe() {
  /* Read once per mount: the marker is the evidence and must not be rewritten by a render. */
  const [reading] = useState(() => readProbe())

  if (reading === null) {
    return <p className="probe__line">This browser refused storage, so there is nothing to test.</p>
  }

  const when = new Date(reading.marker.writtenAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="probe">
      <p className="probe__line">
        Running from{' '}
        <strong>{reading.context === 'home-screen' ? 'the Home Screen' : 'a Safari tab'}</strong>.
        Storage here was first written <span className="num">{when}</span>
        {reading.writtenNow ? ', just now: nothing was here before this launch.' : '.'}
      </p>
      <ol className="probe__steps">
        <li>Open ScoutNGo from its Home Screen icon and note the time above.</li>
        <li>Settings › Apps › Safari › Clear History and Website Data.</li>
        <li>Open it from the Home Screen icon again.</li>
      </ol>
      <p className="probe__line">
        Same time: the Home Screen app kept its storage, and your kit lives there. A new time
        that says &ldquo;just now&rdquo;: it was wiped, so export a file before you clear Safari.
      </p>
    </div>
  )
}

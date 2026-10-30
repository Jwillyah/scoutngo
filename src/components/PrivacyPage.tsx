import { clearWeatherStore } from '../lib/weatherStore.ts'
import { useEffect, useState } from 'react'
import { HOSTS, TRIGGER_WORD } from '../lib/hosts.ts'
import { CONTACT_EMAIL, CONTACT_IS_PLACEHOLDER, listed, onSeenHosts, seenHosts, watchHosts } from '../lib/privacy.ts'
import { buildScoutFile, saveScoutFile, scoutFilename } from '../lib/scoutFile.ts'
import { reviveSpots, SPOTS_STORAGE_KEY } from '../lib/spots.ts'
import { Page } from './Page.tsx'

/*
 * /privacy: what this app keeps, what leaves the phone, and a live check.
 *
 * THE ROWS ARE THE ALLOWLIST. "What leaves your phone" is drawn from
 * src/lib/hosts.ts and nothing else, and tests/privacy.test.ts fails when a
 * host the code asks is missing from it, or when the page and the list
 * disagree. The live check reads the hosts this browser has contacted in this
 * session from the browser's own resource timing, in memory only, and says
 * which are on the list.
 */
function useSeenHosts(): string[] {
  const [hosts, setHosts] = useState<string[]>(() => {
    watchHosts()
    return seenHosts()
  })
  useEffect(() => onSeenHosts(() => setHosts(seenHosts())), [])
  return hosts
}

interface Props {
  onClose: () => void
}

export function PrivacyPage({ onClose }: Props) {
  return (
    <Page title="Privacy" className="privacy" onClose={onClose}>
      <PrivacyBody />
    </Page>
  )
}

/** The page's content, apart from its frame: what the tests render. */
export function PrivacyBody() {
  const seen = useSeenHosts()
  const [clearing, setClearing] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const exportSpots = () => {
    let spots: ReturnType<typeof reviveSpots> = []
    try {
      spots = reviveSpots(JSON.parse(localStorage.getItem(SPOTS_STORAGE_KEY) ?? '[]'))
    } catch {
      spots = []
    }
    saveScoutFile(buildScoutFile({ spots }), scoutFilename('spots'))
    setNote(`${spots.length} ${spots.length === 1 ? 'spot' : 'spots'} saved to a file.`)
  }

  const clearPhone = async () => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('scoutngo.')) localStorage.removeItem(k)
      if (typeof caches !== 'undefined') for (const k of await caches.keys()) await caches.delete(k)
      if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('scoutngo-lidar')
      await clearWeatherStore()
      setNote('Cleared: spots, kit, settings, saved forecasts, map tiles and scans are gone from this phone.')
    } catch {
      setNote('Some of it could not be cleared: the browser refused.')
    }
    setClearing(false)
  }

  return (
    <>
      <ul className="privacy__zeros" aria-label="What this app keeps about you">
        <li><span className="privacy__n num">0</span> accounts</li>
        <li><span className="privacy__n num">0</span> trackers or cookies</li>
        <li><span className="privacy__n num">0</span> server copies of your spots</li>
      </ul>
      <p className="privacy__note">Your spots, kit, settings and saved forecasts stay in this browser on this phone. There is no account and no database.</p>

      <h2 className="privacy__head">What leaves your phone</h2>
      <div className="privacy__scroll">
      <table className="privacy__hosts">
        <thead>
          <tr>
            <th scope="col">Who</th>
            <th scope="col">What it learns</th>
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {HOSTS.map((h) => (
            <tr key={h.host} data-host={h.host}>
              <td>
                {h.who}
                <span className="privacy__host">{h.host}</span>
              </td>
              <td>{h.learns}</td>
              <td>
                <span className={`privacy__when privacy__when--${h.trigger}`}>{TRIGGER_WORD[h.trigger]}</span>
                <span className="privacy__host">{h.when}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="privacy__note">Weather, sea and sky lookups send the place rounded to 2 decimals, about a kilometre. Tides are asked by station number.</p>

      <h2 className="privacy__head">Live check: this session</h2>
      <p className="privacy__note">The hosts this browser has asked since the app opened, read from the browser itself and kept nowhere.</p>
      {seen.length === 0 ? (
        <p className="privacy__note">None yet.</p>
      ) : (
        <ul className="privacy__seen">
          {seen.map((h) => (
            <li key={h} className={listed(h) === undefined ? 'privacy__seen--off' : undefined}>
              {h} · {listed(h) === undefined ? 'not on the list above' : 'on the list'}
            </li>
          ))}
        </ul>
      )}

      <h2 className="privacy__head">The host of this app</h2>
      <p className="privacy__note">
        The app is served by Vercel. Its logs of requests to this app (the time, the page asked for, your browser and your IP address) are kept for 1 hour on Vercel’s Hobby plan and 1 day on Pro (Vercel’s documentation, Runtime Logs). Which plan this deployment is on is not set in the code; the owner confirms it in Vercel’s dashboard. The app’s own functions (station weather, buoys, search) log nothing.
      </p>

      <h2 className="privacy__head">Your data</h2>
      <div className="btn-row">
        <button type="button" className="btn btn--small" onClick={exportSpots}>
          Export my spots
        </button>
        {clearing ? (
          <button type="button" className="btn btn--small" onClick={() => void clearPhone()}>
            Clear everything on this phone
          </button>
        ) : (
          <button type="button" className="btn btn--small btn--quiet" onClick={() => setClearing(true)}>
            Clear this phone
          </button>
        )}
      </div>
      {clearing ? <p className="privacy__note">This cannot be undone. Export your spots first if you want them.</p> : null}
      {note === null ? null : <p className="privacy__note">{note}</p>}

      <h2 className="privacy__head">Contact</h2>
      <p className="privacy__note">
        {CONTACT_EMAIL}
        {CONTACT_IS_PLACEHOLDER ? ' (a placeholder until a real address is set)' : ''}
      </p>
    </>
  )
}

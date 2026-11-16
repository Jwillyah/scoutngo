import { useState, type ReactNode } from 'react'
import { openPrivacy } from '../lib/privacyRoute.ts'
import { HowPage } from './HowPage.tsx'
import '../styles/landing-e.css'

/**
 * THE LANDING (Batch CORE, Section 6; board docs/mockups/Landing_E.png,
 * Jwilly's pick, 16 Nov). It replaces "Four apps in one":
 *
 *   the brand        the pin and the name
 *   the headline     Know before you go outside.
 *   one line         what it does, and "Free and open source. Your spots
 *                    stay on your phone." (never "no account")
 *   an example card  Surf · Shoot · Drone · Tide · Wind, each with values
 *                    labelled Example: no real place, nothing asked of the
 *                    visitor (the landing cannot know where they are)
 *   the color card   Where's the color tonight? (Best Sky, after first run)
 *   one button       Open ScoutNGo
 *   the footer       Free · open source · Privacy ("works offline" comes back
 *                    after Section 7A passes on the phone)
 *
 * No Fish or Weather row, and no drone Fly here until Fly works (16 Nov).
 */
export function Landing({ onDismiss, onBestSky }: { onDismiss: () => void; onBestSky?: () => void }) {
  const [view, setView] = useState<'cover' | 'how'>(() =>
    typeof window !== 'undefined' && window.location.pathname === '/how' ? 'how' : 'cover',
  )

  const show = (next: 'cover' | 'how') => {
    setView(next)
    /*
     * A REAL URL, so the link is shareable and the back button works. There is
     * no router in this app and adding one for two views would be a dependency
     * to carry forever; pushState is the whole of what is needed.
     */
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', next === 'how' ? '/how' : '/')
    }
  }

  if (view === 'how') {
    return <HowPage onBack={() => show('cover')} />
  }

  return <Cover onDismiss={onDismiss} onBestSky={onBestSky ?? onDismiss} />
}

const ICONS: Record<'surf' | 'shoot' | 'drone' | 'tide' | 'wind', ReactNode> = {
  surf: <path d="M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />,
  shoot: (
    <>
      <path d="M3 17h18M7 17a5 5 0 0 1 10 0" />
      <path d="M12 7V5M5.6 10.6 4.2 9.2M18.4 10.6l1.4-1.4" />
    </>
  ),
  drone: (
    <>
      <rect x="9.5" y="10.5" width="5" height="3" rx="1" />
      <path d="M9.5 11 6 7.5M14.5 11 18 7.5M9.5 13 6 16.5M14.5 13l3.5 3.5" />
      <circle cx="6" cy="7.5" r="2" />
      <circle cx="18" cy="7.5" r="2" />
      <circle cx="6" cy="16.5" r="2" />
      <circle cx="18" cy="16.5" r="2" />
    </>
  ),
  tide: <path d="M3 14c2.5 0 3.5-4 6-4s3.5 4 6 4 3.5-4 6-4M12 4v5M9.5 6.5 12 9l2.5-2.5" />,
  wind: <path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7" />,
}

/* Example values, labelled as such: no real place (Section 6.2). Each time carries its AM or PM (scripts/audit-clock.mjs). */
const ROWS: { key: keyof typeof ICONS; name: string; line: string; value: string; sub: string }[] = [
  { key: 'surf', name: 'Surf', line: 'size, wind, buoys, cams', value: '2–3 ft', sub: 'Fun · light offshore' },
  { key: 'shoot', name: 'Shoot', line: 'light, shadows, viewfinder', value: '4:21 PM', sub: 'golden hour starts' },
  { key: 'drone', name: 'Drone', line: 'wind up high, airspace', value: '11 kt', sub: 'at 400 ft · 250 ft grid' },
  { key: 'tide', name: 'Tide', line: 'highs, lows, the curve', value: 'Low 3:36 PM', sub: 'falling · 1.2 ft' },
  { key: 'wind', name: 'Wind', line: 'the whole map, live', value: '8 kt NW', sub: 'offshore at the beach' },
]

function Cover({ onDismiss, onBestSky }: { onDismiss: () => void; onBestSky: () => void }) {
  return (
    <div className="land">
      <div className="land__in">
        <div className="land__brand">
          <svg className="land__pin" width="22" height="26" viewBox="0 0 24 28" aria-hidden="true">
            <path d="M12 27s-9-8-9-15a9 9 0 0 1 18 0c0 7-9 15-9 15z" />
            <circle cx="12" cy="12" r="3.4" className="land__pinhole" />
          </svg>
          <h1 className="land__name">ScoutNGo</h1>
        </div>
        <p className="land__head">Know before you go outside.</p>
        <p className="land__sub">Surf, light, drone, tide and wind for any spot. Free and open source. Your spots stay on your phone.</p>
        <section className="land__card" aria-label="Example: what you'll see">
          <p className="land__label">Example · what you&rsquo;ll see</p>
          <ul className="land__rows">
            {ROWS.map((r) => (
              <li key={r.key} className={`land__row land__row--${r.key}`}>
                <span className="land__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[r.key]}
                  </svg>
                </span>
                <span className="land__text">
                  <span className="land__rowname">{r.name}</span>
                  <span className="land__rowline">{r.line}</span>
                </span>
                <span className="land__value">
                  <span className="land__num num">{r.value}</span>
                  <span className="land__word">{r.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <button type="button" className="land__color" onClick={onBestSky}>
          <svg className="land__colorico" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {ICONS.shoot}
          </svg>
          <span className="land__colortext">
            <span className="land__colorhead">Where&rsquo;s the color tonight?</span>
            <span className="land__colorline">Finds the best sunrise or sunset spot near you, from the real clouds.</span>
          </span>
        </button>
        <button type="button" className="land__go" onClick={onDismiss}>
          Open ScoutNGo
        </button>
        <p className="land__foot">
          Free · open source ·{' '}
          <button type="button" className="land__more" onClick={openPrivacy}>
            Privacy
          </button>
        </p>
      </div>
    </div>
  )
}

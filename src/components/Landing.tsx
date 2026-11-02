import { useState, type ReactNode } from 'react'
import { DASH, SAMPLE_NAME } from '../core/homeSample.ts'
import { useHomeSample } from '../lib/useHomeSample.ts'
import { useNow } from '../lib/useNow.ts'
import { openPrivacy } from '../lib/privacyRoute.ts'
import { HowPage } from './HowPage.tsx'

/**
 * THE HOME PAGE (Batch F, Section 1; the design canvas board "HOME V · with
 * real photos"):
 *
 *   the brand        a placeholder pin until the real logo, and the name
 *   one line         Four apps in one. Private, and yours.
 *   four bands       Light, Tide, Surf, Wind: each a photo with the live value
 *                    for ONE FIXED sample beach, the Virginia Beach Fishing
 *                    Pier (src/core/homeSample.ts), never the visitor's place
 *   four rows        Sky fire (tonight's real verdict), Drone preflight, Moon
 *                    line-ups (the next real alignment), No account
 *   one button       Open the map
 *   the footer       Free · open source · works offline · How it works · Privacy
 *
 * The band photos are the owner's own, in public/home/, stripped of every
 * byte of metadata (scripts/strip-photo-metadata.mjs). A value that did not
 * arrive is a dash. Fits a Safari tab, 390 x 664, with nothing to scroll: the
 * bands give up height first (scripts/audit-safari-tab.mjs).
 *
 * EVERYTHING ELSE IS ON /how AND NOTHING WAS DELETED.
 */
export function Landing({ onDismiss }: { onDismiss: () => void }) {
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

  return <Cover onDismiss={onDismiss} onHow={() => show('how')} />
}

const BANDS = [
  { key: 'light', name: 'Light', tone: 'cover__band--light' },
  { key: 'tide', name: 'Tide', tone: 'cover__band--tide' },
  { key: 'surf', name: 'Surf', tone: 'cover__band--surf' },
  { key: 'wind', name: 'Wind', tone: 'cover__band--wind' },
] as const

const ICON_PATHS: Record<'fire' | 'drone' | 'moon' | 'lock', ReactNode> = {
  fire: (
    <>
      <path d="M3 9c3-3 6-3 9-1s6 2 9-1" />
      <path d="M2 19h20" />
      <path d="M8 19a4 4 0 0 1 8 0" />
      <path d="M12 14v-2M6.5 15.5 5 14M17.5 15.5 19 14" />
    </>
  ),
  drone: (
    <>
      <rect x="9" y="10" width="6" height="4" rx="1" />
      <path d="M9 11 5 7M15 11l4-4M9 13l-4 4M15 13l4 4" />
      <circle cx="5" cy="7" r="2.2" />
      <circle cx="19" cy="7" r="2.2" />
      <circle cx="5" cy="17" r="2.2" />
      <circle cx="19" cy="17" r="2.2" />
    </>
  ),
  moon: (
    <>
      <path d="M17 4a6 6 0 1 0 3 9 5 5 0 0 1-3-9z" />
      <path d="M2 20h14" />
      <path d="M4 20v-3M8 20v-3M12 20v-3M2 17h14" />
    </>
  ),
  lock: (
    <>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
}

function Row({ icon, title, line, live }: { icon: keyof typeof ICON_PATHS; title: string; line: string; live?: string | null }) {
  return (
    <li className={`cover__row cover__row--${icon}`}>
      <span className="cover__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {ICON_PATHS[icon]}
        </svg>
      </span>
      <span className="cover__rowtext">
        <span className="cover__rowtitle">{title}</span>
        <span className="cover__rowline">{line}</span>
        {live === undefined ? null : <span className="cover__rowlive">{live ?? DASH}</span>}
      </span>
    </li>
  )
}

function Cover({ onDismiss, onHow }: { onDismiss: () => void; onHow: () => void }) {
  const sample = useHomeSample(useNow(60_000))
  return (
    <div className="cover">
      <div className="cover__top">
        <div className="cover__brand">
          <svg className="cover__pin" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z" fill="currentColor" />
            <path d="M8.6 11.2a3.4 3.4 0 0 1 6.8 0z" className="cover__pinsun" />
          </svg>
          <h1 className="cover__name">ScoutNGo</h1>
        </div>
        <p className="cover__head">
          Four apps in one.
          <br />
          <span className="cover__head2">Private, and yours.</span>
        </p>
        <ul className="cover__bands" aria-label={`Right now at the ${SAMPLE_NAME}`}>
          {BANDS.map((b) => (
            <li key={b.key} className={`cover__band ${b.tone}`}>
              <span className="cover__bandname">{b.name}</span>
              <span className="cover__bandvalue">
                <span className="cover__bandnum">{sample[b.key].value}</span>
                <span className="cover__bandword">{sample[b.key].word}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="cover__sample">At the {SAMPLE_NAME}, as an example · wind map imagery Esri</p>
        <ul className="cover__rows">
          <Row icon="fire" title="Sky fire" line="Reads the clouds 400 km toward the sun." live={sample.skyFire} />
          <Row icon="drone" title="Drone preflight" line="Fly it here first: line of sight, roofs, wind." />
          <Row icon="moon" title="Moon line-ups" line="When it rises right behind your subject." live={sample.moon} />
          <Row icon="lock" title="No account, no tracking" line="Open source. Your spots never leave your phone." />
        </ul>
        <button type="button" className="cover__go" onClick={onDismiss}>
          Open the map
        </button>
        <p className="cover__licence">
          Free · open source · works offline ·{' '}
          <button type="button" className="cover__more" onClick={onHow}>
            How it works
          </button>
          {' · '}
          <button type="button" className="cover__more" onClick={openPrivacy}>
            Privacy
          </button>
        </p>
      </div>
    </div>
  )
}

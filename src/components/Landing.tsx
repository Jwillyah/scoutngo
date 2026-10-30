import { useState } from 'react'
import { openPrivacy } from '../lib/privacyRoute.ts'
import { HowPage } from './HowPage.tsx'
import { Icon } from './Icon.tsx'

/**
 * THE HOME PAGE, simple until the visual style is chosen (field test, 30 Oct):
 *
 *   the brand        the app icon and the name
 *   one line         Plan the shot before you go.
 *   three lines      what is different about it
 *   one button       gold, Open the map
 *   one footer line  Free · open source · no account · Privacy · How it works
 *
 * No photograph: the shooter's own photo and its credit came off the page and
 * out of the build (public/home-hero.webp is gone). No personal photos
 * anywhere public. Fits a Safari tab, 390 x 664, with nothing to scroll.
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

const COVER_LINES = ['Light, tide, surf and wind for the exact spot', 'Drone moves checked before you fly', 'Nothing about you leaves your phone'] as const

function Cover({ onDismiss, onHow }: { onDismiss: () => void; onHow: () => void }) {
  return (
    <div className="cover">
      <div className="cover__top">
        <div className="cover__brand">
          <Icon glyph="app" size={56} />
          <h1 className="cover__name">ScoutNGo</h1>
        </div>
        <p className="cover__head">Plan the shot before you go.</p>
        <ul className="cover__lines">
          {COVER_LINES.map((line) => (
            <li key={line} className="cover__line">
              {line}
            </li>
          ))}
        </ul>
        <button type="button" className="cover__go" onClick={onDismiss}>
          Open the map
        </button>
        <p className="cover__licence">
          Free · open source · no account ·{' '}
          <button type="button" className="cover__more" onClick={openPrivacy}>
            Privacy
          </button>
          {' · '}
          <button type="button" className="cover__more" onClick={onHow}>
            How it works
          </button>
        </p>
      </div>
    </div>
  )
}

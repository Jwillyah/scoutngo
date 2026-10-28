import { useState } from 'react'
import type { IconId } from '../lib/iconPalette.ts'
import { HowPage } from './HowPage.tsx'
import { Icon, type GlyphId } from './Icon.tsx'

/**
 * THE HOME PAGE: the shooter's own photograph of a real shoot (27 Oct 2026,
 * Virginia Beach at sunrise: the oceanfront hotels and the fishing pier lit
 * pink, from the drone), and over its sky:
 *
 *   the brand        the app icon, the name, one line, four things it does
 *   one button       gold, Open the map
 *   one footer line  Free, open source, no account, How it works
 *   the credit       Photo by Jwillyagaze
 *
 * all in the sky, so the hotels and the pier stay in view below. The type is
 * dark plum: the sky in this photo is pale pink and peach, and white on it
 * fails; scripts/measure-home-contrast.mjs reads the real pixels behind each
 * label. The shipped file (public/home-hero.webp) carries no metadata.
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

/* The photographer's credit, as asked. */
export const HERO_CREDIT = 'Photo by Jwillyagaze'

function Cover({ onDismiss, onHow }: { onDismiss: () => void; onHow: () => void }) {
  return (
    <div className="cover">
      <img
        className="cover__photo"
        src="/home-hero.webp"
        alt="Virginia Beach at sunrise from a drone: the oceanfront hotels and the fishing pier lit pink, the sea below"
        width={1600}
        height={2000}
      />
      {/* The photo's sky carried on above it, so the type has room and the hotels keep theirs. */}
      <div className="cover__blend" aria-hidden="true" />

      <div className="cover__top">
        <div className="cover__brand">
          <Icon glyph="app" size={44} />
          <h1 className="cover__name">ScoutNGo</h1>
        </div>
        <p className="cover__head">Plan the shot before you get there. Where to stand, which lens, and when the light is right.</p>
        <ul className="cover__feats">
          {FEATURES.map((f) => (
            <li key={f.label} className="cover__feat">
              <Icon glyph={f.glyph} tile={f.tile} size={38} />
              <span className="cover__featlabel">{f.label}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="cover__go" onClick={onDismiss}>
          Open the map
        </button>
        <p className="cover__licence">
          Free · open source · no account ·{' '}
          <button type="button" className="cover__more" onClick={onHow}>
            How it works
          </button>
        </p>
        <p className="cover__attrib">{HERO_CREDIT}</p>
      </div>
    </div>
  )
}

const FEATURES: readonly { label: string; glyph: GlyphId; tile: IconId }[] = [
  { label: 'Where to stand', glyph: 'plan', tile: 'plan' },
  { label: 'Which lens', glyph: 'kit', tile: 'kit' },
  { label: 'When the light hits', glyph: 'sky', tile: 'viewfinder' },
  { label: 'Works offline', glyph: 'layers', tile: 'offline' },
]

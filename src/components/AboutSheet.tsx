import '../styles/about-story.css'
import { REPO_SLUG, versionLine } from '../lib/build.ts'
import { openCredits } from '../lib/creditsRoute.ts'
import { openPrivacy } from '../lib/privacyRoute.ts'
import { ABOUT_DIFFERENT, ABOUT_HEAD, ABOUT_STORY } from '../core/aboutWords.ts'

/*
 * ABOUT, THE STORY (Batch DRONE, Section 5; board docs/mockups/About_Story.png):
 * the headline, Jwilly's paragraph exactly as on the board, the four "how
 * it's different" lines, three rows (How we got this · our hit rate, Data &
 * credits, Source code), and "Made in Virginia Beach · Privacy" at the foot.
 *
 * THE STORY IS THE OWNER'S OWN WORDS, word for word from the board, not
 * improved. It never says "no account" (the batch's rule).
 */

export type HowSection = 'computed' | 'leaves' | 'refuses'

interface AboutSheetProps {
  /** Opens /how at the matching section. One content, two entry points. */
  onHow: (section: HowSection) => void
}

const Chev = () => (
  <span className="astory__chev" aria-hidden="true">
    ›
  </span>
)

export function AboutSheet({ onHow }: AboutSheetProps) {
  return (
    <div className="astory">
      <h2 className="astory__head">{ABOUT_HEAD}</h2>
      <p className="astory__story">{ABOUT_STORY}</p>
      <section className="astory__card" aria-label="How it's different">
        <p className="astory__label">How it&rsquo;s different</p>
        {ABOUT_DIFFERENT.map((d) => (
          <p key={d.key} className={`astory__line astory__line--${d.key}`}>
            <b className="astory__lead">{d.lead}</b> {d.rest}
          </p>
        ))}
      </section>
      <nav className="astory__rows" aria-label="More">
        <button type="button" className="astory__row" onClick={() => onHow('computed')}>
          <span className="astory__rowname">How we got this · our hit rate</span>
          <Chev />
        </button>
        <button type="button" className="astory__row" onClick={openCredits}>
          <span className="astory__rowname">Data &amp; credits</span>
          <Chev />
        </button>
        {REPO_SLUG === '' ? (
          <p className="astory__row astory__row--static">
            <span className="astory__rowname">Source code</span>
            <span className="astory__rownote">The source is public; this build does not know its repository.</span>
          </p>
        ) : (
          <a className="astory__row" href={`https://github.com/${REPO_SLUG}`} target="_blank" rel="noreferrer">
            <span className="astory__rowname">Source code</span>
            <Chev />
          </a>
        )}
      </nav>
      <p className="astory__version num">{versionLine()}</p>
      <p className="astory__foot">
        Made in Virginia Beach ·{' '}
        <button type="button" className="astory__privacy" onClick={openPrivacy}>
          Privacy
        </button>
      </p>
    </div>
  )
}

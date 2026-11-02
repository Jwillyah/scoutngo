import { REPO_SLUG, versionLine } from '../lib/build.ts'
import { openPrivacy } from '../lib/privacyRoute.ts'

/*
 * ABOUT, SHORT (Batch G, Section 8): the story in two short paragraphs, How
 * it works in three rows (every number is arithmetic, privacy, what it will
 * not tell you), the version and the source. Nothing else: the API key,
 * backup and restore, the old file import and the Safari-clearing check are
 * in Settings (› AI key, › Privacy & data and its "i"), once.
 *
 * THE SAME CONTENT AS /how, NOT A SECOND COPY. The rows open the matching
 * section of the /how page, or /privacy, rather than restating it here.
 *
 * THE OPENING COPY IS THE OWNER'S OWN WORDS, reproduced unpolished and
 * deliberately not improved: editing somebody's account of why they built
 * their own tool is not a thing to do uninvited.
 */

export type HowSection = 'computed' | 'leaves' | 'refuses'

interface AboutSheetProps {
  /** Opens /how at the matching section. One content, two entry points. */
  onHow: (section: HowSection) => void
}

export function AboutSheet({ onHow }: AboutSheetProps) {
  return (
    <div className="about">
      <p className="about__eyebrow">Why this exists</p>
      <p className="about__why">
        I shoot surf, events and a lot of drone work. Before every shoot I was checking four apps.
        Clouds in one, sunrise and sunset in another, the map in a third, and paying for a couple I
        only needed one number from. Then I’d turn up and guess anyway.
      </p>
      <p className="about__why">
        So I built my own, instead of renting four apps that each work the way someone else decided.
        Some of these spots I’ve never stood in. Others I know well, and I just want to know the best
        day and time to go back.
      </p>
      <p className="about__by">Jwilly · @Jwillyagaze</p>

      <p className="about__eyebrow about__eyebrow--dim">How it works</p>
      {(
        [
          ['computed', 'Every number is arithmetic', 'Sun, shadow, lens, distance. The model is never asked.'],
          ['leaves', 'Privacy: what leaves your device', 'No account, no database, no tracking.'],
          ['refuses', 'What it will not tell you', 'It never says an area is clear. Check the airspace yourself.'],
        ] as const
      ).map(([section, title, note]) => (
        /* What leaves the device has a page of its own now: /privacy, with the live check. */
        <button type="button" className="about__row" key={section} onClick={() => (section === 'leaves' ? openPrivacy() : onHow(section))}>
          <span className="about__row-main">
            <span className="about__row-title">{title}</span>
            <span className="about__row-note">{note}</span>
          </span>
          <span className="about__chev" aria-hidden="true">
            ›
          </span>
        </button>
      ))}

      <p className="about__eyebrow about__eyebrow--dim">Version</p>
      <p className="about__row about__row--static">
        <span className="about__row-title">{versionLine()}</span>
      </p>

      <p className="about__eyebrow about__eyebrow--dim">Open source</p>
      {REPO_SLUG === '' ? (
        <p className="about__row about__row--static">
          <span className="about__row-note">The source is public; this build does not know its repository.</span>
        </p>
      ) : (
        <a className="about__row" href={`https://github.com/${REPO_SLUG}`} target="_blank" rel="noreferrer">
          <span className="about__row-main">
            <span className="about__row-title">github.com/{REPO_SLUG}</span>
            <span className="about__row-note">Read the code; every number in the app is worked out there.</span>
          </span>
          <span className="about__chev" aria-hidden="true">
            ›
          </span>
        </a>
      )}

      <p className="about__foot">
        <span>Free · open source · no account</span>
      </p>
    </div>
  )
}

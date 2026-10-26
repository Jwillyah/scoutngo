import { buildLabel } from '../lib/build.ts'
import type { ReadFile } from '../lib/scoutFile.ts'
import { BackupFile } from './BackupFile.tsx'
import { ApiKeyField } from './ApiKeyField.tsx'
import { StorageProbe } from './StorageProbe.tsx'

/*
 * ABOUT: WHY THIS EXISTS, HOW IT WORKS, YOURS.
 *
 * FROM THE MENU. The units and the clock moved out to Settings, beside it in
 * the same menu (SettingsSheet.tsx), so this is the story, the key and the
 * backup.
 *
 * THE SAME CONTENT AS /how, NOT A SECOND COPY. The three HOW IT WORKS rows
 * open the matching section of the /how page rather than restating it here.
 * Two pages saying the same thing is two pages to keep true, and the one
 * nobody opens is the one that goes stale.
 *
 * THE OPENING COPY IS A PLACEHOLDER. It is the shooter's own words from the
 * mockup and he has said he will rewrite it; it is reproduced here unpolished
 * and deliberately not improved, because editing somebody's account of why
 * they built their own tool is not a thing to do uninvited.
 */

export type HowSection = 'computed' | 'leaves' | 'refuses'

interface AboutSheetProps {
  /** Opens /how at the matching section. One content, two entry points. */
  onHow: (section: HowSection) => void
  onKit: () => void
  onSpots: () => void
  onApiKey: () => void
  kitLine: string
  spotsLine: string
  apiKeyLine: string
  /** Export and import, one file. See BackupFile.tsx. */
  onExport: () => void
  onImport: (file: ReadFile) => string
}

export function AboutSheet({
  onHow,
  onKit,
  onSpots,
  onApiKey,
  kitLine,
  spotsLine,
  apiKeyLine,
  onExport,
  onImport,
}: AboutSheetProps) {
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
          ['leaves', 'What leaves your device', 'No account, no database, no tracking.'],
          ['refuses', 'What it will not tell you', 'It never says an area is clear. Check the airspace yourself.'],
        ] as const
      ).map(([section, title, note]) => (
        <button type="button" className="about__row" key={section} onClick={() => onHow(section)}>
          <span className="about__row-main">
            <span className="about__row-title">{title}</span>
            <span className="about__row-note">{note}</span>
          </span>
          <span className="about__chev" aria-hidden="true">
            ›
          </span>
        </button>
      ))}

      <ApiKeyField />

      <p className="about__eyebrow about__eyebrow--dim">Yours</p>
      {(
        [
          ['kit', 'Your kit', kitLine, onKit],
          ['spots', 'Your spots', spotsLine, onSpots],
          ['key', 'Your API key', apiKeyLine, onApiKey],
        ] as const
      ).map(([id, title, line, go]) => (
        <button type="button" className="about__row" key={id} onClick={go}>
          <span className="about__row-title">{title}</span>
          <span className="about__row-note">
            {line} <span aria-hidden="true">›</span>
          </span>
        </button>
      ))}

      {/*
        * THE BACKUP, beside the things it backs up. Clearing Safari's data
        * wipes localStorage, and that was the only place the kit lived.
        */}
      <p className="about__eyebrow about__eyebrow--dim">Backup</p>
      <BackupFile onExport={onExport} onImport={onImport} />

      <p className="about__eyebrow about__eyebrow--dim">Does clearing Safari erase this?</p>
      <StorageProbe />

      <p className="about__foot">
        <span>Free · open source · no account</span>
        <span className="num">{buildLabel()}</span>
      </p>
    </div>
  )
}

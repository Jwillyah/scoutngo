import { RADII_MI, type ColorWord, type RadiusMi } from '../core/bestSky.ts'
import { radiusWords } from '../core/bestSkyWords.ts'

/*
 * WHERE'S THE COLOR? THE PIECES ALL THREE PAGES SHARE (Batch BEST SKY,
 * Sections 3-5): the word on a scale and the radius, which is one choice for
 * the three pages.
 */
export function WordPill({ word }: { word: ColorWord }) {
  return <span className={`bsky__pill bsky__pill--${word.toLowerCase()}`}>{word}</span>
}

export function RadiusChips({ radius, miles, onRadius }: { radius: RadiusMi; miles: boolean; onRadius: (r: RadiusMi) => void }) {
  return (
    <div className="bsky__radii" role="radiogroup" aria-label="Within">
      {RADII_MI.map((r) => (
        <button key={r} type="button" role="radio" aria-checked={r === radius} className={`bsky__radius${r === radius ? ' bsky__radius--on' : ''}`} onClick={() => onRadius(r)}>
          {radiusWords(r, miles)}
        </button>
      ))}
    </div>
  )
}

import type { CardKind } from '../lib/sheetCard.ts'
import type { ForecastAge } from '../lib/savedForecast.ts'

/*
 * FOUR CHIPS, TWO LINES EACH, FIXED.
 *
 * THE RULE IS IN docs/chips.md AND THE AUDIT ENFORCES IT: a chip earns its
 * place only if its value could make you not go. Wind grounds the drone,
 * cloud kills the light, time-left means you missed it, tide means the
 * sandbar is under water. Moon phase, focal length, airspace class and NPF
 * are looked up AFTER deciding to go; those are cards.
 *
 * TWO LINES, AND THE SECOND LINE CARRIES ITS UNIT. One line cannot hold a
 * readable label and a unit in seven characters, which is why the row this
 * replaces read "GOLD 48" and "W 14" -- a number with no statement of what it
 * is a number OF. The label says what, the value says how much and in what.
 *
 * FIXED WIDTHS, NOT A SCROLL. Four equal columns filling the row. A scrolling
 * row has no limit, so it never forces the question "which one comes out",
 * and it grows until nothing on it is findable. The limit is the point.
 *
 * A MISSING VALUE IS A DASH, not a zero and not a hidden chip. The chip is
 * about whether to go; "the forecast did not say" is an answer to that and a
 * blank space is not.
 */

/** What a chip with nothing to report says. Never a dash: see below. */
/* A dash, never a bare "no data": the status line under the chips says why (field test, 30 Oct). */
export const NO_DATA = '—'

export interface Chip {
  /** Which card this opens. Also what marks it active. */
  /* A card to open, or 'tide', which opens the Tides page (29 Oct): a page, not a card in the sheet. */
  kind: CardKind | 'tide'
  /** 8px, uppercase. What the number is OF. */
  label: string
  /**
   * The label when its age rides beside it ("CLOUD 3h ago"): "CLOUD L·M·H 3h ago"
   * did not fit and was cut (29 Oct, docs/ux-rules.md 4: shorten the words).
   */
  shortLabel?: string
  /*
   * NULL WHERE THE READING DID NOT ARRIVE, and the chip says so in words.
   *
   * IT WAS THE STRING '—'. A dash is this app's mark for "nobody said", and
   * it is right in a sentence -- "Gusting – kts" reads as a gap in the
   * forecast. On a chip it does not: a chip is four big characters on a
   * plate, and one small dash where a number should be reads as a thing that
   * failed to load. Three of them in a row reads as a broken app.
   *
   * SO THE TYPE CARRIES IT rather than the spelling. A `string` field means
   * every caller decides what absence looks like, and they would not all
   * decide the same thing; `string | null` means the chip decides, once.
   */
  value: string | null
  /**
   * A unit set smaller after the value, for a value whose unit does not fit
   * at full size: a clock time's unit is its zone, and "10:29 EDT" at 14px is
   * two pixels wider than a chip. Still part of the value line, so the value
   * never reads as a bare number.
   */
  unit?: string
  /**
   * Whether this chip is the one worth looking at right now -- golden hour
   * running out, wind over the aircraft's rating. Lit, not coloured by rule:
   * see src/core/colorRole.ts, the hue still means what it means.
   */
  urgent?: boolean
  /**
   * STARTING SOON, which is not a hazard: golden hour with under an hour of
   * it left. Amber, the sun's own colour. Red is only ever a reason not to
   * go (src/core/colorRole.ts), and a chip that read "47 m" in red said the
   * light was dangerous.
   */
  soon?: boolean
  /**
   * THE AGE OF A SAVED READING, which rides on the label. Null or absent for a
   * live one. A saved forecast on a chip with no age would be a stale value
   * rendered as current, which this app does not do.
   */
  age?: ForecastAge | null
  /** The whole reading in words, for a value shortened to fit ("87·20·0" is "Low 87 · Mid 20 · High 0"). */
  spoken?: string
  /** A short second word under the value, small: "models split". */
  note?: string
}

interface ChipRowProps {
  chips: readonly Chip[]
  /**
   * THE ONE STATUS LINE OVER THE MAP (docs/ux-rules.md, 2 and 13): with no
   * signal, "Offline · using saved data from 9:12 AM". A row of the chip grid,
   * so the chrome the sheet and the labels keep clear of is measured with it.
   */
  status?: string | null
  /** When set, the status line is a button: special light on now opens its list. */
  onStatus?: () => void
  /** The card currently open, so its chip shows as active. */
  active: CardKind | 'tide' | null
  onOpen: (kind: CardKind | 'tide') => void
  /*
   * REPORTS THE ROW'S OWN BOTTOM EDGE, so the sheet knows how much chrome is
   * above it and does not grow up behind the chips at FULL. See reservedTop
   * in BottomSheet.tsx.
   */
  measureRef?: (node: HTMLDivElement | null) => void
}

/*
 * A TOOLBAR, NOT A GROUP.
 *
 * role was "group" and the segment-reachability audit -- which walks every
 * group of aria-pressed buttons and requires each segment to reach every
 * other -- picked the chip row up as a segmented control. It is not one.
 * Clicking a chip REPLACES THE SHEET'S CONTENT, so clicking one unmounted the
 * platform filter the audit was in the middle of walking, and the audit
 * reported "group gone" six times for a control that was working.
 *
 * The distinction is real rather than convenient: role="group" is a set of
 * related form controls, which the platform filter is; role="toolbar" is a
 * collection of commonly used controls, which is exactly what this is. The
 * chips are navigation that happens to show a reading.
 *
 * aria-pressed STAYS. A chip genuinely is pressed or not -- its card is open
 * or it is not -- and that is what the lit border means.
 */
export function ChipRow({ chips, active, onOpen, measureRef, status = null, onStatus }: ChipRowProps) {
  return (
    <div className="chips2" ref={measureRef} role="toolbar" aria-label="Conditions">
      {chips.map((chip) => (
        <button
          type="button"
          key={chip.kind}
          className={[
            'chip2',
            active === chip.kind ? 'chip2--on' : '',
            chip.urgent === true ? 'chip2--urgent' : '',
            chip.soon === true ? 'chip2--soon' : '',
            /* The WHOLE chip dims, label included: the label is a promise of
             * a number, and a bright promise over "no data" is the thing
             * that read as broken. */
            chip.value === null ? 'chip2--none' : '',
            chip.age?.mark === 'marked' ? 'chip2--aged' : '',
            chip.age?.mark === 'dimmed' ? 'chip2--old' : '',
          ]
            .filter((c) => c !== '')
            .join(' ')}
          aria-pressed={active === chip.kind}
          aria-label={chip.spoken}
          title={chip.spoken}
          onClick={() => onOpen(chip.kind)}
        >
          <span className="chip2__label">
            {chip.age === null || chip.age === undefined ? chip.label : (chip.shortLabel ?? chip.label)}
            {chip.age === null || chip.age === undefined ? null : (
              <span className="chip2__age">
                {/* The short form: an 8px label has no room for "3 h old". The card says it in full. */}
                {chip.age.mark === 'dimmed' ? ` old ${chip.age.short}` : ` ${chip.age.short} ago`}
              </span>
            )}
          </span>
          {/* A value past seven characters ("38 m left") is set a size down rather than cut. */}
          <span className={`chip2__value${chip.value === null ? '' : ' num'}${(chip.value?.length ?? 0) > 7 ? ' chip2__value--long' : ''}`}>
            {chip.value ?? NO_DATA}
            {chip.value === null || chip.unit === undefined ? null : (
              <span className="chip2__unit"> {chip.unit}</span>
            )}
          </span>
          {chip.note === undefined ? null : <span className="chip2__note">{chip.note}</span>}
        </button>
      ))}
      {status === null ? null : onStatus === undefined ? (
        <p className="offline-line" role="status">
          {status}
        </p>
      ) : (
        <button type="button" className="offline-line offline-line--btn" onClick={onStatus}>
          {status}
        </button>
      )}
    </div>
  )
}

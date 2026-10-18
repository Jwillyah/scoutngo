import {
  canBeDeciduous,
  HAZARD_KINDS,
  isHazard,
  MARK_LABEL,
  NOTE_KINDS,
  tallyMarks,
  type MarkKind,
  type SiteMark,
} from '../core/siteMark.ts'
import { LEAF_COPY } from '../core/leaf.ts'
import { leafState } from '../core/leaf.ts'

interface HazardPanelProps {
  marks: readonly SiteMark[]
  /** Which kind the next mark will be. */
  kind: MarkKind
  onKind: (next: MarkKind) => void
  /** Point or line. A span of wire is a line; a tree is a dot. */
  drawing: 'point' | 'line'
  onDrawing: (next: 'point' | 'line') => void
  /** Vertices of the line being drawn. Not a mark until it is finished. */
  draft: readonly { lat: number; lon: number }[]
  onFinishLine: () => void
  onCancelLine: () => void
  /** The mark whose editor is open, or null. */
  selected: SiteMark | null
  onSelect: (id: string | null) => void
  onChange: (
    id: string,
    change: Partial<Pick<SiteMark, 'kind' | 'heightMeters' | 'foliage' | 'note'>>,
  ) => void
  onDelete: (id: string) => void
  /** Marking mode: the tap mode that puts a mark on the map. */
  marking: boolean
  onMarking: (next: boolean) => void
  /** The shoot date and the venue latitude, for the leaf answer. */
  date: string
  latitude: number | null
}

/**
 * MARKING WHAT IS DANGEROUS AND WHAT IS IN THE WAY.
 *
 * "This site is full of power lines. I want the map to carry what is dangerous
 * and what is in the way, the way a chart carries obstructions."
 *
 * THE SHOOTER'S OWN MARKS ARE THE PRIMARY PATH, not a fallback: "I was
 * standing there and OSM was not." OSM's power layer fills in around them and
 * is drawn dashed so the two are never confused.
 *
 * WHAT THIS PANEL NEVER SAYS. There is no summary line reading "no hazards
 * here", no green state, and no tick. It reports COUNTS, and when the count is
 * zero it says nothing is marked, which is a fact about this list rather than a
 * claim about the site. The difference matters more here than anywhere else in
 * the app: a drone meeting an unmarked wire is the worst failure it can have,
 * and it must be structurally impossible for the app to have promised
 * otherwise. See the hard rule in src/core/siteMark.ts.
 */
export function HazardPanel({
  marks,
  kind,
  onKind,
  drawing,
  onDrawing,
  draft,
  onFinishLine,
  onCancelLine,
  selected,
  onSelect,
  onChange,
  onDelete,
  marking,
  onMarking,
  date,
  latitude,
}: HazardPanelProps) {
  const tally = tallyMarks(marks)

  if (selected !== null) {
    const leaf = latitude === null ? null : leafState(date, latitude)
    return (
      <div className="hz hz--editing">
        <div className="hz__head">
          <span className="hz__title">{MARK_LABEL[selected.kind]}</span>
          <button type="button" className="hz__x" onClick={() => onSelect(null)} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="hz__row">
          <label className="hz__field">
            <span className="hz__label">What</span>
            <select
              className="hz__select"
              value={selected.kind}
              onChange={(e) => onChange(selected.id, { kind: e.target.value as MarkKind })}
            >
              <optgroup label="Hazard">
                {HAZARD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MARK_LABEL[k]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Note">
                {NOTE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MARK_LABEL[k]}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {/*
            * HEIGHT IS BLANK UNTIL SAID, and blank is a real answer: the mark
            * is drawn either way, it simply takes no part in the sightline
            * check. A default height would put an invented number into the
            * geometry that decides whether a position works.
            */}
          <label className="hz__field hz__field--num">
            <span className="hz__label">Roughly</span>
            <input
              className="hz__num num"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="—"
              aria-label="Roughly how tall, in metres. Leave blank if unknown."
              value={selected.heightMeters ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim()
                const next = raw === '' ? null : Number(raw)
                onChange(selected.id, {
                  heightMeters: next === null || !Number.isFinite(next) || next <= 0 ? null : next,
                })
              }}
            />
            <span className="hz__unit">m tall</span>
          </label>
        </div>

        {/*
          * SOLID OR DECIDUOUS, asked only where the question means anything.
          * "A building blocks year round, an oak blocks in July and not in
          * January."
          */}
        {!canBeDeciduous(selected.kind) ? null : (
          <div className="hz__row">
            <label className="hz__field">
              <span className="hz__label">Leaves</span>
              <select
                className="hz__select"
                value={selected.foliage}
                onChange={(e) =>
                  onChange(selected.id, { foliage: e.target.value as 'solid' | 'deciduous' })
                }
              >
                <option value="deciduous">Loses them in winter</option>
                <option value="solid">Evergreen</option>
              </select>
            </label>
            {selected.foliage !== 'deciduous' || leaf === null ? null : (
              <p className="hz__leaf">On your date: {LEAF_COPY[leaf]}.</p>
            )}
          </div>
        )}

        <label className="hz__field">
          <span className="hz__label">Note</span>
          <input
            className="hz__text"
            type="text"
            value={selected.note}
            placeholder="Anything worth knowing next time"
            onChange={(e) => onChange(selected.id, { note: e.target.value })}
          />
        </label>

        <div className="hz__foot">
          {/* Where it came from, because the three are different claims. */}
          <span className="hz__src">
            {selected.source === 'osm'
              ? 'From OpenStreetMap'
              : selected.source === 'model'
                ? 'Proposed, not confirmed'
                : 'You marked this'}
          </span>
          <button type="button" className="hz__del" onClick={() => onDelete(selected.id)}>
            Delete
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="hz">
      {/*
        * THE HEAD IS A MODE TOGGLE NOW, NOT A CLOSE BUTTON.
        *
        * The panel used to float, so "Done" meant "get this off my map" and
        * closing it was how you stopped marking. It is a section in the sheet
        * now and the sheet's detent is what hides it, so the only thing left
        * for a control here to do is the thing that was always conflated with
        * closing: arm or disarm the tap mode that puts a mark down.
        */}
      <button
        type="button"
        className={`hz__arm${marking ? ' hz__arm--on' : ''}`}
        aria-pressed={marking}
        onClick={() => onMarking(!marking)}
      >
        {marking ? 'Tap the map to mark \u00b7 stop' : 'Start marking'}
      </button>

      <div className="hz__kinds" role="group" aria-label="What to mark">
        {[...HAZARD_KINDS, ...NOTE_KINDS].map((k) => (
          <button
            key={k}
            type="button"
            className={[
              'hz__kind',
              kind === k ? 'hz__kind--on' : '',
              isHazard(k) ? 'hz__kind--hazard' : 'hz__kind--note',
            ]
              .filter((c) => c !== '')
              .join(' ')}
            aria-pressed={kind === k}
            onClick={() => onKind(k)}
          >
            {MARK_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="hz__row">
        {/*
          * A SPAN OF WIRE IS A LINE, NOT A DOT. Marking 80 m of wire between
          * two poles as a point either misses most of it or lies about where
          * it is.
          */}
        <div className="hz__shape" role="group" aria-label="Point or line">
          {(['point', 'line'] as const).map((shape) => (
            <button
              key={shape}
              type="button"
              className={`hz__shape-btn${drawing === shape ? ' hz__shape-btn--on' : ''}`}
              aria-pressed={drawing === shape}
              onClick={() => onDrawing(shape)}
            >
              {shape === 'point' ? 'Point' : 'Line'}
            </button>
          ))}
        </div>

        {drawing === 'line' && draft.length > 0 ? (
          <div className="hz__draft">
            <span className="hz__draft-n num">{draft.length}</span>
            <button
              type="button"
              className="hz__done"
              disabled={draft.length < 2}
              onClick={onFinishLine}
            >
              Finish line
            </button>
            <button type="button" className="hz__cancel" onClick={onCancelLine}>
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <p className="hz__hint">
        {drawing === 'point'
          ? `Tap the map to mark a ${MARK_LABEL[kind].toLowerCase()}. Tap an existing mark to edit it.`
          : 'Tap along the span, then Finish line.'}
      </p>

      {/*
        * COUNTS, NEVER A VERDICT. "Nothing marked here" is true. "This area is
        * clear" is not, and there is no value in this component that could be
        * rendered as the second sentence.
        */}
      <p className="hz__tally">
        {tally.hazards === 0 && tally.notes === 0
          ? 'Nothing marked here yet.'
          : `${tally.hazards} ${tally.hazards === 1 ? 'hazard' : 'hazards'} and ${tally.notes} ${tally.notes === 1 ? 'note' : 'notes'} marked. ${tally.withHeight} of the hazards carry a height, so only those are checked against sightlines.`}
      </p>
      <p className="hz__caveat">
        Dashed marks are what OpenStreetMap has mapped. Transmission lines are
        mapped well there, local distribution much less so, so what is drawn is
        what is marked and nothing more.
      </p>
    </div>
  )
}

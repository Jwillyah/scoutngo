import { useMemo, useState } from 'react'
import type { ToolContext } from '../core/callSheetTools.ts'
import type { LatLon } from '../core/geo.ts'
import { moonrisePlan, type MoonriseInput } from '../core/moonrisePlan.ts'
import { moonriseIcs, moonriseIcsFilename } from '../core/moonriseIcs.ts'
import { CALL_SHEET_MODELS, readApiKey, readModelChoice } from '../lib/apiKey.ts'
import { writeCallSheet, type CallSheetOutcome } from '../lib/callSheet.ts'
import { MOONRISE_PROMPT, moonriseToolContext, nightWords, shotListText, shotWords } from '../lib/moonriseWords.ts'
import { saveText } from '../lib/saveText.ts'
import type { Units } from '../lib/units.ts'

/*
 * PLAN THIS MOONRISE, from Sky › Moon. The night, the times and the four
 * shots are the code's (src/core/moonrisePlan.ts) and are all here with no
 * key. With a key, "Word it" sends the worked-out list to the call sheet
 * model to reword, through the same number check as any call sheet.
 *
 * THE LINE-UP'S TARGET is the same pin the sun and moon finders use, and its
 * height is asked for here: the app does not know how tall a pier light is,
 * and a guessed height would put the shooter in the wrong place.
 */
interface MoonriseCardProps {
  input: Omit<MoonriseInput, 'target'>
  target: LatLon | null
  picking: boolean
  onPickTarget: () => void
  units: Units
  /** The call sheet's context, for wording with the shooter's key; null when the venue is not set. */
  context: ToolContext | null
  onOpenKey: () => void
}

const FT = 0.3048

export function MoonriseCard({ input, target, picking, onPickTarget, units, context, onOpenKey }: MoonriseCardProps) {
  const [heightText, setHeightText] = useState('')
  const [busy, setBusy] = useState(false)
  const [worded, setWorded] = useState<CallSheetOutcome | null>(null)
  const typed = Number(heightText)
  const heightMeters = heightText.trim() === '' || !Number.isFinite(typed) || typed <= 0 ? null : units.distance === 'ft' ? typed * FT : typed

  const result = useMemo(
    () => moonrisePlan({ ...input, target: target === null ? null : { at: target, heightMeters } }),
    [input, target, heightMeters],
  )

  if (result.status === 'none') return <p className="moonrise__none">{result.reason}</p>
  const { plan } = result
  const key = readApiKey()

  const word = async () => {
    if (context === null || key === null) return
    setBusy(true)
    setWorded(
      await writeCallSheet(MOONRISE_PROMPT, key, { ...context, moonrise: moonriseToolContext(plan, units) }, fetch, CALL_SHEET_MODELS[readModelChoice()]),
    )
    setBusy(false)
  }

  return (
    <div className="moonrise">
      <ul className="moonrise__night num">
        {nightWords(plan).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <ol className="moonrise__shots">
        {plan.shots.map((shot) => {
          const w = shotWords(plan, shot, units)
          return (
            <li key={shot.kind} className="moonrise__shot">
              <p className="moonrise__title">
                {w.title}
                {w.when === '' ? null : <span className="moonrise__when num"> {w.when}</span>}
              </p>
              {w.lines.map((line) => (
                <p key={line} className="moonrise__line num">
                  {line}
                </p>
              ))}
              {shot.kind === 'lineup' ? (
                <div className="moonrise__target">
                  <button type="button" className="btn btn--small" aria-pressed={picking} onClick={onPickTarget}>
                    {picking ? 'Tap the target on the map' : target === null ? 'Pick the target' : 'Move the target'}
                  </button>
                  <label className="field moonrise__height">
                    <span className="field__label">Target height</span>
                    <span className="moonrise__heightrow">
                      <input
                        className="input num"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={heightText}
                        onChange={(event) => setHeightText(event.target.value)}
                      />
                      <span>{units.distance === 'ft' ? 'ft above ground' : 'm above ground'}</span>
                    </span>
                  </label>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => saveText(moonriseIcs(plan, shotListText(plan, units)), 'text/calendar', moonriseIcsFilename(plan))}
        >
          Add to calendar
        </button>
        {key === null ? (
          <button type="button" className="btn btn--small" onClick={onOpenKey}>
            Add your API key to word it
          </button>
        ) : (
          <button type="button" className="btn btn--small" disabled={busy || context === null} onClick={() => void word()}>
            {busy ? 'Wording…' : 'Word it with Claude'}
          </button>
        )}
      </div>
      <p className="moonrise__note">
        Alarms at golden hour and 10 min before moonrise. Everything above is worked out on this phone; wording it sends
        the list, never the place, to Anthropic.
      </p>

      {worded === null ? null : worded.status === 'error' ? (
        <p className="callsheet__error">{worded.reason}</p>
      ) : (
        <div className="callsheet__out">
          {worded.check.ok ? (
            <p className="callsheet__check">Every number here came from the plan ({worded.check.checked} checked).</p>
          ) : (
            <p className="callsheet__check callsheet__check--fixed">
              Numbers the model made up were taken out: {worded.repaired.replaced.length} replaced, {worded.repaired.marked.length} marked.
            </p>
          )}
          <pre className="callsheet__text">{worded.text}</pre>
        </div>
      )}
    </div>
  )
}

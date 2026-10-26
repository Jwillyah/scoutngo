import { useState } from 'react'
import type { ToolContext } from '../core/callSheetTools.ts'
import { CALL_SHEET_MODELS, readApiKey, readModelChoice } from '../lib/apiKey.ts'
import { writeCallSheet, type CallSheetOutcome } from '../lib/callSheet.ts'
import { readPlaybook, savePlaybook } from '../lib/playbook.ts'

/*
 * THE CALL SHEET CARD. One box, "Tell it the shoot.", and a button.
 *
 * Typed or dictated with the keyboard's own microphone: the app does not use
 * the browser's speech recognition, which on most phones sends the audio to a
 * server the shooter did not choose. Reading the sheet aloud is speech
 * synthesis, which happens on the phone.
 *
 * WITHOUT A KEY the box says what it needs and where to put it, with the
 * control that opens it.
 */
interface CallSheetCardProps {
  context: ToolContext | null
  onOpenKey: () => void
}

export function CallSheetCard({ context, onOpenKey }: CallSheetCardProps) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<CallSheetOutcome | null>(null)
  const [playbook, setPlaybook] = useState(readPlaybook)
  const key = readApiKey()

  if (key === null) {
    return (
      <div className="callsheet">
        <p className="callsheet__say">
          The call sheet is written by Claude on your own Anthropic API key, kept on this phone. With no key there is nothing to
          call. Add one in About, under Your API key.
        </p>
        <button type="button" className="btn btn--primary" onClick={onOpenKey}>
          Add your API key
        </button>
      </div>
    )
  }

  const write = async () => {
    if (context === null) return
    setBusy(true)
    setOutcome(await writeCallSheet(prompt, key, { ...context, playbook }, fetch, CALL_SHEET_MODELS[readModelChoice()]))
    setBusy(false)
  }

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }

  return (
    <div className="callsheet">
      <label className="field">
        <span className="field__label">Tell it the shoot.</span>
        <textarea
          className="input callsheet__box"
          rows={4}
          value={prompt}
          placeholder="Who, what, the deliverables. Your keyboard's microphone works here."
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <p className="callsheet__note">
        Sends what you type and the app's own times, distances and kit to Anthropic, only when you press Write. The venue's
        coordinates are not sent.
      </p>
      <button type="button" className="btn btn--primary" disabled={busy || prompt.trim() === '' || context === null} onClick={() => void write()}>
        {busy ? 'Writing…' : context === null ? 'Set the venue and window first' : 'Write the call sheet'}
      </button>

      {outcome === null ? null : outcome.status === 'error' ? (
        <p className="callsheet__error">{outcome.reason}</p>
      ) : (
        <div className="callsheet__out">
          {outcome.check.ok ? (
            <p className="callsheet__check">Every number here came from the app or from what you typed ({outcome.check.checked} checked).</p>
          ) : (
            <div className="callsheet__check callsheet__check--fixed">
              <p>Numbers the model made up were taken out:</p>
              <ul>
                {outcome.repaired.replaced.map((r) => (
                  <li key={`${r.was}-${r.now}`} className="num">
                    {r.was} replaced with the app's {r.label}, {r.now}
                  </li>
                ))}
                {outcome.repaired.marked.map((m) => (
                  <li key={m} className="num">
                    {m} has no value in the app; it is marked in the sheet
                  </li>
                ))}
              </ul>
            </div>
          )}
          <pre className="callsheet__text">{outcome.text}</pre>
          <button type="button" className="btn btn--small" onClick={() => speak(outcome.text)}>
            Read it aloud
          </button>
        </div>
      )}

      <details className="callsheet__playbook">
        <summary>Your playbook</summary>
        <textarea
          className="input"
          rows={5}
          value={playbook}
          onChange={(e) => {
            setPlaybook(e.target.value)
            savePlaybook(e.target.value)
          }}
        />
        <p className="callsheet__note">Kept on this phone. The call sheet follows it.</p>
      </details>
    </div>
  )
}

import { useState } from 'react'
import { deleteApiKey, readApiKey, saveApiKey } from '../lib/apiKey.ts'

/*
 * YOUR API KEY, in About. Stored on this phone and nowhere else, never in a
 * backup file, sent only to Anthropic when a call sheet is written, and gone
 * with one tap. Shown only as its last four characters once saved.
 */
export function ApiKeyField() {
  const [stored, setStored] = useState(readApiKey)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="apikey">
      <p className="about__eyebrow about__eyebrow--dim">Your API key</p>
      <p className="apikey__say">
        For the call sheet. Your own Anthropic key, kept on this phone only, sent only to Anthropic when you press Write, and never
        put in a backup file.
      </p>
      {stored === null ? (
        <>
          <label className="field">
            <span className="field__label">Anthropic API key</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="sk-ant-…"
            />
          </label>
          <button
            type="button"
            className="btn btn--small"
            disabled={draft.trim() === ''}
            onClick={() => {
              try {
                saveApiKey(draft)
                setStored(readApiKey())
                setDraft('')
                setNote('Saved on this phone.')
              } catch {
                setNote('This browser would not store it.')
              }
            }}
          >
            Save key
          </button>
        </>
      ) : (
        <div className="btn-row">
          <span className="apikey__held num">Key ending {stored.slice(-4)}</span>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              deleteApiKey()
              setStored(null)
              setNote('Deleted from this phone.')
            }}
          >
            Delete key
          </button>
        </div>
      )}
      {note === null ? null : <p className="notice">{note}</p>}
    </div>
  )
}

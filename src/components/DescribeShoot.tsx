import type { DescribeState, DesiredShot } from '../lib/describe.ts'
import type { SearchHit } from '../lib/search.ts'

interface DescribeShootProps {
  text: string
  onText: (next: string) => void
  state: DescribeState
  onRead: () => void
  choices: SearchHit[]
  onPickVenue: (hit: SearchHit) => void
  shotListText: string
  onShotListText: (next: string) => void
  desiredShots: DesiredShot[]
}

/**
 * The one input at the front of SETUP.
 *
 * Type it, paste it, or dictate it with the keyboard's own microphone. There is
 * deliberately NO speech feature here: iOS already dictates into any text field,
 * so adding the Web Speech API would mean a second permission prompt and a
 * privacy note to buy something the keyboard does for free. The inputs are
 * multiline and roomy because that is what dictation needs.
 *
 * WHAT COMES BACK FILLS THE FORM BELOW, IT DOES NOT REPLACE IT. Every parsed
 * value lands in its normal input where it can be seen and corrected.
 */
export function DescribeShoot({
  text,
  onText,
  state,
  onRead,
  choices,
  onPickVenue,
  shotListText,
  onShotListText,
  desiredShots,
}: DescribeShootProps) {
  return (
    <div className="describe">
      <label className="describe__label" htmlFor="describe-shoot">
        What's the shoot?
      </label>
      <p className="describe__hint">
        Where, when, and what you want out of it. Type it, paste it, or use the
        microphone on your keyboard.
      </p>
      <textarea
        id="describe-shoot"
        className="describe__field"
        rows={5}
        value={text}
        placeholder="Boat docking at Brew River Salisbury Saturday 11 to 3, I'll be on the dock close up, want vertical cuts of boats hitting pilings and crowd reaction."
        onChange={(event) => onText(event.target.value)}
      />

      <button
        type="button"
        className="btn btn--primary describe__go"
        onClick={onRead}
        disabled={state.status === 'working' || text.trim() === ''}
      >
        {state.status === 'working' ? 'Reading…' : 'Read it and fill the form'}
      </button>

      {state.status === 'done' ? (
        <p className="describe__note">
          Filled {state.filled} {state.filled === 1 ? 'field' : 'fields'} below. Check
          them and change anything that is wrong.
          {state.needsVenue
            ? ` No map match for "${state.searched}" — set the venue by hand or search for it.`
            : ''}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p className="describe__note describe__note--bad">{state.message}</p>
      ) : null}

      {state.status === 'raw' ? (
        <div className="describe__raw">
          <p className="describe__note describe__note--bad">{state.reason}</p>
          <pre>{state.raw === '' ? '(the response was empty)' : state.raw}</pre>
        </div>
      ) : null}

      {/*
        * SEVERAL MATCHES, SO THE SHOOTER PICKS. Guessing between two places with
        * the same name is exactly the kind of confident error this project
        * refuses to make.
        */}
      {choices.length === 0 ? null : (
        <div className="describe__choices">
          <p className="describe__label describe__label--small">
            {choices.length} places match. Which one?
          </p>
          {choices.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="describe__choice"
              onClick={() => onPickVenue(hit)}
            >
              {hit.label}
            </button>
          ))}
        </div>
      )}

      <label className="describe__label describe__label--second" htmlFor="describe-shots">
        Got a shot list? Paste it.
      </label>
      <p className="describe__hint">
        One shot per line. The plan has to cover these, and anything no position
        covers is marked in the shot list.
      </p>
      <textarea
        id="describe-shots"
        className="describe__field describe__field--short"
        rows={4}
        value={shotListText}
        placeholder={'Boats hitting the pilings\nCrowd reaction from the deck\nDrone establisher over the river'}
        onChange={(event) => onShotListText(event.target.value)}
      />
      {desiredShots.length === 0 ? null : (
        <ol className="describe__shots">
          {desiredShots.map((shot, index) => (
            <li className="describe__shot" key={shot.id}>
              <span className="describe__shot-n num">{index + 1}</span>
              <span>{shot.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

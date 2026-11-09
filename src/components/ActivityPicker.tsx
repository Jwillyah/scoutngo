import { useState } from 'react'
import { ACTIVITIES, type Activity } from '../core/homeDay.ts'
import { ACTIVITY_LINES, ACTIVITY_WORDS } from '../lib/activities.ts'
import { ActivityIcon } from './ActivityIcon.tsx'

/*
 * "WHAT DO YOU DO OUTSIDE?" (Batch M, Section 2; board "HOME 8 Nov ·
 * picker"). Asked once, after "Where do you go?", and changeable in Settings
 * › What I do. Several at once. Kept on this phone only. It orders the home
 * and shows or hides cards and tools; it never removes data.
 *
 * `sheet`: the first-run question over the home, with Done and Not now
 * (Not now keeps everything showing, and it is asked again next launch).
 * `inline`: the same choices as toggles, for Settings; each tap is kept.
 */
interface ActivityPickerProps {
  variant: 'sheet' | 'inline'
  value: readonly Activity[] | null
  onDone: (picked: Activity[]) => void
  onLater?: () => void
}

export function ActivityPicker({ variant, value, onDone, onLater }: ActivityPickerProps) {
  const [picked, setPicked] = useState<Activity[]>(() => [...(value ?? [])])
  const toggle = (a: Activity) => {
    const next = picked.includes(a) ? picked.filter((x) => x !== a) : [...picked, a]
    setPicked(next)
    if (variant === 'inline' && next.length > 0) onDone(next)
  }
  const list = (
    <ul className="actpick__list" role="group" aria-label="What do you do outside?">
      {ACTIVITIES.map((a) => {
        const on = picked.includes(a)
        return (
          <li key={a}>
            <button type="button" className={`actpick__opt${on ? ' actpick__opt--on' : ''}`} aria-pressed={on} onClick={() => toggle(a)}>
              <span className={`actpick__tile actpick__tile--${a}`}>
                <ActivityIcon activity={a} className="actpick__icon" />
              </span>
              <span className="actpick__text">
                <span className="actpick__word">{ACTIVITY_WORDS[a]}</span>
                <span className="actpick__line">{ACTIVITY_LINES[a]}</span>
              </span>
              <span className={`actpick__tick${on ? ' actpick__tick--on' : ''}`} aria-hidden="true">
                {on ? '✓' : ''}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
  if (variant === 'inline') {
    return (
      <div className="actpick actpick--inline">
        {list}
        <p className="actpick__note">Orders the home and shows the tools for what you pick. Kept on this phone only; nothing is hidden for good.</p>
      </div>
    )
  }
  /* Board Home8P: a page of its own over the home, the sky's ground, Continue at the bottom. */
  return (
    <div className="actpick actpick--sheet" role="dialog" aria-label="What do you do outside?">
      <div className="actpick__panel">
        <p className="actpick__brand">ScoutNGo</p>
        <h2 className="actpick__title">What do you do outside?</h2>
        <p className="actpick__sub">Pick any. Your home screen shows these first. Change anytime.</p>
        {list}
        <div className="actpick__end">
          <button type="button" className="actpick__done" disabled={picked.length === 0} onClick={() => onDone(picked)}>
            Continue
          </button>
          {onLater === undefined ? null : (
            <button type="button" className="actpick__later" onClick={onLater}>
              Not now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

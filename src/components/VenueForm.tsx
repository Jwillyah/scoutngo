import { useId, useState } from 'react'
import {
  CALIBRATION_VENUE,
  type VenueDraft,
  type VenueErrors,
  type VenueField,
} from '../lib/venue.ts'
import { Group, Panel } from './Panel.tsx'

interface VenueFormProps {
  value: VenueDraft
  errors: VenueErrors
  onChange: (next: VenueDraft) => void
  /**
   * Set when a submit has been attempted, which reveals every outstanding error
   * at once. The generate button will drive this. Until then, errors surface
   * only on a field the user actually visited and then left.
   */
  revealAllErrors?: boolean
}

interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: (props: { id: string; invalid: boolean; describedBy?: string }) => React.ReactNode
}

function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {hint === undefined ? null : <span className="field__hint"> {hint}</span>}
      </label>
      {children({
        id,
        invalid: error !== undefined,
        describedBy: error === undefined ? undefined : errorId,
      })}
      {error === undefined ? null : (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}

export function VenueForm({
  value,
  errors,
  onChange,
  revealAllErrors = false,
}: VenueFormProps) {
  /*
   * Nothing goes magenta until the user has been in the field and left it, or
   * until a submit is attempted. A field is only "touched" if it was focused
   * first, so a stray blur cannot light up a field nobody has been near.
   */
  const [visited, setVisited] = useState<VenueField[]>([])
  const [touched, setTouched] = useState<VenueField[]>([])

  const shownError = (field: VenueField) =>
    revealAllErrors || touched.includes(field) ? errors[field] : undefined

  const markVisited = (field: VenueField) => () => {
    setVisited((current) => (current.includes(field) ? current : [...current, field]))
  }

  const markTouched = (field: VenueField) => () => {
    if (!visited.includes(field)) return
    setTouched((current) => (current.includes(field) ? current : [...current, field]))
  }

  const set = (field: VenueField) => (next: string) => {
    onChange({ ...value, [field]: next })
  }

  const loadCalibration = () => {
    onChange(CALIBRATION_VENUE)
    setVisited([])
    setTouched([])
  }

  return (
    <Panel index="01" title="Venue and window">
      <div className="btn-row">
        <button type="button" className="btn btn--small" onClick={loadCalibration}>
          Load calibration venue
        </button>
      </div>
      <p className="section__note">
        Brew River Dock Bar, Salisbury MD. The venue with a known right answer, for
        testing fast.
      </p>

      <Group title="Position">
        <div className="stack">
          <Field label="Venue name" error={shownError('name')}>
            {({ id, invalid, describedBy }) => (
              <input
                id={id}
                className={`input${invalid ? ' input--invalid' : ''}`}
                type="text"
                autoComplete="off"
                value={value.name}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(event) => set('name')(event.target.value)}
                onFocus={markVisited('name')}
                onBlur={markTouched('name')}
              />
            )}
          </Field>

          <div className="row">
            <Field label="Latitude" hint="-90 to 90" error={shownError('latitude')}>
              {({ id, invalid, describedBy }) => (
                <input
                  id={id}
                  className={`input num${invalid ? ' input--invalid' : ''}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="38.3648"
                  value={value.latitude}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(event) => set('latitude')(event.target.value)}
                  onFocus={markVisited('latitude')}
                  onBlur={markTouched('latitude')}
                />
              )}
            </Field>

            <Field label="Longitude" hint="-180 to 180" error={shownError('longitude')}>
              {({ id, invalid, describedBy }) => (
                <input
                  id={id}
                  className={`input num${invalid ? ' input--invalid' : ''}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="-75.6069"
                  value={value.longitude}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(event) => set('longitude')(event.target.value)}
                  onFocus={markVisited('longitude')}
                  onBlur={markTouched('longitude')}
                />
              )}
            </Field>
          </div>
        </div>
      </Group>

      <Group title="Window">
        <div className="stack">
          <Field label="Date" error={shownError('date')}>
            {({ id, invalid, describedBy }) => (
              <input
                id={id}
                className={`input num${invalid ? ' input--invalid' : ''}`}
                type="date"
                value={value.date}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(event) => set('date')(event.target.value)}
                onFocus={markVisited('date')}
                onBlur={markTouched('date')}
              />
            )}
          </Field>

          <div className="row">
            <Field label="Start time" error={shownError('startTime')}>
              {({ id, invalid, describedBy }) => (
                <input
                  id={id}
                  className={`input num${invalid ? ' input--invalid' : ''}`}
                  type="time"
                  value={value.startTime}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(event) => set('startTime')(event.target.value)}
                  onFocus={markVisited('startTime')}
                  onBlur={markTouched('startTime')}
                />
              )}
            </Field>

            <Field label="End time" error={shownError('endTime')}>
              {({ id, invalid, describedBy }) => (
                <input
                  id={id}
                  className={`input num${invalid ? ' input--invalid' : ''}`}
                  type="time"
                  value={value.endTime}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(event) => set('endTime')(event.target.value)}
                  onFocus={markVisited('endTime')}
                  onBlur={markTouched('endTime')}
                />
              )}
            </Field>
          </div>
        </div>
      </Group>

      <Group title="Brief">
        <div className="stack">
          <Field
            label="What happens at this event"
            hint="plain language, what the day actually looks like"
          >
            {({ id }) => (
              <textarea
                id={id}
                className="textarea"
                value={value.eventDescription}
                onChange={(event) => set('eventDescription')(event.target.value)}
              />
            )}
          </Field>

          <Field label="What I want out of it" hint="the deliverable, not the gear">
            {({ id }) => (
              <textarea
                id={id}
                className="textarea"
                value={value.desiredOutcome}
                onChange={(event) => set('desiredOutcome')(event.target.value)}
              />
            )}
          </Field>
        </div>
      </Group>
    </Panel>
  )
}

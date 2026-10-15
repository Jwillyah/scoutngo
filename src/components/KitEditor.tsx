import { useState } from 'react'
import type { SensorName } from '../core/fov.ts'
import type { KitProfile } from '../core/kit.ts'
import {
  addBody,
  addDrone,
  addLens,
  hasFieldErrors,
  removeBody,
  removeDrone,
  removeLens,
  validateBody,
  validateDrone,
  validateLens,
  type BodyDraft,
  type DroneDraft,
  type FieldErrors,
  type LensDraft,
} from '../core/kitEdit.ts'

interface KitEditorProps {
  kit: KitProfile
  onChange: (next: KitProfile) => void
}

type Adding = 'none' | 'lens' | 'body' | 'drone'

const EMPTY_LENS: LensDraft = {
  name: '',
  minFocalLength: '',
  maxFocalLength: '',
  apscOnly: false,
}
const EMPTY_BODY: BodyDraft = { name: '', sensor: 'fullFrame' }
const EMPTY_DRONE: DroneDraft = { name: '', weightGrams: '', focalLengths: '' }

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="kitf">
      <span className="kitf__label">{label}</span>
      {children}
      {error === undefined ? (
        hint === undefined ? null : <span className="kitf__hint">{hint}</span>
      ) : (
        <span className="kitf__error">{error}</span>
      )}
    </label>
  )
}

/**
 * Adding and removing gear.
 *
 * THE KIT IS THE SHOOTER'S. It shipped as a constant lifted from the brief,
 * which meant buying a lens and being unable to use it, and every number on
 * every card is computed from these values.
 *
 * VALIDATION IS NOT POLITENESS. A focal range typed in backwards does not
 * produce a slightly wrong label, it produces a wrong field of view, a wrong
 * frame width and a wrong multiple against the subject size, each looking
 * exactly as confident as the right one. The rules live in src/core/kitEdit.ts with tests;
 * this form only renders what they say.
 */
export function KitEditor({ kit, onChange }: KitEditorProps) {
  const [adding, setAdding] = useState<Adding>('none')
  const [lens, setLens] = useState<LensDraft>(EMPTY_LENS)
  const [body, setBody] = useState<BodyDraft>(EMPTY_BODY)
  const [drone, setDrone] = useState<DroneDraft>(EMPTY_DRONE)
  const [errors, setErrors] = useState<FieldErrors>({})

  const close = () => {
    setAdding('none')
    setErrors({})
    setLens(EMPTY_LENS)
    setBody(EMPTY_BODY)
    setDrone(EMPTY_DRONE)
  }

  const submit = () => {
    if (adding === 'lens') {
      const found = validateLens(lens)
      setErrors(found)
      if (hasFieldErrors(found)) return
      onChange(addLens(kit, lens))
    }
    if (adding === 'body') {
      const found = validateBody(body)
      setErrors(found)
      if (hasFieldErrors(found)) return
      onChange(addBody(kit, body))
    }
    if (adding === 'drone') {
      const found = validateDrone(drone)
      setErrors(found)
      if (hasFieldErrors(found)) return
      onChange(addDrone(kit, drone))
    }
    close()
  }

  return (
    <div className="kited">
      <h3 className="kited__head">Your gear</h3>

      <ul className="kited__list">
        {kit.lenses.map((item) => (
          <li className="kited__row" key={item.id}>
            <span className="kited__name">{item.name}</span>
            <span className="kited__meta num">
              {item.minFocalLength === item.maxFocalLength
                ? `${item.minFocalLength}mm`
                : `${item.minFocalLength}–${item.maxFocalLength}mm`}
              {item.apscOnly === true ? ' · APS-C' : ''}
            </span>
            <button
              type="button"
              className="kited__del"
              onClick={() => onChange(removeLens(kit, item.id))}
              aria-label={`Remove ${item.name}`}
            >
              ✕
            </button>
          </li>
        ))}
        {kit.bodies.map((item) => (
          <li className="kited__row" key={item.id}>
            <span className="kited__name">{item.name}</span>
            <span className="kited__meta num">
              {item.sensor === 'apsc' ? 'APS-C' : 'Full frame'}
            </span>
            <button
              type="button"
              className="kited__del"
              onClick={() => onChange(removeBody(kit, item.id))}
              aria-label={`Remove ${item.name}`}
            >
              ✕
            </button>
          </li>
        ))}
        {kit.drones.map((item) => (
          <li className="kited__row" key={item.id}>
            <span className="kited__name">{item.name}</span>
            <span className="kited__meta num">
              {item.weightGrams}g · {item.cameras.map((c) => `${c.equiv35}mm`).join(' ')}
            </span>
            <button
              type="button"
              className="kited__del"
              onClick={() => onChange(removeDrone(kit, item.id))}
              aria-label={`Remove ${item.name}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {adding === 'none' ? (
        <div className="kited__adds">
          <button type="button" className="btn btn--small" onClick={() => setAdding('lens')}>
            Add lens
          </button>
          <button type="button" className="btn btn--small" onClick={() => setAdding('body')}>
            Add body
          </button>
          <button type="button" className="btn btn--small" onClick={() => setAdding('drone')}>
            Add drone
          </button>
        </div>
      ) : (
        <div className="kited__form">
          {adding === 'lens' ? (
            <>
              <Field label="Name" error={errors.name}>
                <input
                  className="kitf__input"
                  value={lens.name}
                  placeholder="Sony 70-200 GM II"
                  onChange={(e) => setLens({ ...lens, name: e.target.value })}
                />
              </Field>
              <div className="kited__pair">
                <Field label="Wide end" hint="mm" error={errors.minFocalLength}>
                  <input
                    className="kitf__input num"
                    inputMode="numeric"
                    value={lens.minFocalLength}
                    placeholder="70"
                    onChange={(e) => setLens({ ...lens, minFocalLength: e.target.value })}
                  />
                </Field>
                <Field label="Long end" hint="mm" error={errors.maxFocalLength}>
                  <input
                    className="kitf__input num"
                    inputMode="numeric"
                    value={lens.maxFocalLength}
                    placeholder="200"
                    onChange={(e) => setLens({ ...lens, maxFocalLength: e.target.value })}
                  />
                </Field>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  className="toggle__box"
                  checked={lens.apscOnly}
                  onChange={(e) => setLens({ ...lens, apscOnly: e.target.checked })}
                />
                <span className="toggle__text">
                  <span className="toggle__label">APS-C lens</span>
                  <span className="toggle__note">
                    It only covers a crop circle, so the frame is computed cropped on
                    every body.
                  </span>
                </span>
              </label>
            </>
          ) : null}

          {adding === 'body' ? (
            <>
              <Field label="Name" error={errors.name}>
                <input
                  className="kitf__input"
                  value={body.name}
                  placeholder="Sony a7IV"
                  onChange={(e) => setBody({ ...body, name: e.target.value })}
                />
              </Field>
              <Field label="Sensor" error={errors.sensor}>
                <select
                  className="kitf__input"
                  value={body.sensor}
                  onChange={(e) => setBody({ ...body, sensor: e.target.value as SensorName })}
                >
                  <option value="fullFrame">Full frame</option>
                  <option value="apsc">APS-C</option>
                </select>
              </Field>
            </>
          ) : null}

          {adding === 'drone' ? (
            <>
              <Field label="Name" error={errors.name}>
                <input
                  className="kitf__input"
                  value={drone.name}
                  placeholder="DJI Air 3S"
                  onChange={(e) => setDrone({ ...drone, name: e.target.value })}
                />
              </Field>
              <Field
                label="Weight"
                hint="Grams. The FAA category for flying over people turns on it."
                error={errors.weightGrams}
              >
                <input
                  className="kitf__input num"
                  inputMode="numeric"
                  value={drone.weightGrams}
                  placeholder="724"
                  onChange={(e) => setDrone({ ...drone, weightGrams: e.target.value })}
                />
              </Field>
              <Field
                label="Focal lengths"
                hint="35mm equivalents, comma separated. A drone camera is fixed, never a zoom."
                error={errors.focalLengths}
              >
                <input
                  className="kitf__input num"
                  value={drone.focalLengths}
                  placeholder="24, 70"
                  onChange={(e) => setDrone({ ...drone, focalLengths: e.target.value })}
                />
              </Field>
            </>
          ) : null}

          <div className="kited__formacts">
            <button type="button" className="btn btn--small" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary btn--small" onClick={submit}>
              Add it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

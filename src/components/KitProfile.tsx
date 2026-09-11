import { computeFOV, SENSORS } from '../core/fov.ts'
import { DEFAULT_KIT, resolveSensor, type Body, type Lens } from '../core/kit.ts'
import { defaultSelection, toggleId, type KitSelection } from '../lib/kitSelection.ts'
import { Group, Section } from './Section.tsx'

interface KitProfileProps {
  value: KitSelection
  onChange: (next: KitSelection) => void
  open: boolean
  onToggle: () => void
}

const oneDecimal = (n: number) => n.toFixed(1)

interface KitRowProps {
  active: boolean
  name: string
  /** Numeric readout line. Monospace, because it is numbers. */
  meta: string
  onToggle: () => void
}

/**
 * One row on paper. The square is the control, the whole row is the tap target,
 * and there is no native checkbox involved.
 */
function KitRow({ active, name, meta, onToggle }: KitRowProps) {
  return (
    <li className="kit-row">
      <button type="button" className="kit-row__btn" aria-pressed={active} onClick={onToggle}>
        <span className="kit-row__box" aria-hidden="true" />
        <span className="kit-row__text">
          <span className="kit-row__name">{name}</span>
          <span className="kit-row__meta num">{meta}</span>
        </span>
      </button>
    </li>
  )
}

/** The bodies still in play. Used only to resolve a forced sensor crop. */
function activeBodies(activeIds: string[]): Body[] {
  const chosen = DEFAULT_KIT.bodies.filter((b) => activeIds.includes(b.id))
  return chosen.length > 0 ? chosen : DEFAULT_KIT.bodies
}

function lensMeta(lens: Lens, bodies: Body[]): string {
  const sensorName = resolveSensor(lens, bodies)
  const sensor = SENSORS[sensorName]
  const range =
    lens.minFocalLength === lens.maxFocalLength
      ? `${lens.minFocalLength}mm`
      : `${lens.minFocalLength}-${lens.maxFocalLength}mm`

  const wide = computeFOV(lens.minFocalLength, sensor)
  const long = computeFOV(lens.maxFocalLength, sensor)
  const vertical =
    lens.minFocalLength === lens.maxFocalLength
      ? `${oneDecimal(wide.vFOV)}°`
      : `${oneDecimal(wide.vFOV)}-${oneDecimal(long.vFOV)}°`

  // Sensor is called out only when the lens forces a crop, because that is the
  // only time it is a surprise.
  const crop = sensorName === 'fullFrame' ? '' : ' APS-C'
  return `${range}${crop} · vFOV ${vertical}`
}

/** Two fixed cameras, not a zoom, so each is listed with its one focal length. */
function droneMeta(drone: (typeof DEFAULT_KIT.drones)[number]): string {
  const cameras = drone.cameras
    .map((c) => `${c.equiv35}mm f${c.maxAperture}`)
    .join(' · ')
  return `${drone.weightGrams}g · ${cameras}`
}

export function KitProfile({ value, onChange, open, onToggle }: KitProfileProps) {
  const bodies = activeBodies(value.bodyIds)
  const summary =
    `${value.bodyIds.length} bodies, ${value.lensIds.length} lenses, ` +
    `${value.droneIds.length} air`

  return (
    <Section index="02" title="Kit and style" summary={summary} open={open} onToggle={onToggle}>
      <p className="section__note">
        What is actually coming with you. Saved in this browser only, on this
        device. Nothing is sent anywhere.
      </p>

      <Group title="Bodies" meta={<span className="num">{value.bodyIds.length}</span>}>
        <ul className="kit-list">
          {DEFAULT_KIT.bodies.map((item) => (
            <KitRow
              key={item.id}
              active={value.bodyIds.includes(item.id)}
              name={item.name}
              meta={item.role}
              onToggle={() =>
                onChange({ ...value, bodyIds: toggleId(value.bodyIds, item.id) })
              }
            />
          ))}
        </ul>
      </Group>

      <Group title="Lenses" meta={<span className="num">{value.lensIds.length}</span>}>
        <ul className="kit-list">
          {DEFAULT_KIT.lenses.map((item) => (
            <KitRow
              key={item.id}
              active={value.lensIds.includes(item.id)}
              name={item.name}
              meta={lensMeta(item, bodies)}
              onToggle={() =>
                onChange({ ...value, lensIds: toggleId(value.lensIds, item.id) })
              }
            />
          ))}
        </ul>
        <p className="section__note group__foot">
          Vertical field of view, the number that matters for the deliverable.
          Positions no longer carry a body: the only way a body changes these
          numbers is the a7IV's forced APS-C crop, which is applied whenever that
          body is packed.
        </p>
      </Group>

      <Group title="Air" meta={<span className="num">{value.droneIds.length}</span>}>
        <ul className="kit-list">
          {DEFAULT_KIT.drones.map((item) => (
            <KitRow
              key={item.id}
              active={value.droneIds.includes(item.id)}
              name={item.name}
              meta={droneMeta(item)}
              onToggle={() =>
                onChange({ ...value, droneIds: toggleId(value.droneIds, item.id) })
              }
            />
          ))}
        </ul>
      </Group>

      <Group title="How I shoot">
        <div className="field">
          <label className="field__label" htmlFor="style-notes">
            Shooting style
            <span className="field__hint"> free text, the part that makes the plan yours</span>
          </label>
          <textarea
            id="style-notes"
            className="textarea"
            value={value.styleNotes}
            onChange={(event) => onChange({ ...value, styleNotes: event.target.value })}
          />
        </div>
      </Group>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => onChange(defaultSelection(DEFAULT_KIT))}
        >
          Reset to default kit
        </button>
      </div>
    </Section>
  )
}

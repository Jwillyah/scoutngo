import { computeFOV, SENSORS } from '../core/fov.ts'
import {
  resolveSensor,
  type Body,
  type KitProfile as KitProfileType,
  type Lens,
} from '../core/kit.ts'
import { KitEditor } from './KitEditor.tsx'
import { OnThisDevice } from './OnThisDevice.tsx'
import { useMemo } from 'react'
import { auditKit, kitAuditLines } from '../lib/kitAudit.ts'
import {
  defaultSelection,
  KIT_PROFILE_STORAGE_KEY,
  pickableKit,
  toggleId,
  type KitSelection,
} from '../lib/kitSelection.ts'
import { Group, Panel } from './Panel.tsx'

interface KitProfileProps {
  value: KitSelection
  onChange: (next: KitSelection) => void
  /** The shooter's own gear. Editable: see KitEditor below. */
  kit: KitProfileType
  onKitChange: (next: KitProfileType) => void
  /** Shelved gear: never in these lists, never ticked. The editor below lists it. */
  shelved?: readonly string[]
  onShelve?: (id: string, on: boolean) => void
  /** A change made to the kit on this load, said rather than done silently. */
  note?: string | null
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
function activeBodies(kit: KitProfileType, activeIds: string[]): Body[] {
  const chosen = kit.bodies.filter((b) => activeIds.includes(b.id))
  return chosen.length > 0 ? chosen : kit.bodies
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
function droneMeta(drone: KitProfileType['drones'][number]): string {
  const cameras = drone.cameras
    .map((c) => `${c.equiv35}mm f${c.maxAperture}`)
    .join(' · ')
  return `${drone.weightGrams}g · ${cameras}`
}

export function KitProfile({
  value,
  onChange,
  kit,
  onKitChange,
  shelved = [],
  onShelve,
  note = null,
}: KitProfileProps) {
  const bodies = activeBodies(kit, value.bodyIds)
  /* What the bag can be packed from: everything owned, nothing shelved. */
  const pickable = pickableKit(kit, shelved)

  /*
   * WHAT IS IN STORAGE, AGAINST THE SHIPPED LIST.
   *
   * A stored SELECTION used to be revived against the shipped kit rather than
   * against this one, so gear added by hand came back unticked on every
   * reload, silently. The gear itself survived; the packing list did not, and
   * a spot saved in that state recorded the loss.
   *
   * It is fixed, but "did I lose anything" is a question about THIS device
   * that no amount of fixing answers. So the kit screen answers it, reading
   * the raw storage back and comparing. It prints only facts about storage:
   * no lines means nothing to report, and there is no line that says the kit
   * is fine. See src/lib/kitAudit.ts.
   */
  const audit = useMemo(() => {
    let raw: unknown = null
    try {
      const stored = localStorage.getItem(KIT_PROFILE_STORAGE_KEY)
      raw = stored === null ? null : (JSON.parse(stored) as unknown)
    } catch {
      /* Storage blocked or unparseable. Reported as a replaced profile below. */
      raw = {}
    }
    return auditKit(raw, kit, value)
  }, [kit, value])
  const news = kitAuditLines(audit)

  return (
    <Panel index="02" title="Kit and style">
      <p className="section__note">What is actually coming with you.</p>
      <OnThisDevice what="kit and gear" />
      {note === null ? null : <p className="section__note kit__changed">{note}</p>}

      {news.length === 0 ? null : (
        <ul className="kitaudit">
          {news.map((line) => (
            <li className={`kitaudit__line kitaudit__line--${line.tone}`} key={line.text}>
              {line.text}
            </li>
          ))}
        </ul>
      )}

      <Group title="Bodies" meta={<span className="num">{value.bodyIds.length}</span>}>
        <ul className="kit-list">
          {pickable.bodies.map((item) => (
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
          {pickable.lenses.map((item) => (
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
          {pickable.drones.map((item) => (
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

      {shelved.length === 0 ? null : (
        <p className="section__note num">
          {shelved.length} shelved: yours, never offered. They are listed under Your gear.
        </p>
      )}
      <KitEditor kit={kit} onChange={onKitChange} shelved={shelved} onShelve={onShelve} />

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => onChange(defaultSelection(kit, shelved))}
        >
          Reset to default kit
        </button>
      </div>
    </Panel>
  )
}

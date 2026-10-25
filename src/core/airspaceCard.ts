/*
 * THE AIRSPACE CARD, IN PLAIN WORDS.
 *
 * What is over a point, said the way a person would say it before deciding
 * whether to put a drone up: "Controlled airspace. Needs LAANC. Grid ceiling
 * here: 200 ft." Each line carries a short main sentence and a detail line;
 * an expert term, where one is needed, is in the detail.
 *
 * NEVER A PERMISSION. Nothing here says a flight is allowed or an area is
 * open. When nothing is found, the card says what was checked and that
 * today's temporary restrictions were not, every time, because an empty
 * answer is a statement about a dated, generalised extract.
 */
import { floorReaches, type ParkUnit, type SpecialUseArea } from './restrictions.ts'

export type CardTone = 'hazard' | 'authorization' | 'note'

export interface CardLine {
  tone: CardTone
  text: string
  detail: string
}

export interface AirspaceAtPoint {
  /** Surface-area classes over the point: 'B', 'C', 'D', 'E'. */
  classes: readonly string[]
  /** The facility map's ceiling in feet above ground, or null when the grid has no cell here. */
  gridCeilingFeet: number | null
  specialUse: readonly SpecialUseArea[]
  /** Every park unit over the point. Units overlap: a scenic trail runs through a park. */
  parks: readonly ParkUnit[]
  /** The height the card is judged at, for whether an area's floor reaches it. */
  droneFeet: number
}

const withCommas = (n: number) => n.toLocaleString('en-US')

function floorWords(area: SpecialUseArea): string {
  if (area.floor === null || area.floor === 0) return 'from the ground up'
  if (area.floorRef === 'MSL') return `from ${withCommas(area.floor)} ft above sea level`
  if (area.floorRef === 'STD' || area.floorUom === 'FL') return `from flight level ${area.floor}`
  return `from ${withCommas(area.floor)} ft above the ground`
}

/*
 * SAID AS WHAT THE APP HOLDS, NOT AS WHAT THE SKY IS. "No controlled airspace
 * here" would be a statement about the world from a dated, generalised file,
 * which is the shape of saying an area is clear.
 */
export const CHECKED_NOTHING = 'Nothing the app holds is marked at this point. That is not permission to fly.'

export const CHECKED_DETAIL =
  'Checked against the FAA class airspace, facility map grid and special use airspace, ' +
  'and the National Park Service boundaries, all baked into the app and generalised at their edges.'

/** Every card ends with this. Today's restrictions are never checked by the app. */
export const TODAY_LINE: CardLine = {
  tone: 'note',
  text: "Check today's flight restrictions before you fly.",
  detail: 'Temporary flight restrictions (TFRs) and NOTAMs are not checked by this app. See tfr.faa.gov.',
}

export function airspaceCard(at: AirspaceAtPoint): CardLine[] {
  const lines: CardLine[] = []

  for (const park of at.parks) {
    lines.push({
      tone: 'hazard',
      /* The brief's words for a national park; a trail or seashore is NPS land, not "a national park". */
      /* The baked UNIT_TYPE is plural: "National Parks", "National Scenic Trails". */
      text: /^national parks?$/i.test(park.unitType.trim())
        ? `${park.name}. No drone launch in a national park.`
        : `${park.name}. No drone launch on National Park Service land.`,
      detail:
        'Launching, landing or flying a drone from inside a park unit is closed under 36 CFR 1.5 ' +
        '(National Park Service policy memorandum 14-05).',
    })
  }

  for (const area of at.specialUse) {
    const reach = floorReaches(area, at.droneFeet)
    const prefix = area.type === 'P' ? 'Prohibited area' : 'Restricted area'
    const when = area.times.trim() === '' ? '' : ` In use: ${area.times.trim()}.`
    const who = area.agency.trim() === '' ? '' : ` Controlled by ${area.agency.trim()}.`
    if (reach === 'above') {
      lines.push({
        tone: 'note',
        text: `${prefix} ${area.name} overhead, ${floorWords(area)}.`,
        detail: `Its floor is above ${at.droneFeet} ft here.${who}${when}`,
      })
      continue
    }
    lines.push({
      tone: 'hazard',
      text:
        area.type === 'P'
          ? `${prefix} ${area.name}. No flying.`
          : `${prefix} ${area.name}. No flying without the controlling agency.`,
      detail:
        `Charted ${floorWords(area)}` +
        (reach === 'may-reach' ? ', which may reach the ground here' : '') +
        `.${who}${when}`,
    })
  }

  const controlled = at.classes.filter((c) => ['B', 'C', 'D', 'E'].includes(c))
  if (controlled.length > 0) {
    const named = `Class ${[...new Set(controlled)].sort().join(' and ')}`
    if (at.gridCeilingFeet === null) {
      lines.push({
        tone: 'authorization',
        text: 'Controlled airspace. Needs LAANC. No grid ceiling mapped here.',
        detail: `${named} surface area. The facility map has no cell at this point, so the request goes to the FAA without a preset ceiling.`,
      })
    } else if (at.gridCeilingFeet === 0) {
      lines.push({
        tone: 'authorization',
        text: 'Controlled airspace. Grid ceiling here: 0 ft.',
        detail: `${named} surface area. A 0 ft cell cannot be approved through LAANC; it needs a waiver or further coordination with the FAA.`,
      })
    } else {
      lines.push({
        tone: 'authorization',
        text: `Controlled airspace. Needs LAANC. Grid ceiling here: ${at.gridCeilingFeet} ft.`,
        detail: `${named} surface area. The ceiling is the most LAANC can approve at this grid square, in feet above the ground.`,
      })
    }
  }

  if (lines.length === 0) lines.push({ tone: 'note', text: CHECKED_NOTHING, detail: CHECKED_DETAIL })
  lines.push(TODAY_LINE)
  return lines
}

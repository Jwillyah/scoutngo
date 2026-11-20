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
import { floorReaches, type ParkUnit, type RefugeUnit, type SpecialUseArea } from './restrictions.ts'

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
  /** Every National Wildlife Refuge over the point (Batch SIMPLE-1, Section 3). */
  refuges: readonly RefugeUnit[]
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
  'the National Park Service boundaries and the National Wildlife Refuge boundaries, all baked into the app ' +
  'and generalized at their edges. State, county and city park rules are not in the app.'

/*
 * A NATIONAL WILDLIFE REFUGE (Batch SIMPLE-1, Section 3). The brief's words,
 * after the refuge's name: "Great Dismal Swamp · National Wildlife Refuge ·
 * drone use needs refuge permission". A name that does not end in the words
 * keeps its own ("National Elk Refuge · National Wildlife Refuge · ...": it is
 * a unit of the refuge system all the same).
 */
export const REFUGE_RULE = 'National Wildlife Refuge · drone use needs refuge permission'
export const REFUGE_DETAIL =
  'Operating an aircraft on a national wildlife refuge without the refuge’s authorization is prohibited ' +
  '(50 CFR 27.34), and the Fish and Wildlife Service counts a drone as one. Ask the refuge for a special use permit. ' +
  'The boundary is the land the Service holds, generalized at its edges.'

export function refugeLine(refuge: Pick<RefugeUnit, 'name'>): string {
  const stem = refuge.name.replace(/\s+National Wildlife Refuge$/i, '').trim()
  return `${stem === '' ? refuge.name : stem} · ${REFUGE_RULE}`
}

/**
 * THE GROUND UNDER THE MARKER, for the Drone page's Airspace sheet ("Parks
 * and local rules"): every park unit and every refuge at the point, in the
 * sheet's words. Pure, so the sheet's lines are tested from the lookup's
 * answer (tests/refugeLine.test.ts).
 */
export function groundLines(at: Pick<AirspaceAtPoint, 'parks' | 'refuges'>): { text: string; tone: 'hazard' }[] {
  return [
    ...at.parks.map((p) => ({ text: `${p.name}: no drone launch on National Park Service land.`, tone: 'hazard' as const })),
    ...at.refuges.map((r) => ({ text: refugeLine(r), tone: 'hazard' as const })),
  ]
}

/** Every card ends with this (Batch SIMPLE-1, Section 1: the TFR count itself is src/core/tfrLine.ts's, where a place and a fetch are in hand; this is the static close). */
export const TODAY_LINE: CardLine = {
  tone: 'note',
  text: "Check today's flight restrictions before you fly.",
  detail: 'The app reads TFRs from tfr.faa.gov when it can reach it and says what it found; other NOTAMs are not checked. See tfr.faa.gov.',
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

  for (const refuge of at.refuges) lines.push({ tone: 'hazard', text: refugeLine(refuge), detail: REFUGE_DETAIL })

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

/*
 * THE SHEET'S ONE LINE (Batch TRUTH, Section 6): what the shooter needs
 * first, the rest behind Details. A no-fly line leads when there is one;
 * else controlled airspace and its LAANC ceiling, said once
 * ("Controlled · LAANC up to 250 ft here"); else that nothing the app holds
 * is marked (never "clear"). Today's restrictions are said once, apart.
 */
export function airspaceLead(lines: readonly CardLine[], gridCeilingFeet: number | null): string {
  const hazard = lines.find((l) => l.tone === 'hazard')
  if (hazard !== undefined) return hazard.text
  if (lines.some((l) => l.tone === 'authorization')) {
    if (gridCeilingFeet === null) return 'Controlled · LAANC, no grid ceiling here'
    if (gridCeilingFeet === 0) return 'Controlled · 0 ft grid: no LAANC here'
    return `Controlled · LAANC up to ${gridCeilingFeet} ft here`
  }
  return 'Nothing the app holds is marked here'
}

/** The lines behind Details: the lead's own line and today's restrictions (said once, apart) left out. */
export function detailLines(lines: readonly CardLine[]): CardLine[] {
  const lead = lines.find((l) => l.tone === 'hazard') ?? lines.find((l) => l.tone === 'authorization') ?? null
  return lines.filter((l) => l !== lead && l !== TODAY_LINE)
}

/*
 * THE TOOLS THE CALL SHEET MODEL MAY CALL, AND THE CODE BEHIND EACH.
 *
 * The model proposes, code computes. It is never asked for a time, a bearing,
 * a distance or a filter: it asks a tool, and the tool's answer is the only
 * place a number may come from. numberCheck.ts then holds it to that.
 *
 * NO COORDINATE IN ANY ANSWER. The venue's latitude and longitude are used
 * here, on the phone, to work the answers out; what goes back to the model is
 * clock times in the venue's zone, compass bearings, distances and words. The
 * venue coordinate never leaves the device (CLAUDE.md), and a test reads every
 * answer for it (callSheetTools.test.ts).
 */
import { getTimes } from 'suncalc'
import { compassWord } from './compassWords.ts'
import { durationWords } from './duration.ts'
import type { LatLon } from './geo.ts'
import { ndSwapTimes, type CaptureMode, type Sky } from './ndFilter.ts'
import { getSunArc } from './sun.ts'
import { formatClock } from './timezone.ts'

export interface ToolPosition {
  number: number
  platform: 'ground' | 'air'
  optic: string
  focalMm: number
  altitudeFeet: number
  /** Ground distance to the subject, metres. */
  toSubjectMeters: number
  /** Compass bearing the camera points. */
  cameraBearing: number | null
  light: string | null
}

export interface ToolContext {
  venue: LatLon
  timeZone: string
  window: { start: Date; end: Date }
  positions: ToolPosition[]
  bag: { bodies: string[]; lenses: string[]; drones: string[] }
  conditions: { lowCloudPercent: number | null; windKnots: number | null; lowTide: string | null }
  playbook: string
  units: 'ft' | 'm'
  /**
   * THE MOONRISE PRESET, when the call sheet is asked to word one. The shot
   * list is already worked out and written (src/lib/moonriseWords.ts): the
   * model rewords it, it does not plan it. `values` are its times by label,
   * for repairing an invented one.
   */
  moonrise?: { night: string[]; shots: { title: string; when: string; lines: string[] }[]; values: Record<string, string> }
}

/** The tool list in the Messages API's own shape. */
export const CALL_SHEET_TOOLS = [
  {
    name: 'sun_times',
    description:
      'Sunrise, sunset, golden hour start, civil dusk and solar noon at the venue on the shoot date, as clock times in the venue time zone, with compass bearings. Use these for every sun time in the call sheet.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'shoot_window',
    description: 'The shoot window: start and end as clock times in the venue time zone, and its length.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'positions',
    description:
      'Every camera position in the plan: number, ground or air, optic and focal length, flying height, distance to the subject, where the camera points and the light it gets.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'nd_plan',
    description:
      'Which ND filter for the drone and when to swap, from the shooter’s own table. Give the sky and the capture mode, and whether the drone flies over water.',
    input_schema: {
      type: 'object',
      properties: {
        sky: { type: 'string', enum: ['full-sun', 'hazy'] },
        mode: { type: 'string', enum: ['default', '4k30'] },
        over_water: { type: 'boolean' },
      },
      required: ['sky', 'mode', 'over_water'],
      additionalProperties: false,
    },
  },
  {
    name: 'kit',
    description: 'The bodies, lenses and drones in the bag for this shoot.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'conditions',
    description: 'Low cloud, wind and the next low tide for the shoot window, as forecast. A value the forecast did not give is said so.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'moonrise_plan',
    description:
      'The moonrise shot list, worked out by the app: the night, moonrise and where, when the moon clears 2 degrees, sunset and civil dusk, and four shots in order (wide opener, line-up, mid, drone) with lens, facing, where to stand and settings. When it is there, the sheet is this list, reworded, in this order, with every number as given.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'playbook',
    description: 'The shooter’s own playbook: the shots and rules they always use. Follow it.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const

export type ToolName = (typeof CALL_SHEET_TOOLS)[number]['name']

const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

/** The labelled code values, for repairing an invented number: label -> the app's own text. */
export function codeValues(ctx: ToolContext): Record<string, string> {
  const t = getTimes(new Date((ctx.window.start.getTime() + ctx.window.end.getTime()) / 2), ctx.venue.lat, ctx.venue.lon)
  const clock = (d: unknown) => (usable(d) ? formatClock(d, ctx.timeZone) : null)
  const out: Record<string, string> = {}
  const put = (label: string, value: string | null) => {
    if (value !== null) out[label] = value
  }
  put('sunrise', clock(t.sunrise))
  put('sunset', clock(t.sunset))
  put('golden hour', clock(t.goldenHour))
  put('civil dusk', clock(t.dusk))
  put('dusk', clock(t.dusk))
  put('solar noon', clock(t.solarNoon))
  put('start', clock(ctx.window.start))
  put('end', clock(ctx.window.end))
  for (const [label, value] of Object.entries(ctx.moonrise?.values ?? {})) put(label, value)
  return out
}

export function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): unknown {
  const clock = (d: unknown) => (usable(d) ? formatClock(d, ctx.timeZone) : 'not on this date')
  const distance = (m: number) => (ctx.units === 'ft' ? `${Math.round(m / 0.3048)} ft` : `${Math.round(m)} m`)
  switch (name as ToolName) {
    case 'sun_times': {
      const middle = new Date((ctx.window.start.getTime() + ctx.window.end.getTime()) / 2)
      const t = getTimes(middle, ctx.venue.lat, ctx.venue.lon)
      const arc = getSunArc(middle, ctx.venue.lat, ctx.venue.lon)
      return {
        sunrise: clock(t.sunrise),
        sunrise_bearing: arc.sunrise === null ? null : `${Math.round(arc.sunrise.azimuth)} degrees, ${compassWord(arc.sunrise.azimuth)}`,
        golden_hour_starts: clock(t.goldenHour),
        sunset: clock(t.sunset),
        sunset_bearing: arc.sunset === null ? null : `${Math.round(arc.sunset.azimuth)} degrees, ${compassWord(arc.sunset.azimuth)}`,
        civil_dusk: clock(t.dusk),
        solar_noon: clock(t.solarNoon),
        time_zone: ctx.timeZone,
      }
    }
    case 'shoot_window': {
      const minutes = Math.round((ctx.window.end.getTime() - ctx.window.start.getTime()) / 60_000)
      return { start: clock(ctx.window.start), end: clock(ctx.window.end), length: durationWords(minutes), length_minutes: minutes }
    }
    case 'positions':
      return ctx.positions.map((p) => ({
        number: p.number,
        platform: p.platform,
        optic: p.optic,
        focal_mm: p.focalMm,
        ...(p.platform === 'air' ? { flying_height_ft: p.altitudeFeet } : {}),
        distance_to_subject: distance(p.toSubjectMeters),
        camera_points: p.cameraBearing === null ? 'no single direction' : `${Math.round(p.cameraBearing)} degrees, ${compassWord(p.cameraBearing)}`,
        light: p.light ?? 'sun down',
      }))
    case 'nd_plan': {
      const middle = new Date((ctx.window.start.getTime() + ctx.window.end.getTime()) / 2)
      const sunset = getTimes(middle, ctx.venue.lat, ctx.venue.lon).sunset
      if (!usable(sunset)) return { swaps: [], note: 'No sunset on this date, so the table cannot be read.' }
      const sky: Sky = input.sky === 'hazy' ? 'hazy' : 'full-sun'
      const mode: CaptureMode = input.mode === '4k30' ? '4k30' : 'default'
      const from = ctx.window.start.getTime() < sunset.getTime() ? ctx.window.start : new Date(sunset.getTime() - 3 * 3_600_000)
      return {
        swaps: ndSwapTimes(sunset, sky, mode, input.over_water === true, from).map((s) => ({ at: clock(s.at), filter: s.nd ?? 'none', why: s.reason })),
      }
    }
    case 'kit':
      return ctx.bag
    case 'conditions':
      return {
        low_cloud: ctx.conditions.lowCloudPercent === null ? 'the forecast did not say' : `${Math.round(ctx.conditions.lowCloudPercent)} percent`,
        wind: ctx.conditions.windKnots === null ? 'the forecast did not say' : `${Math.round(ctx.conditions.windKnots)} kt`,
        next_low_tide: ctx.conditions.lowTide ?? 'not known for this venue',
      }
    case 'playbook':
      return { playbook: ctx.playbook }
    case 'moonrise_plan':
      return ctx.moonrise === undefined ? { note: 'No moonrise plan for this call sheet.' } : { night: ctx.moonrise.night, shots: ctx.moonrise.shots }
    default:
      return { error: `No tool named ${name}.` }
  }
}

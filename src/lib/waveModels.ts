/*
 * THE OTHER WAVE MODELS (Batch 3D, Section 3.2, Jwilly approved): ECMWF WAM,
 * GFS-Wave and Météo-France MFWAM from Open-Meteo Marine, for the week's
 * bigger-swell watch only (src/core/swellWatch.ts). The call itself still
 * reads the best match (src/lib/tideSheetData.ts fetchMarine).
 *
 * Asked from the phone like every Open-Meteo question, through the weather
 * store (src/lib/weatherStore.ts: the coordinate snapped to its grid, the
 * forecast cache, one answer an hour or three). The same host as the Tide
 * sheet's sea (src/lib/hosts.ts), one request, every model in it: Open-Meteo
 * answers each variable suffixed by its model ("wave_height_ecmwf_wam025").
 */
import type { LatLon } from '../core/geo.ts'
import { seaInCell, WAVE_MODEL_IDS, WAVE_MODELS } from '../core/swellWatch.ts'
import { MARINE_URL, parseHourly, type Hourly } from './tideSheetData.ts'
import { SLOW_MAX_AGE_MS, weatherJson } from './weatherStore.ts'

/** The parts each model is read by: the whole sea, and the swell and wind sea where the model splits them. */
export const WAVE_MODEL_NAMES = ['wave_height', 'wave_period', 'wave_direction', 'swell_wave_height', 'swell_wave_period', 'swell_wave_direction', 'wind_wave_height', 'wind_wave_period', 'wind_wave_direction'] as const

export interface ModelSea {
  /** The model's name (WAVE_MODELS), e.g. "ECMWF WAM". */
  model: string
  /** The Open-Meteo id read, e.g. "ncep_gfswave016". */
  id: string
  /** Its series under the plain names (WAVE_MODEL_NAMES), as fetchMarine's are. */
  marine: Hourly
}

export function waveModelsUrl(at: LatLon): string {
  const params = new URLSearchParams({ latitude: at.lat.toFixed(2), longitude: at.lon.toFixed(2), hourly: WAVE_MODEL_NAMES.join(','), models: WAVE_MODEL_IDS.join(','), forecast_days: '7', timezone: 'GMT' })
  return `${MARINE_URL}?${params}`
}

/** One answer split by model: each model's series under the plain names, the first id of each whose cell is sea (seaInCell); a model with none is left out. */
export function splitModels(payload: unknown): ModelSea[] {
  const hourly = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  if (hourly === undefined || hourly === null) return []
  const out: ModelSea[] = []
  for (const m of WAVE_MODELS) {
    for (const id of m.ids) {
      const plain = { hourly: { time: hourly.time, ...Object.fromEntries(WAVE_MODEL_NAMES.map((n) => [n, hourly[`${n}_${id}`]])) } }
      const marine = parseHourly(plain, WAVE_MODEL_NAMES)
      if (marine !== null && seaInCell(marine.values.wave_height)) {
        out.push({ model: m.name, id, marine })
        break
      }
    }
  }
  return out
}

/** The models' week at a spot; [] when none answered or none has sea here. */
export async function fetchWaveModels(at: LatLon): Promise<ModelSea[]> {
  const got = await weatherJson(waveModelsUrl(at), { maxAgeMs: SLOW_MAX_AGE_MS, timeoutMs: 12_000 })
  return got.ok ? splitModels(got.payload) : []
}

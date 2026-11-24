/*
 * THE FOG AND RAIN NOWCASTS' INPUTS FROM WHAT THE PHONE ALREADY HAS (Batch
 * SIMPLE-3, Sections 1 and 1b). The rules are src/core/fogRisk.ts and
 * src/core/rainNow.ts; this only turns the brief's answer (src/lib/
 * tideSheetData.ts fetchBriefWind, fetchBriefQuarters: one request) into
 * their hours. Nothing is asked here.
 */
import type { FogModelHour } from '../core/fogRisk.ts'
import type { Hourly } from './tideSheetData.ts'

/** The brief's hours as the fog rules read them: air, dew point, wind, visibility, low and mid cloud, rain. */
export function fogModelHours(wx: Hourly): FogModelHour[] {
  const v = (n: string, i: number) => wx.values[n]?.[i] ?? null
  return wx.times.map((t, i) => ({
    at: new Date(t),
    tempC: v('temperature_2m', i),
    dewC: v('dew_point_2m', i),
    windMps: v('wind_speed_10m', i),
    windFromDeg: v('wind_direction_10m', i),
    visibilityM: v('visibility', i),
    lowCloudPct: v('cloud_cover_low', i),
    midCloudPct: v('cloud_cover_mid', i),
    precipMm: v('precipitation', i),
  }))
}

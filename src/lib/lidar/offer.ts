/*
 * "DOWNLOAD 3D SCAN FOR THIS PLACE (≈ N MB, SCANNED YYYY)": WORKED OUT ON THE
 * PHONE, BEFORE ANYTHING IS ASKED OF ANYONE.
 *
 * Nothing goes to USGS until the tap. The offer comes from the index baked
 * into the app (src/data/lidarIndex.ts): the newest project whose box holds
 * the venue, its average density (points over its box, which counts the
 * empty corners and so reads low), the patch's area, and the bytes a point
 * takes in the projects' compressed tiles (BYTES_PER_POINT, measured). After
 * the tap the project's own tile index says what is really there and the
 * download shows its real size as it goes.
 */
import { areaFor, areaM2, type LidarArea } from './grid.ts'
import { DENSITY_DEFAULT } from './ept.ts'

/*
 * Compressed tile bytes a point. MEASURED 7.89 at the pier (Norfolk 2013) and
 * 7.37 at Brew River (Maryland 2019), rounded up to 8
 * (measurements/2026-10-27-lidar-stop.md).
 */
export const BYTES_PER_POINT = 8

export interface LidarOffer {
  project: string
  year: number | null
  area: LidarArea
  /** Estimated bytes at the density asked for. */
  bytes: number
  density: number
}

export async function offerFor(lat: number, lon: number, density = DENSITY_DEFAULT): Promise<LidarOffer | null> {
  const { LIDAR_PROJECTS } = await import('../../data/lidarIndex.ts')
  const hits = LIDAR_PROJECTS.filter(([, w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n)
  if (hits.length === 0) return null
  /* Newest first; a project with no year in its name goes last. */
  const [name, w, s, e, n, year, points] = [...hits].sort((a, b) => (b[5] ?? 0) - (a[5] ?? 0))[0]
  const area = areaFor(lat, lon)
  const boxM2 = ((e - w) * 111_320 * Math.cos((lat * Math.PI) / 180)) * ((n - s) * 110_540)
  const avg = points / Math.max(1, boxM2)
  /* The tiles hold the coarse depths too, so the download is the density asked for plus about a third. */
  const pts = Math.min(avg, density) * areaM2(area, area.metresPerUnit) * (4 / 3)
  return { project: name, year, area, bytes: pts * BYTES_PER_POINT, density: Math.min(avg, density) }
}

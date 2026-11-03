/*
 * IOWA STATE'S HOURLY STATION REPORTS (ASOS), ASKED AND READ. Shared by the
 * phone's own scoring (src/lib/blendData.ts) and the nightly shared file
 * (scripts/skill/build-shared.ts), so both read a report the same way.
 */
import { coverFromLayers, wetFromCodes, type StationObs } from './modelSkill.ts'

export const IEM_ASOS_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py'

/** IEM names US stations without their K. */
export const iemId = (id: string) => (/^K[A-Z0-9]{3}$/.test(id) ? id.slice(1) : id)

export function asosUrl(ids: readonly string[], from: Date, to: Date): string {
  const p = new URLSearchParams()
  for (const id of ids) p.append('station', iemId(id))
  for (const d of ['tmpf', 'dwpf', 'sknt', 'drct', 'gust', 'skyc1', 'skyc2', 'skyc3', 'skyc4', 'p01i', 'wxcodes']) p.append('data', d)
  p.set('sts', from.toISOString().slice(0, 16) + 'Z')
  p.set('ets', to.toISOString().slice(0, 16) + 'Z')
  p.set('tz', 'Etc/UTC')
  p.set('format', 'onlycomma')
  p.set('latlon', 'no')
  p.set('missing', 'null')
  p.set('trace', '0.0001')
  p.set('report_type', '3')
  return `${IEM_ASOS_URL}?${p.toString()}`
}

const KT = 0.514444

/** IEM's CSV, one row per routine report, in SI units. */
export function parseAsos(csv: string, ids: readonly string[]): StationObs[] {
  const lines = csv.trim().split('\n')
  const head = lines[0]?.split(',') ?? []
  const col = (name: string) => head.indexOf(name)
  if (col('station') < 0 || col('valid') < 0) return []
  const back = new Map(ids.map((id) => [iemId(id), id]))
  const out: StationObs[] = []
  for (const line of lines.slice(1)) {
    const c = line.split(',')
    const v = (name: string) => {
      const x = c[col(name)]
      return x === undefined || x === 'null' || x === 'M' || x === '' ? null : x
    }
    const n = (name: string) => {
      const x = v(name)
      const f = x === null ? NaN : Number(x)
      return Number.isFinite(f) ? f : null
    }
    const id = back.get(v('station') ?? '')
    const valid = v('valid')
    if (id === undefined || valid === null) continue
    const tf = n('tmpf')
    const df = n('dwpf')
    const dir = n('drct')
    const kt = n('sknt')
    const g = n('gust')
    const p = n('p01i')
    const codes = v('wxcodes')
    out.push({
      station: id,
      at: new Date(`${valid.replace(' ', 'T')}:00Z`),
      tempC: tf === null ? null : ((tf - 32) * 5) / 9,
      dewC: df === null ? null : ((df - 32) * 5) / 9,
      dirDeg: dir,
      windMps: kt === null ? null : kt * KT,
      gustMps: g === null ? null : g * KT,
      cloudPct: coverFromLayers(['skyc1', 'skyc2', 'skyc3', 'skyc4'].map(v)),
      wet: p === null && codes === null ? null : (p ?? 0) > 0 || wetFromCodes(codes),
    })
  }
  return out
}


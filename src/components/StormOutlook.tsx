import { stormLine } from '../core/stormRisk.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import type { StormRisk } from '../lib/stormRiskData.ts'

/*
 * TODAY'S STORM LINE (Batch K, Section 3): the models' ingredients in plain
 * words, the 31-run rain odds, and the Storm Prediction Center's outlook,
 * watches and discussions over the venue, quoted as theirs. Numbers in
 * "Why". Never "safe", never advice (ux-rules 12, 28).
 */
export function StormOutlook({ risk, timeZone }: { risk: StormRisk | null; timeZone: string }) {
  if (risk === null) return null
  const hour = (d: Date) => formatShortHour(d, timeZone)
  const spc = risk.spc
  return (
    <section className="wx__storm" aria-label="Storms later">
      {risk.days.map((d, i) => {
        const line = stormLine(d.storm, hour, d.word)
        const rain = d.rain === null || d.rain.chance === null || d.rain.chance < 0.1 ? null : `Rain ${Math.round(d.rain.chance * 100)}% ${d.word}${d.rain.from === null || d.rain.to === null ? '' : ` · most likely ${hour(d.rain.from)}–${hour(d.rain.to)}`}`
        const outlook = spc.outlook?.[i] ?? null
        if (line === null && rain === null && outlook === null) return null
        return (
          <div key={d.date} className="wx__stormday">
            {line === null ? null : <p className="wx__line wx__stormline">{line}</p>}
            {rain === null ? null : <p className="wx__line num">{rain}</p>}
            {outlook === null ? null : <p className="fire__note">Storm Prediction Center, {d.word}: {outlook.word}</p>}
          </div>
        )
      })}
      {(spc.watches ?? []).map((w) => (
        <p key={w.num} className="wx__line wx__watch">{w.kind} {w.num}{w.until === null ? '' : ` until ${formatClock(w.until, timeZone)}`}</p>
      ))}
      {(spc.mcds ?? []).map((m) => (
        <p key={m.num} className="fire__note">SPC discussion {m.num}: &ldquo;{m.concerning.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}&rdquo;</p>
      ))}
    </section>
  )
}

/** The storm numbers and the method, for the Weather tab's Why row. */
export function StormWhy({ risk }: { risk: StormRisk | null }) {
  if (risk === null) return null
  const kt = (ms: number | null) => (ms === null ? '—' : `${Math.round(ms / 0.514444)} kt`)
  return (
    <>
        {risk.days.map((d) => (
          <p key={d.date} className="fire__note num">
            {d.word[0].toUpperCase() + d.word.slice(1)}: energy (CAPE) up to {d.storm.maxCape === null ? '—' : `${Math.round(d.storm.maxCape)} J/kg`} · lid (CIN) {d.storm.minCin === null ? '—' : `${Math.round(d.storm.minCin)} J/kg`} · lifted index {d.storm.minLi === null ? '—' : d.storm.minLi.toFixed(1)} · shear to 500 hPa {kt(d.storm.maxShear)} · water in the air {d.storm.maxPw === null ? '—' : `${Math.round(d.storm.maxPw)} mm`} · {d.storm.agree} of {d.storm.of} models with storms at most
          </p>
        ))}
        <p className="fire__note">Storms possible: half the models (HRRR, GFS, ECMWF, ICON) have energy of 500 J/kg or more, a weak lid, a negative lifted index and rain in the same hour. Could be strong: 1,500 J/kg and 30 kt of shear. Rain odds: the 31 GFS runs. The Storm Prediction Center&rsquo;s outlook, watches and discussions are shown as theirs and never change the line.</p>
    </>
  )
}

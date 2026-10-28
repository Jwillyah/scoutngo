/*
 * OPEN A VENUE IN THE APP BY ITS SHARE LINK, the way a shooter would open one
 * sent to them: for the measuring scripts that need a real place (the pier,
 * the Oceanfront) rather than the calibration venue.
 */
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { goToStage } from './preflight.mjs'

/** Opens `place` ({ lat, lon, name, date, start, end }) and lands in Plan. */
export async function openShared({ send, ev, wait }, place) {
  const venue = {
    ...CALIBRATION_VENUE,
    name: { key: placeKey(String(place.lat), String(place.lon)), name: place.name },
    latitude: String(place.lat),
    longitude: String(place.lon),
    date: place.date,
    startTime: place.start,
    endTime: place.end,
  }
  const link = await shareLink('http://127.0.0.1:5173/', { id: 'shared', name: place.name, savedAt: `${place.date}T00:00:00Z`, venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await wait(2500)
  await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true')`)
  await send('Page.navigate', { url: 'about:blank' })
  await send('Page.navigate', { url: link })
  let opened = false
  for (let i = 0; i < 30 && !opened; i += 1) {
    await wait(500)
    opened = await ev(`(() => { const b = document.querySelector('.confirm__yes'); if (!b) return false; b.click(); return true })()`)
  }
  if (!opened) throw new Error('the shared plan was not offered')
  await wait(2500)
  await goToStage(ev, wait, 'plan')
  await wait(4000)
}

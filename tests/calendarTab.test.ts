import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * SKY › CALENDAR (Batch G, Section 6): the month view is the default, so the
 * tab opens it; "the sun through the year" compass is gone (its W and S were
 * cut by its frame and it read N twice, W missing); the showers and moons,
 * with their calendar alerts (.ics), stay.
 */
describe('Sky › Calendar', () => {
  const card = readFileSync('src/components/SkyCard.tsx', 'utf8')
  it('the Calendar tab opens the month', () => {
    expect(card).toMatch(/if \(t\.id === 'calendar'\) onOpenCalendar\?\.\(\)/)
  })
  it('has no year compass, and keeps the showers and moons with their alerts', () => {
    expect(card).not.toMatch(/through the year/)
    expect(card).not.toMatch(/seasonLines|SEASON_NAME/)
    const calendar = card.slice(card.lastIndexOf('Open the month'))
    expect(calendar).toContain('{events}')
    expect(readFileSync('src/components/SkyPanel.tsx', 'utf8')).toMatch(/skyEventIcs/)
  })
})

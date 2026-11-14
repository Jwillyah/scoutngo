import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE CALENDAR AND THE SHOWERS (Batch G, Section 6; Batch Pages, Section 3).
 * The Sky sheet's tabs are gone: the month opens from the Sky page's
 * Calendar button. "The sun through the year" compass stays gone (its W and
 * S were cut by its frame); the showers and moons, with their calendar
 * alerts (.ics), stay, under the Night page of the sheet's Now view.
 */
describe('the calendar and the showers', () => {
  const card = readFileSync('src/components/SkyCard.tsx', 'utf8')
  const page = readFileSync('src/components/SkyPage.tsx', 'utf8')
  const app = readFileSync('src/App.tsx', 'utf8')
  it('the Sky page has a Calendar button, and App opens the month from it', () => {
    expect(page).toMatch(/onClick=\{onCalendar\}[\s\S]{0,40}Calendar ›/)
    expect(app).toMatch(/onCalendar=\{\(\) => \{[\s\S]{0,400}kind: 'calendar'/)
    expect(readFileSync('src/components/PlanMode.tsx', 'utf8')).toMatch(/cardRequest\.kind === 'calendar'\) \{[\s\S]{0,200}setCalendarOpen\(true\)/)
  })
  it('has no year compass, no tabs, and keeps the showers and moons with their alerts', () => {
    expect(card).not.toMatch(/through the year/)
    expect(card).not.toMatch(/seasonLines|SEASON_NAME/)
    expect(card).not.toMatch(/skyc__tabs/)
    expect(card.slice(card.indexOf('Showers and moons, next 90 days'))).toContain('{events}')
    expect(readFileSync('src/components/SkyPanel.tsx', 'utf8')).toMatch(/skyEventIcs/)
  })
})

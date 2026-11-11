import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* Batch Polish, Section 4: the menu has the home's live sky, by the home's own groundOf (suncalc 2's altitude is in degrees, as groundOf wants). */
describe('the menu’s sky', () => {
  it('the panel carries the ground the home would show', () => {
    const menu = readFileSync('src/components/Menu.tsx', 'utf8')
    expect(menu).toMatch(/groundOf\(getPosition\(now, venue\.lat, venue\.lon\)\.altitude, at\('weather_code', now\), false\)/)
    expect(menu).toMatch(/className=\{`menu__panel sidemenu__panel home--\$\{ground\}`\}/)
  })
})

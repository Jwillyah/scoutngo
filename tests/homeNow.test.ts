import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRIEF_WIND_NAMES } from '../src/lib/tideSheetData.ts'

/* Batch NOW, Section 3: the home's weather opens the Weather page, eight hours fill the gap, the week keeps its columns. */
const home = readFileSync('src/components/Home.tsx', 'utf8')
const hours = readFileSync('src/components/HomeHours.tsx', 'utf8')

describe('the home (3.1)', () => {
  it('the condition and the day\'s high and low open the Weather page, with a ›', () => {
    expect(home).toMatch(/className="hwx__cond" data-open-weather onClick=\{\(\) => onOpen\('weather'\)\}/)
    expect(home).toMatch(/\{soonWord === null \? '' : ` · \$\{soonWord\}`\} ›/)
  })
  it('eight hours from the home\'s own answer (the rain\'s chance asked with it, no new question), the one sky word\'s icon, opening the Weather page', () => {
    expect(BRIEF_WIND_NAMES).toContain('precipitation_probability')
    expect(hours).toMatch(/HOME_HOURS = 8/)
    expect(hours).toMatch(/skyCondition\(/)
    expect(home).toMatch(/<HomeHours [^>]*onOpen=\{\(\) => onOpen\('weather'\)\}/)
  })
  it('the hours go first when the page would scroll', () => {
    expect(home).toMatch(/if \(fit\.hours === true\) setFit\(\{ \.\.\.fit, hours: false \}\)/)
  })
})

describe('the week (3.3)', () => {
  it('the same columns every day: sky, surf, wind, temperatures, the pill; no row of its own words for the drone', () => {
    expect(home).toMatch(/className="hweek__surf num"/)
    expect(home).toMatch(/className="hweek__wind num"/)
    expect(home).not.toMatch(/hweek__worth/)
    /* The best line under the list. */
    expect(home.indexOf('className="hweek__head"')).toBeGreaterThan(home.indexOf('<ol className="hweek__rows">'))
  })
})

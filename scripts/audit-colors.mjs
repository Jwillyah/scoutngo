/*
 * THE COLOUR RULE AUDIT
 *
 * Usage:  node scripts/audit-colors.mjs
 * Exits:  0 when src/core/colorRole.ts and src/styles/tokens.css agree.
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST. colorRole.test.ts tried to read
 * tokens.css through Vite and got an empty string back: vitest resolves CSS
 * imports to '' by design. Every lookup returned null and the suite went red
 * reporting "expected null to be #2dd4bf", which looks exactly like a broken
 * palette and was actually a test that could not open the file. Reading a file
 * as a file, in the gate, is the honest version of that check.
 *
 * WHAT IT ENFORCES:
 *
 *   every token named in COLOR_ROLES exists in tokens.css with that value
 *   the chrome teal is not also a data hue
 *   red is reserved: exactly one token is #ff3b30 and it is --hazard
 *   no data hue is reused as a chrome hue
 *   "starting soon" is the sun's amber and never the hazard red: the golden
 *   chip read "47 m" in red on a phone on 27 Oct, saying the light was a hazard
 */
import { readFileSync } from 'node:fs'

const ROLE_SRC = readFileSync('src/core/colorRole.ts', 'utf8')
const TOKENS = readFileSync('src/styles/tokens.css', 'utf8')

let problems = 0
const fail = (line) => {
  console.log('      PROBLEM: ' + line)
  problems += 1
}

/* Pull the table out of the TypeScript source without importing it. */
const entries = [...ROLE_SRC.matchAll(
  /token:\s*'([^']+)',\s*\n\s*role:\s*'([^']+)',\s*\n\s*value:\s*'([^']+)'/g,
)].map(([, token, role, value]) => ({ token, role, value }))

console.log('### the colour rule, against the real stylesheet')

if (entries.length === 0) {
  fail('could not parse COLOR_ROLES out of src/core/colorRole.ts')
} else {
  console.log(`  ${entries.length} tokens carry meaning`)
}

const valueOf = (token) => {
  const match = new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{3,8})`).exec(TOKENS)
  return match?.[1]?.toLowerCase() ?? null
}

for (const entry of entries) {
  const actual = valueOf(entry.token)
  const ok = actual === entry.value
  console.log(
    `  ${entry.role.padEnd(6)} --${entry.token.padEnd(12)} ${entry.value}  ${ok ? 'ok' : `tokens.css says ${actual ?? 'nothing'}`}`,
  )
  if (!ok) {
    fail(`--${entry.token} is ${actual ?? 'not defined'} in tokens.css, but colorRole.ts says ${entry.value}`)
  }
}

const chrome = entries.filter((e) => e.role === 'chrome').map((e) => e.value)
const data = entries.filter((e) => e.role === 'data').map((e) => e.value)

for (const hue of data) {
  if (chrome.includes(hue)) fail(`${hue} is used as both chrome and data, which is the rule itself`)
}

const reds = entries.filter((e) => e.value === '#ff3b30')
if (reds.length !== 1 || reds[0]?.token !== 'hazard') {
  fail(`red is reserved for hazards; found it on ${reds.map((r) => r.token).join(', ') || 'nothing'}`)
}

const APP_CSS = readFileSync('src/styles/app.css', 'utf8')
const ruleBody = (selector) => {
  const at = APP_CSS.indexOf(`\n${selector} {`)
  return at === -1 ? null : APP_CSS.slice(at, APP_CSS.indexOf('}', at))
}
for (const selector of ['.chip2--soon', '.chip2--soon .chip2__value', '.shooter__flag--caution', '.shot__caution', '.card__caution']) {
  const body = ruleBody(selector)
  if (body === null) fail(`${selector} is not in app.css`)
  else if (/hazard|#ff3b30/i.test(body) || !body.includes('var(--sun)')) fail(`${selector} must be the sun's amber and never the hazard red`)
  else console.log(`  ${selector.padEnd(28)} amber, not red  ok`)
}

/* Old imagery is a caution about the picture, not a hazard: never red (27 Oct, "2016" in red on the shoot card). */
for (const selector of ['.frame__year--old', '.frame__age--old']) {
  const body = ruleBody(selector)
  if (body === null) fail(`${selector} is not in app.css`)
  else if (/hazard|#ff3b30/i.test(body)) fail(`${selector} is in the hazard red; old imagery is not a hazard`)
  else console.log(`  ${selector.padEnd(28)} not red  ok`)
}

/*
 * EVERY RED RULE, NAMED, WITH ITS REASON (29 Oct: "keep red for real hazards
 * and real errors only, a failed load the user must act on. Warnings,
 * cautions, far, starting soon use amber").
 *
 * On that day 39 rules painted with the hazard red; the pass left the ones
 * below and turned the rest amber or plain, or deleted them (five matched
 * nothing in any component). A NEW rule in the red fails here until someone
 * decides it is a hazard or an error and adds it with a reason, and a listed
 * one that no longer paints red fails too, so the list only ever describes
 * what is on the screen (shape B in docs/failure-modes.md).
 */
const RED_RULES = {
  '.pack__error': 'the field pack failed to save: act on it',
  '.fc__warn': "a site hazard on Field's card",
  '.shooter--warned .shooter__disc': 'a position standing in a hazard',
  '.shooter--warned .shooter__cam-lens': 'a position standing in a hazard',
  '.raw': 'the plan could not be read back: a failed load',
  '.raw__head': 'the plan could not be read back: a failed load',
  '.notice--hazard': 'generating the plan failed',
  '.shooter__flag--hazard': 'the hazard flag on a position',
  '.shot__warn': 'in water, in a roadway, over people',
  '.card__warn': 'in water, in a roadway, over people',
  '.kitf__error': 'the kit form refused what was typed: act on it',
  '.hz__kind--on.hz__kind--hazard': 'a hazard mark',
  '.kitaudit__line--loss': 'stored kit lost: re-add it',
  '.skykey__swatch--over': "wind over the aircraft's rated limit",
  '.chip2--urgent': "wind over the aircraft's rated limit",
  '.chip2--urgent .chip2__value': "wind over the aircraft's rated limit",
  '.judge--warn .judge__bar': "hours over the aircraft's rated wind",
  '.judge--warn .judge__rule': "hours over the aircraft's rated wind",
  '.bars__fill--over': "wind over the aircraft's rated limit",
  '.bars__value--over': "wind over the aircraft's rated limit",
  '.air__line--hazard': 'airspace that forbids or restricts the flight',
  '.fly__arc--hazard': 'an obstacle about to be hit',
  '.cmp__line--error': 'the 3D view for a photo failed to build',
}
{
  const red = new Set()
  /* Comments out first: a comment's commas and braces are not selectors. */
  const css = APP_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/var\(--(color-)?hazard\)|#ff3b30/i.test(m[2])) continue
    for (const sel of m[1].split(',')) red.add(sel.trim().replace(/\s+/g, ' '))
  }
  if (red.size === 0) fail('no rule in app.css paints with the hazard red, so the red rule check looked at nothing')
  for (const sel of red) if (!(sel in RED_RULES)) fail(`${sel} paints with the hazard red and is not a named hazard or error (add it to RED_RULES with its reason, or use amber, var(--sun))`)
  for (const sel of Object.keys(RED_RULES)) if (!red.has(sel)) fail(`${sel} is listed as red but no longer paints red: take it off the list`)
  console.log(`  ${red.size} rules paint with the hazard red, each a named hazard or error`)
}

console.log(`\n=== COLOUR PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)

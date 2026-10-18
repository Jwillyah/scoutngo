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

console.log(`\n=== COLOUR PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)

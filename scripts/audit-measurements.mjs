/*
 * THE MEASUREMENT AUDIT
 *
 * Usage:  node scripts/audit-measurements.mjs
 * Exits:  0 when every MEASURED claim resolves to a file that contains its
 *         numbers, and no NEW untraceable claim has appeared.
 *
 * THE RULE. A comment, doc or report line that says MEASURED is claiming a
 * number came out of a run. That claim is only checkable if it says WHICH
 * run, so it carries the path of the file the run wrote.
 *
 * WHY, IN ONE SENTENCE: a measured number with no provenance is
 * indistinguishable from an invented one, and this repo has had both. A table
 * of six fps figures labelled "MEASURED at z17 with pitch 60, both profiles"
 * was written into MapView.tsx while the measurement was still running. It
 * looked exactly like the real one beside it.
 *
 * THREE OUTCOMES, AND ONLY TWO OF THEM FAIL:
 *
 *   BROKEN    the claim names a file that does not exist, or quotes a number
 *             the file does not contain. Provably wrong. Fails, always.
 *
 *   UNTRACED  the claim names no file at all. These are the backlog, and the
 *             decision about each one -- re-measure, reword, or delete -- is
 *             the author's, not this script's. The known set is recorded in
 *             docs/untraced-measurements.md and a NEW one fails the gate.
 *
 *   TRACED    resolves, and its numbers are in the file.
 *
 * THE BASELINE IS A RATCHET, NOT AN ALLOWLIST. It may only shrink: an entry
 * that no longer matches anything in the tree is itself a failure, so it
 * cannot rot into a list of things nobody remembers. This repo has already
 * learned what a hand-maintained exceptions list becomes -- see
 * docs/failure-modes.md, shape B.
 *
 * WHAT IS NOT SCANNED: code. `const MEASURED: LevelWind[] = [...]` in a test
 * is an identifier, not a claim, and so is every line that passes it to a
 * function. Only comments and markdown prose make claims.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['src', 'scripts', 'docs', 'netlify', 'api']
const MARKDOWN_ROOTS = ['docs', '.']
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])
const BASELINE = 'docs/untraced-measurements.md'

/** The word that makes a line a claim. Uppercase: it is a deliberate marker. */
const CLAIM = /\bMEASURED\b/

/** A reference to the run that produced it. */
const REFERENCE = /measurements\/[A-Za-z0-9._-]+/g

let problems = 0
const fail = (line) => {
  console.log(`      PROBLEM: ${line}`)
  problems += 1
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

/**
 * The comment blocks of a source file, as {lines, start} runs.
 *
 * A BLOCK, NOT A LINE, because the path is routinely a sentence or two away
 * from the word MEASURED inside the same comment, and splitting them would
 * report every careful citation in the repo as untraced.
 */
function commentBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let current = null
  let inBlock = false

  lines.forEach((raw, i) => {
    const line = raw.trim()
    const opens = line.includes('/*')
    const closes = line.includes('*/')
    const isLineComment = line.startsWith('//')
    const isContinuation = inBlock || line.startsWith('*')

    if (opens && !inBlock) {
      inBlock = true
      current = { start: i + 1, lines: [raw] }
      if (closes) {
        inBlock = false
        blocks.push(current)
        current = null
      }
      return
    }
    if (inBlock) {
      current.lines.push(raw)
      if (closes) {
        inBlock = false
        blocks.push(current)
        current = null
      }
      return
    }
    if (isLineComment) {
      const last = blocks.at(-1)
      if (last !== undefined && last.start + last.lines.length === i + 1 && last.lineComment) {
        last.lines.push(raw)
      } else {
        blocks.push({ start: i + 1, lines: [raw], lineComment: true })
      }
      return
    }
    void isContinuation
  })
  return blocks
}

/** Markdown has no comments: the whole file is prose, split on blank lines. */
function markdownBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let current = null
  lines.forEach((raw, i) => {
    if (raw.trim() === '') {
      if (current !== null) blocks.push(current)
      current = null
      return
    }
    if (current === null) current = { start: i + 1, lines: [] }
    current.lines.push(raw)
  })
  if (current !== null) blocks.push(current)
  return blocks
}

/*
 * NUMERALS WORTH CHECKING.
 *
 * Years and bare small integers are excluded: "2026" is a date and "2" is
 * usually a count of something in a sentence, and demanding either appear in
 * a measurement file would make the audit noise. What is checked is anything
 * that looks like a measurement -- a decimal, or an integer of three digits
 * or more -- which is the shape every real claim in this repo takes.
 */
function numeralsIn(text) {
  const found = new Set()
  for (const match of text.matchAll(/\d[\d,]*\.?\d*/g)) {
    const raw = match[0].replace(/,/g, '')
    if (raw === '') continue
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    const isDecimal = raw.includes('.')
    if (!isDecimal && raw.length < 3) continue
    if (!isDecimal && /^(19|20)\d\d$/.test(raw)) continue
    found.add(raw)
  }
  return [...found]
}

/** Does the measurement file contain this numeral, in any reasonable form? */
function fileHas(fileText, numeral) {
  if (fileText.includes(numeral)) return true
  const value = Number(numeral)
  if (!Number.isFinite(value)) return false
  /* 1568 may be written 1,568; 0.28 may be written .28; 88 may be 88.0. */
  const variants = [
    value.toLocaleString('en-US'),
    numeral.replace(/^0\./, '.'),
    String(value),
    value.toFixed(1),
    value.toFixed(2),
  ]
  return variants.some((v) => fileText.includes(v))
}

/* ------------------------------------------------------------------ scan */

const files = []
for (const root of ROOTS) {
  for (const path of walk(root)) {
    if (CODE_EXT.has(extname(path)) || extname(path) === '.md') files.push(path)
  }
}
for (const root of MARKDOWN_ROOTS) {
  if (!existsSync(root)) continue
  for (const entry of readdirSync(root)) {
    const path = root === '.' ? entry : join(root, entry)
    if (extname(path) === '.md' && existsSync(path) && statSync(path).isFile()) {
      if (!files.includes(path)) files.push(path)
    }
  }
}

const traced = []
const untraced = []
const broken = []

for (const path of files.sort()) {
  /* The audit's own prose is about the rule, not a claim under it. */
  /*
   * A DOCUMENT THAT DEFINES THE MARKER IS NOT A CLAIM MADE WITH IT. Two
   * files, named rather than pattern-matched, and both of them are about the
   * rule: this script, and the contributor guide that states it. Everything
   * else in the tree is scanned, including every doc.
   */
  if (path === 'scripts/audit-measurements.mjs' || path === BASELINE) continue
  if (path === 'CLAUDE.md') continue
  if (path.startsWith('measurements/')) continue

  const text = readFileSync(path, 'utf8')
  if (!CLAIM.test(text)) continue

  const blocks = extname(path) === '.md' ? markdownBlocks(text) : commentBlocks(text)
  for (const block of blocks) {
    const body = block.lines.join('\n')
    if (!CLAIM.test(body)) continue

    const claimLine = block.lines.find((l) => CLAIM.test(l)) ?? block.lines[0]
    const lineNumber = block.start + block.lines.findIndex((l) => CLAIM.test(l))
    const where = `${path}:${lineNumber}`
    const summary = claimLine.replace(/^\s*[*/]*\s*/, '').trim().slice(0, 92)
    /* Stable across edits that move the line but not the words. */
    const key = `${path}::${summary.slice(0, 48).trim()}`

    const refs = [...body.matchAll(REFERENCE)].map((m) => m[0])
    if (refs.length === 0) {
      untraced.push({ where, summary, key })
      continue
    }

    for (const ref of refs) {
      if (!existsSync(ref)) {
        broken.push({ where, summary, detail: `names ${ref}, which does not exist` })
        continue
      }
      const fileText = readFileSync(ref, 'utf8')
      const missing = numeralsIn(body).filter((n) => !fileHas(fileText, n))
      if (missing.length > 0) {
        broken.push({
          where,
          summary,
          detail: `${ref} does not contain ${missing.join(', ')}`,
        })
        continue
      }
      traced.push({ where, summary, ref })
    }
  }
}

/* --------------------------------------------------------------- baseline */

const baselineText = existsSync(BASELINE) ? readFileSync(BASELINE, 'utf8') : ''
/*
 * KEYED ON THE CLAIM'S TEXT, NOT ITS LINE NUMBER.
 *
 * The first version keyed on path:line. Adding one line to PlanMode.tsx moved
 * two claims down by one, which made them look NEW and made their baseline
 * entries look STALE -- four failures from an edit that touched neither
 * claim. A ratchet that fires on unrelated edits is a ratchet people learn to
 * regenerate without reading, which is how it stops being a ratchet.
 *
 * The keys live in a generated block at the foot of the file so the prose
 * above it stays something a person reads rather than a data format.
 */
const RATCHET = /<!-- ratchet\n([\s\S]*?)-->/
const baselineKeys = new Set(
  (RATCHET.exec(baselineText)?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== ''),
)

console.log('### measured claims')
console.log(`  files scanned        ${files.length}`)
console.log(`  traced               ${traced.length}`)
console.log(`  untraced             ${untraced.length}`)
console.log(`  broken references    ${broken.length}`)

if (traced.length > 0) {
  console.log('\n### traced')
  for (const row of traced) console.log(`  ${row.where}  ->  ${row.ref}`)
}

if (broken.length > 0) {
  console.log('\n### broken')
  for (const row of broken) {
    console.log(`  ${row.where}`)
    console.log(`    ${row.summary}`)
    fail(`${row.where} ${row.detail}`)
  }
}

if (untraced.length > 0) {
  console.log('\n### untraced  (no measurements/ file named)')
  for (const row of untraced) {
    const known = baselineKeys.has(row.key)
    console.log(`  ${known ? ' ' : 'NEW '}${row.where}`)
    console.log(`      ${row.summary}`)
    if (!known) {
      fail(
        `${row.where} is a NEW measured claim with no measurements/ file. ` +
          'Name the file the run wrote, or do not call it measured.',
      )
    }
  }
}

/*
 * A BASELINE ENTRY THAT MATCHES NOTHING IS ALSO A FAILURE. Without this the
 * list silently becomes a collection of line numbers nobody can find, which
 * is how an exceptions list rots into noise.
 */
const live = new Set(untraced.map((r) => r.key))
const stale = [...baselineKeys].filter((key) => !live.has(key))
if (stale.length > 0) {
  console.log('\n### baseline entries that no longer match anything')
  for (const key of stale) fail(`${BASELINE} still lists "${key}", which is no longer an untraced claim`)
}

if (process.env.SCOUTNGO_RATCHET === '1') {
  console.log('\n<!-- ratchet')
  for (const row of untraced) console.log(row.key)
  console.log('-->')
}

console.log(`\n=== MEASUREMENT PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)

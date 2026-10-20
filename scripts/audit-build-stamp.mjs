/*
 * THE DOCUMENT AND THE BUNDLE MUST CARRY THE SAME BUILD ID.
 *
 * Usage:  node scripts/audit-build-stamp.mjs     (run after npm run build)
 * Exits:  0 when dist/index.html and the dist bundle agree about which
 *         commit produced them.
 *
 * WHY THIS IS A GATE AND NOT A COMMENT.
 *
 * The whole stale-build mechanism rests on one comparison: the id compiled
 * into the running BUNDLE against the id stamped into the DOCUMENT the server
 * is handing out right now. If a build ever produced two different ids, every
 * copy of the app would compare a build against itself, conclude it was stale,
 * and say so forever -- and since a cold load now adopts a newer build on its
 * own, it would reload in a loop instead.
 *
 * They were computed by two separate calls to buildId(), each shelling out to
 * git at a different moment of the same build. Nothing checked. They are one
 * constant now, and this is what keeps them one: a refactor that reintroduces
 * a second source fails here rather than in somebody's pocket.
 *
 * READ FROM THE BUILD OUTPUT, not from the config. Reading vite.config.ts and
 * reasoning about it would be checking the intention; reading dist/ is
 * checking the artifact that actually ships.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

let problems = 0
const fail = (line) => {
  console.log('      PROBLEM: ' + line)
  problems += 1
}

if (!existsSync('dist/index.html')) {
  console.log('\n=== BUILD STAMP AUDIT ABORTED: no dist/index.html. Run npm run build first. ===')
  process.exit(2)
}

const html = readFileSync('dist/index.html', 'utf8')
const inDocument = /<meta[^>]+name=["']scoutngo-build["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1]

console.log('### the document and the bundle agree about which commit built them')
console.log(`  document   ${inDocument ?? '(no meta tag)'}`)

if (inDocument === undefined) {
  fail('dist/index.html carries no scoutngo-build meta tag; nothing can tell a phone it is stale')
} else if (inDocument === '' || inDocument === '__BUILD_ID__') {
  fail(`the meta tag was never stamped: it reads "${inDocument}"`)
}

/*
 * The bundle's id is a string literal after minification, so it is found by
 * looking for the id rather than for the name it had in the source.
 */
const bundles = readdirSync('dist/assets').filter((f) => f.endsWith('.js'))
const carrying = bundles.filter((f) =>
  inDocument !== undefined && readFileSync(`dist/assets/${f}`, 'utf8').includes(inDocument),
)
console.log(`  bundle     ${carrying.length} of ${bundles.length} chunk(s) carry it: ${carrying.join(', ') || 'none'}`)

if (inDocument !== undefined && carrying.length === 0) {
  fail(
    `no chunk in dist/assets contains "${inDocument}", so the bundle was built from a ` +
      'different id than the document was stamped with',
  )
}

/*
 * AND THE ID IS THE COMMIT, when there is one to check against. A build from
 * a clean checkout should stamp that checkout's HEAD; a build that stamps
 * something else is reporting a commit that did not produce it, which is the
 * exact thing the About screen is relied on to rule out.
 */
let head = null
try {
  head = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
} catch {
  head = null
}

if (head !== null && inDocument !== undefined) {
  const stamped = inDocument.replace(/\+$/, '')
  console.log(`  git HEAD   ${head}`)
  if (stamped !== 'dev' && stamped !== head) {
    fail(`the build is stamped ${stamped} but HEAD is ${head}: the stamp names a different commit`)
  }
}

console.log('\n=== BUILD STAMP PROBLEMS: ' + problems + ' ===')
process.exit(problems === 0 ? 0 : 1)

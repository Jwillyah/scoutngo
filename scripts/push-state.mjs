#!/usr/bin/env node
/*
 * WHAT IS COMMITTED HERE AND WHAT IS ON ORIGIN.
 *
 * WHY THIS EXISTS. Three days of field reports were made against a deployed
 * build that was four commits behind, and a whole pass went on re-fixing
 * things that were already fixed and sitting unpushed on a laptop. The
 * pre-commit hook gated every one of those commits and then said nothing
 * about them never leaving the machine: the gate and the deploy were two
 * different things with nothing connecting them.
 *
 * Same shape as every other bug that week. Two answers to one question, and
 * the person holding the phone was the last to find out.
 *
 * IT DOES NOT PUSH, DELIBERATELY. Pushing stays something a person asks for.
 * This only makes the state impossible to not know: it is printed after every
 * commit by .githooks/post-commit, and it is what every report ends with.
 *
 * `--json` for something to read, bare for a person.
 */
import { execSync } from 'node:child_process'

const git = (cmd, fallback = null) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return fallback
  }
}

const branch = git('rev-parse --abbrev-ref HEAD', 'HEAD')
const head = git('rev-parse --short=7 HEAD', 'unknown')
const headSubject = git('log -1 --pretty=%s', '')
const upstream = git(`rev-parse --abbrev-ref ${branch}@{upstream}`)

/*
 * The remote ref as this machine last saw it. NOT fetched here: a hook that
 * reaches the network on every commit is a hook people disable. It is stated
 * as a local read so a stale one is never mistaken for a live one.
 */
const remote = upstream === null ? null : git(`rev-parse --short=7 ${upstream}`)
const counts = upstream === null ? null : git(`rev-list --left-right --count ${upstream}...HEAD`)
const [behind, ahead] = counts === null ? [0, 0] : counts.split(/\s+/).map(Number)
const dirty = git('status --porcelain', '') !== ''

const state = {
  branch,
  head,
  headSubject,
  upstream,
  remote,
  ahead,
  behind,
  dirty,
  /** The one thing a report has to lead with when it is true. */
  unpushed: ahead > 0,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(state, null, 2))
  process.exit(0)
}

const RED = '[31m'
const GREEN = '[32m'
const DIM = '[2m'
const OFF = '[0m'

if (upstream === null) {
  console.log(`${RED}! ${branch} has no upstream. Nothing here has ever been pushed.${OFF}`)
  console.log(`${DIM}  local ${head}  ${headSubject}${OFF}`)
  process.exit(0)
}

const line = `local ${head}   ${upstream} ${remote}   ahead ${ahead}, behind ${behind}`

if (ahead > 0) {
  console.log(`${RED}! ${ahead} commit${ahead === 1 ? '' : 's'} NOT PUSHED. ${line}${OFF}`)
  console.log(
    `${RED}  Nothing deployed includes ${ahead === 1 ? 'it' : 'them'}. A field test now tests ${remote}.${OFF}`,
  )
  console.log(`${DIM}  git push origin ${branch}${OFF}`)
} else if (behind > 0) {
  console.log(`${RED}! ${behind} commit${behind === 1 ? '' : 's'} behind. ${line}${OFF}`)
} else {
  console.log(`${GREEN}pushed. ${line}${OFF}`)
}

if (dirty) console.log(`${DIM}  working tree has uncommitted changes${OFF}`)

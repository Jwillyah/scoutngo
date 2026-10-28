import { execFileSync, spawnSync } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE PUSH GATE BUILDS THE COMMIT, NOT THE DISK.
 *
 * e1f3959 reached origin without four files it imported, because every check
 * ran against the working directory. .githooks/pre-push builds each pushed
 * commit in a clean worktree instead. The full replay (npm ci, tsc, build,
 * tests) takes half a minute and lives in the hook, not here; this pins the
 * parts that would quietly turn it back into a check of the disk.
 */
const HOOK = '.githooks/pre-push'
const source = readFileSync(HOOK, 'utf8')

describe('the push gate', () => {
  it('is wired: hooks come from .githooks and the hook is executable', () => {
    const hooksPath = execFileSync('git', ['config', 'core.hooksPath']).toString().trim()
    expect(hooksPath.endsWith('.githooks')).toBe(true)
    expect(() => accessSync(HOOK, constants.X_OK)).not.toThrow()
  })

  it('checks out the pushed sha into its own worktree, and asserts it got that sha, clean', () => {
    expect(source).toMatch(/worktree add --detach "\$tree" "\$sha"/)
    expect(source).toMatch(/rev-parse HEAD\)"\s*\n\s*\[ "\$got" = "\$\(git rev-parse "\$sha"\)" \]/)
    expect(source).toMatch(/status --porcelain\)" \]/)
  })

  it('installs, type-checks, builds and tests inside that worktree, in that order', () => {
    const steps = ['npm ci', 'npx tsc -b', 'npm run build', 'npm test'].map((step) =>
      source.indexOf(`( cd "$tree" && ${step}`),
    )
    for (const at of steps) expect(at).toBeGreaterThan(-1)
    expect([...steps].sort((a, b) => a - b)).toEqual(steps)
  })

  it('runs, and lets a delete-only push through without building anything', () => {
    const zero = '0'.repeat(40)
    const run = spawnSync('bash', [HOOK], {
      input: `(delete) ${zero} refs/heads/gone ${zero}\n`,
      encoding: 'utf8',
    })
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('nothing to build')
  })
})

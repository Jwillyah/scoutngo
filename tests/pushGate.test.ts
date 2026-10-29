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

  /*
   * "✓ tests (N passed)", never a bare "✓". vitest colours its summary when
   * the terminal forces colour, and the old grep for "^ *Tests" never matched
   * past the escape code in front of it (29 Oct).
   */
  it('reads the test count through vitest colour, and refuses when there is none', () => {
    const fn = source.match(/^test_count\(\) \{[\s\S]*?^\}/m)?.[0]
    expect(fn).toBeDefined()
    const coloured = ' \x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m2704 passed\x1b[39m\x1b[22m\x1b[90m (2704)\x1b[39m\n'
    const count = (log: string) =>
      spawnSync('bash', ['-c', `${fn}\ntest_count /dev/stdin`], { input: log, encoding: 'utf8' }).stdout.trim()
    expect(count(coloured)).toBe('2704')
    expect(count('      Tests  12 passed (12)\n')).toBe('12')
    expect(count('no summary at all\n')).toBe('')
    expect(source).toContain('echo "${GREEN}✓ tests ($passed passed)${OFF}"')
    expect(source).toMatch(/\[ -n "\$passed" \] \|\| refuse/)
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

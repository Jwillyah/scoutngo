import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * THE GATE AND THE DEPLOY ARE CONNECTED NOW.
 *
 * "The pre-commit hook gates but never pushes, so the gate and the deploy have
 * been two different things with nothing connecting them. Same shape as every
 * other bug this week: two answers to one question."
 *
 * Three days of field reports went against a deployed build four commits
 * behind. Nothing was wrong with any check: each one answered its own question
 * correctly, and nobody owned the question of whether the work had left the
 * laptop.
 *
 * NO AUTO-PUSH. Pushing stays something a person asks for. What changed is
 * that the state is stated, loudly, at the moment it changes.
 */
const ROOT = new URL('../', import.meta.url).pathname

describe('the push state is printed after every commit', () => {
  it('has a post-commit hook, and it is executable', () => {
    const hook = `${ROOT}.githooks/post-commit`
    expect(existsSync(hook)).toBe(true)
    /* A hook without the execute bit is a hook git silently ignores. */
    expect(statSync(hook).mode & 0o111).toBeGreaterThan(0)
  })

  it('runs the push-state script', () => {
    expect(readFileSync(`${ROOT}.githooks/post-commit`, 'utf8')).toContain(
      'scripts/push-state.mjs',
    )
  })

  /*
   * AND IT DOES NOT PUSH. Asked for explicitly: "Do not add an auto-push. I
   * want pushing to stay a thing I ask for."
   */
  it('pushes nothing, in either the hook or the script', () => {
    /*
     * RUNNING a push, not MENTIONING one. The script prints `git push origin
     * main` as the next step, which is the opposite of doing it: the first
     * version of this test could not tell those apart and failed on the
     * suggestion. So it looks for execution, which in these three files means
     * a shell line that starts with it or a push inside an exec call.
     */
    const RUNS_PUSH = [
      /^\s*git\s+push/m,
      /exec[A-Za-z]*\(\s*[`'"][^`'"]*git\s+push/,
      /\bgit\(\s*[`'"]\s*push/,
    ]
    for (const file of ['.githooks/post-commit', '.githooks/pre-commit', 'scripts/push-state.mjs']) {
      const source = readFileSync(`${ROOT}${file}`, 'utf8')
      for (const pattern of RUNS_PUSH) {
        expect(pattern.test(source), `${file} runs git push`).toBe(false)
      }
    }
  })

  /* The check can fail: it catches a push that is actually run. */
  it('would catch an auto-push if one were added', () => {
    const RUNS_PUSH = [
      /^\s*git\s+push/m,
      /exec[A-Za-z]*\(\s*[`'"][^`'"]*git\s+push/,
      /\bgit\(\s*[`'"]\s*push/,
    ]
    for (const planted of [
      'set -e\ngit push origin main\n',
      "execSync('git push origin main')",
      "git(`push origin ${branch}`)",
    ]) {
      expect(RUNS_PUSH.some((p) => p.test(planted)), planted).toBe(true)
    }
    /* And does not fire on the script telling somebody to push. */
    expect(RUNS_PUSH.some((p) => p.test('console.log(`  git push origin ${branch}`)'))).toBe(false)
  })

  /* The script answers, rather than erroring, in this very repository. */
  it('reports local HEAD, the remote hash and how far ahead', () => {
    const out = execFileSync('node', [`${ROOT}scripts/push-state.mjs`, '--json'], {
      encoding: 'utf8',
    })
    const state = JSON.parse(out) as Record<string, unknown>
    for (const key of ['branch', 'head', 'upstream', 'remote', 'ahead', 'behind', 'unpushed']) {
      expect(state, `missing ${key}`).toHaveProperty(key)
    }
    expect(typeof state.ahead).toBe('number')
    expect(typeof state.unpushed).toBe('boolean')
    /* unpushed is exactly "there is something ahead", not a separate opinion. */
    expect(state.unpushed).toBe((state.ahead as number) > 0)
  })

  it('names the branch and a seven character head', () => {
    const state = JSON.parse(
      execFileSync('node', [`${ROOT}scripts/push-state.mjs`, '--json'], { encoding: 'utf8' }),
    ) as { head: string; branch: string }
    expect(state.head).toMatch(/^[0-9a-f]{7}$/)
    expect(state.branch.length).toBeGreaterThan(0)
  })
})

/**
 * AND THE STAMP IN THE APP ANSWERS THE SAME QUESTION ON THE PHONE.
 *
 * The hook covers the laptop. The stamp covers the person holding the phone,
 * who was the one actually hurt by this.
 */
describe('the build stamp compares itself', () => {
  const stamp = readFileSync(`${ROOT}src/components/BuildStamp.tsx`, 'utf8')
  const build = readFileSync(`${ROOT}src/lib/build.ts`, 'utf8')

  it('asks origin rather than printing a hash to compare by hand', () => {
    expect(stamp).toContain('checkOrigin')
    expect(build).toContain('api.github.com')
  })

  it('knows whether the running build was ever pushed', () => {
    expect(build).toContain('BUILD_PUSHED')
    const vite = readFileSync(`${ROOT}vite.config.ts`, 'utf8')
    expect(vite).toContain('__BUILD_PUSHED__')
    expect(vite).toContain('git branch -r --contains HEAD')
  })

  /* The repo is read from the remote, so a fork checks its own origin. */
  it('does not hard-code a repository', () => {
    const vite = readFileSync(`${ROOT}vite.config.ts`, 'utf8')
    expect(vite).toContain('git remote get-url origin')
    const code = build.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    expect(code).not.toContain('Jwillyah')
  })

  /* And the origin request carries nothing about the shoot. */
  it('sends only a repository name to github', () => {
    const code = build.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    const call = code.slice(code.indexOf('export async function checkOrigin'))
    for (const leak of ['venue', 'lat', 'lon', 'position', 'coordinate']) {
      expect(call.toLowerCase(), `checkOrigin mentions ${leak}`).not.toContain(leak)
    }
  })
})

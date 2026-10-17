import { describe, expect, it, vi } from 'vitest'
import {
  BUILD_ID,
  buildStampLines,
  checkOrigin,
  originCommitsUrl,
  type BuildCheck,
  type BuildFacts,
  type OriginCheck,
} from './build.ts'

const CURRENT: BuildCheck = { status: 'current' }

const reply = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch

/*
 * THE QUESTION NOTHING IN THE APP COULD ANSWER.
 *
 * checkForNewBuild asks "is this phone holding a stale copy of what is
 * deployed". That held. The question that cost three days was "is what is
 * DEPLOYED behind the repository", and every check agreed everything was
 * current, because by its own measure it was.
 */
describe('asking origin what the newest commit is', () => {
  it('builds the public, keyless URL for the repo it was built from', () => {
    expect(originCommitsUrl('Jwillyah/scoutngo')).toBe(
      'https://api.github.com/repos/Jwillyah/scoutngo/commits/main',
    )
  })

  it('says behind when origin has a commit this build does not', async () => {
    const result = await checkOrigin(
      'owner/repo',
      reply({ sha: 'abcdef1234', commit: { committer: { date: '2026-10-17T16:13:03Z' } } }),
    )
    expect(result.status).toBe('behind')
    if (result.status !== 'behind') return
    expect(result.origin).toBe('abcdef1')
    expect(result.when).toBe('2026-10-17T16:13:03Z')
  })

  it('says current when origin is on this very commit', async () => {
    const result = await checkOrigin('owner/repo', reply({ sha: `${BUILD_ID}0000000` }))
    /* In a test run BUILD_ID is "dev", which has no commit to compare. */
    expect(['current', 'unknown']).toContain(result.status)
  })

  /*
   * IT FAILS QUIETLY AND SAYS WHY. No signal, a rate limit, a private fork:
   * all of them are unknown, which claims neither answer.
   */
  it('is unknown rather than wrong when origin will not answer', async () => {
    for (const [fetcher, reason] of [
      [reply({}, false, 403), 'rate limit'],
      [reply({}, false, 404), 'did not answer'],
      [reply({ nothing: true }), 'did not answer'],
      [vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch, 'no answer'],
    ] as const) {
      const result = await checkOrigin('owner/repo', fetcher)
      expect(result.status).toBe('unknown')
      if (result.status !== 'unknown') return
      expect(result.reason.toLowerCase()).toContain(reason)
    }
  })

  it('says so rather than checking the wrong repository when there is none', async () => {
    const result = await checkOrigin('', reply({ sha: 'x' }))
    expect(result.status).toBe('unknown')
    if (result.status !== 'unknown') return
    expect(result.reason).toContain('no repository')
  })

  /* It sends nothing about the shoot. The URL is the same for every user. */
  it('sends only the repository name', async () => {
    const fetcher = reply({ sha: 'abcdef1234567' })
    await checkOrigin('owner/repo', fetcher)
    const [url, init] = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]
    expect(url).toBe('https://api.github.com/repos/owner/repo/commits/main')
    expect(JSON.stringify(init)).not.toContain('lat')
    expect(url).not.toMatch(/\d+\.\d+/)
  })
})

/*
 * THE STAMP ANSWERS, RATHER THAN HANDING OVER A HASH TO COMPARE.
 * "A stamp I have to compare by hand is a stamp I will not check, which is
 * exactly what happened."
 */
describe('what the stamp says', () => {
  /* A clean, pushed, real commit, so each test varies one thing on purpose. */
  const CLEAN: BuildFacts = { id: 'aaaaaaa', dirty: false, pushed: true }

  const lines = (
    origin: OriginCheck | null,
    deployed: BuildCheck = CURRENT,
    build: BuildFacts = CLEAN,
  ) => buildStampLines(build, origin, deployed).map((line) => `${line.tone}|${line.text}`)

  it('leads with being behind origin, as a loss', () => {
    const said = lines({ status: 'behind', origin: 'abcdef1', when: '2026-10-17T16:13:03Z' })
    expect(said.some((line) => line.startsWith('loss|'))).toBe(true)
    expect(said.join(' ')).toContain('behind the repository')
    expect(said.join(' ')).toContain('abcdef1')
    expect(said.join(' ')).toContain('2026-10-17')
  })

  it('says a stale phone is stale, separately from being behind origin', () => {
    const said = lines({ status: 'current', origin: 'aaaaaaa' }, { status: 'stale', deployed: 'bbbbbbb' })
    expect(said.join(' ')).toContain('bbbbbbb is deployed')
    expect(said.join(' ')).toContain('Reload')
  })

  /* Both can be true at once, and both have to be said. */
  it('says both when both are true', () => {
    const said = lines(
      { status: 'behind', origin: 'ccccccc', when: null },
      { status: 'stale', deployed: 'bbbbbbb' },
    )
    expect(said.filter((line) => line.startsWith('loss|')).length).toBeGreaterThanOrEqual(2)
  })

  it('admits when it could not check, rather than implying everything is fine', () => {
    const said = lines({ status: 'unknown', reason: 'the rate limit was reached' })
    expect(said.join(' ')).toContain('Could not check')
    expect(said.join(' ')).toContain('rate limit')
    expect(said.some((line) => line.startsWith('loss|'))).toBe(false)
  })

  it('says nothing reassuring while the check is still in flight', () => {
    expect(lines(null).join(' ')).not.toContain('newest commit on origin')
  })

  /*
   * NO FALSE ALL-CLEAR. The only line that says everything is current requires
   * every one of the four conditions, because this is the message that cost
   * three days by being implied when it was not true.
   */
  it('says it is the newest commit only when all four are true', () => {
    const current: OriginCheck = { status: 'current', origin: 'aaaaaaa' }
    expect(lines(current).join(' ')).toContain('newest commit on origin')

    /* Remove each condition in turn and the reassurance has to disappear. */
    for (const [label, said] of [
      ['stale phone', lines(current, { status: 'stale', deployed: 'bbbbbbb' })],
      ['unpushed', lines(current, CURRENT, { ...CLEAN, pushed: false })],
      ['dirty tree', lines(current, CURRENT, { ...CLEAN, dirty: true })],
      ['behind origin', lines({ status: 'behind', origin: 'bbbbbbb', when: null })],
      ['unknown', lines({ status: 'unknown', reason: 'offline' })],
    ] as const) {
      expect(said.join(' '), label).not.toContain('newest commit on origin')
    }
  })

  /*
   * THE CASE THAT ACTUALLY HAPPENED, end to end: a local build of unpushed
   * work, which looks exactly like a deployed one on the same laptop.
   */
  it('says plainly when the running code was never pushed', () => {
    const said = lines({ status: 'behind', origin: '46d56a7', when: null }, CURRENT, {
      id: 'ca7afaa',
      dirty: false,
      pushed: false,
    })
    expect(said.join(' ')).toContain('never pushed')
    expect(said.join(' ')).toContain('Nothing deployed contains this code')
    expect(said.filter((line) => line.startsWith('loss|')).length).toBe(2)
  })

  it('has nothing to say about a dev build beyond that it is one', () => {
    const said = lines(null, CURRENT, { id: 'dev', dirty: true, pushed: false })
    expect(said).toEqual(['fact|A dev build. There is no commit behind this one.'])
  })
})

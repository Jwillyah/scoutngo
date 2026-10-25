import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NO BROWSER SPEECH RECOGNITION. On most phones it streams the audio to a
 * server the shooter did not pick. Dictation is the keyboard's own microphone
 * into an ordinary text box. Reading aloud (speech synthesis) stays on the
 * phone and is allowed.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const FORBIDDEN = /\b(webkit)?SpeechRecognition\b|\bSpeechGrammarList\b/

describe('no speech recognition', () => {
  const all = files('src').filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))

  it('scans the app source', () => {
    expect(all.length).toBeGreaterThan(100)
  })

  it('never asks the browser to recognise speech', () => {
    const hits = all.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })

  it('would catch it', () => {
    expect(FORBIDDEN.test('new window.webkitSpeechRecognition()')).toBe(true)
    expect(FORBIDDEN.test('new SpeechSynthesisUtterance(text)')).toBe(false)
  })
})

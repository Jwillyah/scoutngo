import { describe, expect, it } from 'vitest'
import { parseShotList, SHOT_LIST_CAP } from './shotList.ts'

describe('parseShotList', () => {
  it('splits a pasted list into lines', () => {
    const shots = parseShotList('Boats hitting pilings\nCrowd reaction\nDrone establisher')
    expect(shots.map((s) => s.text)).toEqual([
      'Boats hitting pilings',
      'Crowd reaction',
      'Drone establisher',
    ])
  })

  it('strips bullets, dashes and numbering the sender used', () => {
    const shots = parseShotList('- Boats hitting pilings\n2. Crowd reaction\n* Drone pass\n• Dock bar sign')
    expect(shots.map((s) => s.text)).toEqual([
      'Boats hitting pilings',
      'Crowd reaction',
      'Drone pass',
      'Dock bar sign',
    ])
  })

  it('drops blank lines and stray punctuation', () => {
    expect(parseShotList('A shot\n\n\n-\n \nAnother shot')).toHaveLength(2)
  })

  it('caps the list so a pasted novel cannot blow the prompt', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Shot number ${i}`).join('\n')
    expect(parseShotList(many)).toHaveLength(SHOT_LIST_CAP)
  })

  it('caps each line', () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
    expect(parseShotList(long)[0].text.split(' ')).toHaveLength(20)
  })

  it('gives every line a stable id', () => {
    expect(parseShotList('One\nTwo').map((s) => s.id)).toEqual(['want-1', 'want-2'])
  })

  it('survives empty input', () => {
    expect(parseShotList('')).toEqual([])
  })
})

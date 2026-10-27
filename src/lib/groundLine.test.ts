import { describe, expect, it } from 'vitest'
import { groundLine } from './groundLine.ts'

describe('a ground view with no picture is one line', () => {
  it('a failure says so briefly, with Retry', () => {
    expect(groundLine({ status: 'error', message: 'Could not reach the ground view function.' }, false, false)).toEqual({ text: "Ground view didn't load", retry: true })
  })
  it('no imagery says so, no Retry: asking again will not change it', () => {
    expect(groundLine({ status: 'no-coverage', message: 'No Street View imagery at this spot.' }, false, false)).toEqual({ text: 'No Street View imagery at this spot.', retry: false })
  })
  it('a picture, or one still coming, is not a line', () => {
    expect(groundLine({ status: 'loading' }, false, false)).toBeNull()
    expect(groundLine({ status: 'ok', image: 'x' }, false, false)).toBeNull()
  })
})

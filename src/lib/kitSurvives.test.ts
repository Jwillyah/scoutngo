import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT, type Body, type Drone, type KitProfile, type Lens } from '../core/kit.ts'
import { defaultOpticFor, opticsFor } from '../core/optics.ts'
import { auditKit, describeDropped, kitAuditHasNews, kitAuditLines } from './kitAudit.ts'
import {
  defaultSelection,
  reviveKitProfile,
  reviveSelection,
  type KitSelection,
} from './kitSelection.ts'
import { droneAvailable } from './planRequest.ts'
import { mergeSpots, type Spot } from './spots.ts'

/**
 * GEAR ADDED BY HAND SURVIVES A SAVE AND A RELOAD.
 *
 * "That bug class is the same family as everything else this week: data
 * quietly disappearing with no error."
 *
 * The bug: a stored SELECTION was revived against DEFAULT_KIT rather than
 * against the shooter's own profile, so an id the shipped kit had never heard
 * of was filtered out on every reload. The gear stayed in the kit editor; the
 * tick next to it did not, silently, and a spot saved in that state recorded
 * the loss.
 *
 * So the round trip is tested at every hop it actually makes: profile through
 * JSON, selection through JSON, selection through a saved spot, and then the
 * thing that depends on all three, which is whether an air position can be
 * made at all.
 */

const MY_BODY: Body = {
  id: 'fx3',
  name: 'Sony FX3',
  role: 'video',
  sensor: 'fullFrame',
  /* A body the shipped kit never heard of, so nobody has recorded its pixels. */
  horizontalPixels: null,
  verticalPixels: null,
  notes: 'Bought after the kit shipped.',
}

const MY_LENS: Lens = {
  id: 'laowa-9',
  name: 'Laowa 9mm f5.6',
  minFocalLength: 9,
  maxFocalLength: 9,
  maxAperture: 5.6,
  forcesSensor: [],
  notes: 'Rectilinear ultra wide.',
}

const MY_DRONE: Drone = {
  id: 'mini-4-pro',
  name: 'DJI Mini 4 Pro',
  weightGrams: 249,
  maxWindMps: null,
  maxWindSource: '',
  notes: 'Sub-250g, so a different rule set.',
  cameras: [
    {
      id: 'mini-4-wide',
      name: 'Mini 4 wide',
      equiv35: 24,
      maxAperture: 1.7,
      sensorNote: '1/1.3-inch',
      publishedDiagonalFOV: 82.1,
    },
  ],
}

/** The shooter's kit: the shipped one plus the three things they added. */
const MINE: KitProfile = {
  ...DEFAULT_KIT,
  bodies: [...DEFAULT_KIT.bodies, MY_BODY],
  lenses: [...DEFAULT_KIT.lenses, MY_LENS],
  drones: [...DEFAULT_KIT.drones, MY_DRONE],
}

/** Everything packed, including the three new things. */
const PACKED: KitSelection = defaultSelection(MINE)

/** What localStorage actually does to a value: JSON out and back. */
const roundTrip = <T,>(value: T): unknown => JSON.parse(JSON.stringify(value)) as unknown

describe('the profile survives localStorage', () => {
  const back = reviveKitProfile(roundTrip(MINE))

  it('keeps the hand-added body', () => {
    expect(back.bodies.map((b) => b.id)).toContain('fx3')
    expect(back.bodies.find((b) => b.id === 'fx3')).toEqual(MY_BODY)
  })

  it('keeps the hand-added lens', () => {
    expect(back.lenses.map((l) => l.id)).toContain('laowa-9')
    expect(back.lenses.find((l) => l.id === 'laowa-9')).toEqual(MY_LENS)
  })

  it('keeps the hand-added aircraft and its camera', () => {
    const drone = back.drones.find((d) => d.id === 'mini-4-pro')
    expect(drone).toBeDefined()
    expect(drone?.cameras.map((c) => c.id)).toEqual(['mini-4-wide'])
  })

  it('keeps the shipped gear alongside it', () => {
    expect(back.bodies.length).toBe(DEFAULT_KIT.bodies.length + 1)
    expect(back.lenses.length).toBe(DEFAULT_KIT.lenses.length + 1)
    expect(back.drones.length).toBe(DEFAULT_KIT.drones.length + 1)
  })
})

/*
 * THE HOP THAT WAS BROKEN. The selection has to be revived against the
 * shooter's own profile. Against the shipped one, every added id is filtered
 * out and comes back unticked with nothing said.
 */
describe('the selection survives localStorage', () => {
  const profile = reviveKitProfile(roundTrip(MINE))

  it('keeps all three ticked when revived against my own kit', () => {
    const back = reviveSelection(roundTrip(PACKED), profile)
    expect(back.bodyIds).toContain('fx3')
    expect(back.lensIds).toContain('laowa-9')
    expect(back.droneIds).toContain('mini-4-pro')
  })

  it('loses all three when revived against the shipped kit, which was the bug', () => {
    const wrong = reviveSelection(roundTrip(PACKED), DEFAULT_KIT)
    expect(wrong.bodyIds).not.toContain('fx3')
    expect(wrong.lensIds).not.toContain('laowa-9')
    expect(wrong.droneIds).not.toContain('mini-4-pro')
  })

  /* And it still drops an id that resolves against nothing at all. */
  it('still drops an id no kit has', () => {
    const stale = { ...PACKED, droneIds: [...PACKED.droneIds, 'air-3s'] }
    expect(reviveSelection(roundTrip(stale), profile).droneIds).not.toContain('air-3s')
    expect(reviveSelection(roundTrip(stale), profile).droneIds).toContain('mini-4-pro')
  })
})

/*
 * THE HOP THAT CARRIED THE LOSS FORWARD. A spot saved while the selection was
 * stripped recorded the stripped selection, so the loss outlived the session.
 */
describe('a saved spot keeps the gear it was saved with', () => {
  const spot: Spot = {
    id: 's1',
    name: 'Capital Trace',
    savedAt: '2026-10-17T12:00:00.000Z',
    venue: {
      name: 'Capital Trace',
      latitude: '37.0869',
      longitude: '-76.4746',
      date: '2026-10-17',
      startTime: '16:00',
      endTime: '18:30',
      eventDescription: '',
      desiredOutcome: '',
      subjectAcrossMeters: '',
    },
    kit: PACKED,
    positions: [],
    marks: [],
  }

  const loaded = (spots: Spot[]) => reviveSelection(roundTrip(spots[0].kit), reviveKitProfile(roundTrip(MINE)))

  it('survives being written to a file and read back', () => {
    const back = loaded(roundTrip([spot]) as Spot[])
    expect(back.bodyIds).toContain('fx3')
    expect(back.lensIds).toContain('laowa-9')
    expect(back.droneIds).toContain('mini-4-pro')
  })

  it('survives being merged with other spots', () => {
    const merged = mergeSpots([], roundTrip([spot]) as Spot[])
    expect(loaded(merged).droneIds).toContain('mini-4-pro')
  })
})

/*
 * AND THE THING THAT ALL OF IT DECIDES. The reported symptom was never "my
 * lens list is short", it was a Drone chip that offered a flight and handed
 * back a ground position. So the round trip ends here.
 */
describe('after the round trip, the added aircraft can still fly', () => {
  const profile = reviveKitProfile(roundTrip(MINE))
  const onlyMine: KitSelection = {
    ...reviveSelection(roundTrip(PACKED), profile),
    droneIds: ['mini-4-pro'],
  }

  it('says it can fly', () => {
    expect(droneAvailable(onlyMine, profile)).toBe(true)
  })

  it('offers its own camera and nothing else', () => {
    expect(opticsFor('air', profile, onlyMine).map((o) => o.name)).toEqual(['Mini 4 wide'])
  })

  it('starts a new air position on it', () => {
    expect(defaultOpticFor('air', profile, onlyMine)?.id).toBe('mini-4-wide')
  })

  /* The whole chain fails if any hop drops the id, which is the point. */
  it('would not fly if the selection had been revived against the shipped kit', () => {
    const stripped = reviveSelection(roundTrip(onlyMine), DEFAULT_KIT)
    expect(droneAvailable(stripped, profile)).toBe(false)
  })
})

/**
 * AND THE SHOOTER IS TOLD WHAT IS IN STORAGE. "Tell me what the current
 * stored kit actually contains versus the shipped list, so I know whether I
 * lost anything."
 */
describe('the kit screen reports what storage holds', () => {
  const profile = reviveKitProfile(roundTrip(MINE))

  it('names the three things that are mine and not shipped', () => {
    const audit = auditKit(roundTrip(MINE), profile, PACKED)
    expect(audit.added.map((ref) => ref.name).sort()).toEqual([
      'DJI Mini 4 Pro',
      'Laowa 9mm f5.6',
      'Sony FX3',
    ])
    expect(kitAuditLines(audit).some((line) => line.text.includes('Sony FX3'))).toBe(true)
  })

  it('says nothing at all about an untouched shipped kit', () => {
    const audit = auditKit(roundTrip(DEFAULT_KIT), DEFAULT_KIT, defaultSelection(DEFAULT_KIT))
    expect(kitAuditHasNews(audit)).toBe(false)
    expect(kitAuditLines(audit)).toEqual([])
  })

  it('notices shipped gear the shooter has removed', () => {
    const fewer: KitProfile = { ...DEFAULT_KIT, lenses: DEFAULT_KIT.lenses.slice(1) }
    const audit = auditKit(roundTrip(fewer), fewer, defaultSelection(fewer))
    expect(audit.removed.map((ref) => ref.name)).toEqual([DEFAULT_KIT.lenses[0].name])
  })

  /*
   * A REAL LOSS, REPORTED AS ONE, AND NAMED.
   *
   * reviveKitProfile drops entries that fail validation and nothing else
   * would ever say so. Dropping is right: a half-read lens would compute a
   * field of view from undefined. But "1 stored lens could not be read back"
   * does not say WHICH one to re-add, so the line carries whatever was
   * legible in the entry.
   */
  it('names what it could read of a dropped lens', () => {
    const corrupt = {
      ...(roundTrip(MINE) as Record<string, unknown>),
      /* A real-looking lens missing forcesSensor, so it fails validation. */
      lenses: [
        ...MINE.lenses,
        { id: 'sigma-30', name: 'Sigma 30', minFocalLength: 30, maxFocalLength: 30, maxAperture: 1.4 },
      ],
    }
    const revived = reviveKitProfile(corrupt)
    expect(revived.lenses.some((l) => l.name === 'Sigma 30')).toBe(false)

    const audit = auditKit(corrupt, revived, PACKED)
    expect(audit.unreadable).toHaveLength(1)
    expect(audit.unreadable[0].kind).toBe('lens')
    expect(audit.unreadable[0].fragment).toBe('Sigma 30, 30mm, f1.4')

    const loss = kitAuditLines(audit).find((line) => line.tone === 'loss')
    expect(loss?.text).toContain('A stored lens could not be read back')
    expect(loss?.text).toContain('It looked like: Sigma 30, 30mm, f1.4.')
    expect(loss?.text).toContain('Add it again')
  })

  it('reads a zoom range, and a prime as one figure', () => {
    expect(
      describeDropped('lens', { name: 'Sony 70-200', minFocalLength: 70, maxFocalLength: 200 }),
    ).toBe('Sony 70-200, 70-200mm')
    expect(describeDropped('lens', { minFocalLength: 50, maxFocalLength: 50 })).toBe('50mm')
  })

  /* It never fills in the half it does not have. */
  it('does not assume a prime from one focal length', () => {
    expect(describeDropped('lens', { minFocalLength: 24 })).toBe('24mm and no longer end')
    expect(describeDropped('lens', { maxFocalLength: 70 })).toBe('up to 70mm')
  })

  it('describes a body and an aircraft by what they carry', () => {
    expect(describeDropped('body', { name: 'Sony FX3', sensor: 'fullFrame', role: 'video' })).toBe(
      'Sony FX3, full frame, video',
    )
    expect(describeDropped('drone', { name: 'Mini 4', weightGrams: 249, cameras: [{}] })).toBe(
      'Mini 4, 249g, 1 camera',
    )
  })

  /*
   * NOTHING LEGIBLE SAYS SO, rather than inventing a description. An invented
   * name on a loss notice is the same failure as an invented reading anywhere
   * else in this app.
   */
  it('says nothing was legible when nothing was', () => {
    for (const nothing of [{}, { name: '' }, { name: 42 }, { name: '   ' }, null, 'x', 7]) {
      expect(describeDropped('lens', nothing), JSON.stringify(nothing)).toBeNull()
    }
    const audit = auditKit(
      { ...(roundTrip(MINE) as Record<string, unknown>), lenses: [...MINE.lenses, {}] },
      MINE,
      PACKED,
    )
    const loss = kitAuditLines(audit).find((line) => line.tone === 'loss')
    expect(loss?.text).toContain('Nothing in it was legible')
    expect(loss?.text).not.toContain('It looked like')
  })

  /* The id is a last resort, not the headline. */
  it('falls back to the id only when there is nothing human', () => {
    expect(describeDropped('lens', { id: 'laowa-9' })).toBe('id laowa-9')
    expect(describeDropped('lens', { id: 'laowa-9', name: 'Laowa 9mm' })).toBe('Laowa 9mm')
  })

  /*
   * IT IS CORRUPT DATA GOING ON A SCREEN. A 40,000 character name must not
   * take the kit screen with it, and control bytes must not reach the DOM.
   */
  it('caps and cleans what it prints', () => {
    const long = describeDropped('lens', { name: 'x'.repeat(500) })
    expect(long!.length).toBeLessThan(50)
    expect(long!.endsWith('...')).toBe(true)

    /* And a truncated fragment is not given a second full stop after it. */
    const audit = auditKit(
      {
        ...(roundTrip(MINE) as Record<string, unknown>),
        lenses: [...MINE.lenses, { name: 'x'.repeat(500) }],
      },
      MINE,
      PACKED,
    )
    const loss = kitAuditLines(audit).find((line) => line.tone === 'loss')
    expect(loss?.text).not.toContain('....')
    expect(loss?.text).toContain('... Add it again')
    expect(describeDropped('lens', { name: 'Sig\u0000ma\u00079' })).toBe('Sig ma 9')
  })

  /* One line per entry, so two losses are two lines rather than a count. */
  it('reports each dropped entry separately', () => {
    const corrupt = {
      ...(roundTrip(MINE) as Record<string, unknown>),
      lenses: [...MINE.lenses, { name: 'One' }, { name: 'Two' }],
    }
    const audit = auditKit(corrupt, reviveKitProfile(corrupt), PACKED)
    expect(audit.unreadable).toHaveLength(2)
    const losses = kitAuditLines(audit).filter((line) => line.tone === 'loss')
    expect(losses).toHaveLength(2)
    expect(losses[0].text).toContain('One')
    expect(losses[1].text).toContain('Two')
  })

  /*
   * THE AUDIT AND THE REVIVER ASK THE SAME QUESTION. If they ever disagree,
   * the reviver drops a lens while the report says everything arrived, which
   * is the drift this whole week has been spent closing.
   */
  it('agrees with the reviver about what is readable', () => {
    const entries = [
      { id: 'a', name: 'A', minFocalLength: 1, maxFocalLength: 2, forcesSensor: [] },
      { id: 'b', name: 'B', minFocalLength: 1, maxFocalLength: 2 },
      { id: 'c', name: 'C', forcesSensor: [] },
      { name: 'D', minFocalLength: 1, maxFocalLength: 2, forcesSensor: [] },
    ]
    const corrupt = { ...(roundTrip(MINE) as Record<string, unknown>), lenses: entries }
    const revived = reviveKitProfile(corrupt)
    const audit = auditKit(corrupt, revived, PACKED)
    expect(revived.lenses).toHaveLength(1)
    expect(audit.unreadable).toHaveLength(3)
    expect(revived.lenses.length + audit.unreadable.length).toBe(entries.length)
  })

  it('reports the whole profile falling back to the shipped one', () => {
    const broken = { id: 'mine', name: 'Mine', lenses: 'not an array' }
    const revived = reviveKitProfile(broken)
    expect(revived).toEqual(DEFAULT_KIT)
    const audit = auditKit(broken, revived, PACKED)
    expect(audit.profileReplaced).toBe(true)
    expect(kitAuditLines(audit)[0].text).toContain('could not be read')
  })

  /* A selection pointing at gear that is gone is the stripping bug, seen late. */
  it('reports a packed id that resolves against nothing', () => {
    const audit = auditKit(roundTrip(DEFAULT_KIT), DEFAULT_KIT, {
      ...defaultSelection(DEFAULT_KIT),
      droneIds: ['air-3s'],
    })
    expect(audit.dangling).toEqual([{ kind: 'drone', id: 'air-3s' }])
    expect(kitAuditLines(audit).some((line) => line.text.includes('air-3s'))).toBe(true)
  })

  /*
   * IT NEVER SAYS THE KIT IS FINE. Nothing to report is the absence of lines,
   * which is the same rule the hazard layer runs on.
   */
  it('has no line that reassures', () => {
    for (const audit of [
      auditKit(roundTrip(MINE), reviveKitProfile(roundTrip(MINE)), PACKED),
      auditKit(roundTrip(DEFAULT_KIT), DEFAULT_KIT, defaultSelection(DEFAULT_KIT)),
    ]) {
      for (const line of kitAuditLines(audit)) {
        for (const word of ['all present', 'nothing lost', 'intact', 'complete', 'all good']) {
          expect(line.text.toLowerCase(), `says "${word}"`).not.toContain(word)
        }
      }
    }
  })
})

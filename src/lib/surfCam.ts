import { camDistance } from '../core/surfRange.ts'
import { resolveCam, type CamAt } from '../core/camPick.ts'

/*
 * THE CAM THE PHONE REMEMBERS (Batch SIMPLE-2, Section 6.3). One id in
 * localStorage; nothing about it leaves the phone, and no cam image is kept:
 * the phone loads it from the owner. The list is src/core/camPick.ts surfCams.
 */
export const SURF_CAM_KEY = 'scoutngo.surfCam.v1'

export function readSurfCam(): string | null {
  try {
    const v = localStorage.getItem(SURF_CAM_KEY)
    return v === null || v === '' ? null : v
  } catch {
    return null
  }
}

export function keepSurfCam(id: string): void {
  try {
    localStorage.setItem(SURF_CAM_KEY, id)
  } catch {
    /* private mode: it is just not remembered */
  }
}

/** The cam shown big: the remembered one when it is still in reach, else the nearest. Null with no cam. */
export function bigCam(list: readonly CamAt[], remembered: string | null): { cam: CamAt; yours: boolean } | null {
  const mine = resolveCam(remembered, list)
  if (mine !== null) return { cam: mine, yours: true }
  return list[0] === undefined ? null : { cam: list[0], yours: false }
}

/**
 * "3.2 mi · HDOnTap · plays here" / "0.0 mi · Surfline, paid · link out": how far, whose cam, and whether the owner
 * lets the app show it. The owner is said because one pier can have two cams under one name (Virginia Beach Pier:
 * Surfchex's free one and Surfline's paid one), two rows that read as a duplicate without it.
 */
export function camLine(c: CamAt, miles: boolean): string {
  return `${camDistance(c.km, miles)} · ${c.cam.operator}${c.cam.access === 'paid' ? ', paid' : ''} · ${c.cam.embed ? 'plays here' : 'link out'}`
}

import { PHONE_MAIN_LONG_SIDE_DEG } from '../core/arProjection.ts'

/*
 * THE PHONE CAMERA'S FIELD, AS THE SHOOTER SETS IT. A web page cannot read
 * it, so the viewfinder assumes a main camera of about 69 degrees along the
 * long side (a 26 mm equivalent) and says so in its "i", where this number
 * can be changed for a phone that differs. Kept on this phone like any other
 * setting; it is about the phone, not about anyone.
 */
const KEY = 'scoutngo.phoneFov.v1'
export const PHONE_FOV_MIN = 40
export const PHONE_FOV_MAX = 130

export function clampPhoneFov(deg: number): number {
  if (!Number.isFinite(deg)) return PHONE_MAIN_LONG_SIDE_DEG
  return Math.min(PHONE_FOV_MAX, Math.max(PHONE_FOV_MIN, Math.round(deg)))
}

export function readPhoneFov(): number {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? PHONE_MAIN_LONG_SIDE_DEG : clampPhoneFov(Number(raw))
  } catch {
    return PHONE_MAIN_LONG_SIDE_DEG
  }
}

export function writePhoneFov(deg: number): number {
  const kept = clampPhoneFov(deg)
  try {
    if (kept === PHONE_MAIN_LONG_SIDE_DEG) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(kept))
  } catch {
    /* Not kept; this session still uses it. */
  }
  return kept
}

/**
 * Which listed camera is the ultra-wide, by its label. Safari names its back
 * cameras ("Back Ultra Wide Camera"); a page only sees labels once the camera
 * has been allowed, so this is asked after getUserMedia. Null when none is
 * listed, which the viewfinder says rather than offering a switch it cannot make.
 */
export function ultraWideOf(devices: readonly { kind: string; deviceId: string; label: string }[]): string | null {
  const hit = devices.find((d) => d.kind === 'videoinput' && /ultra[\s-]?wide|0[.,]5\s*[x×]/i.test(d.label))
  return hit === undefined || hit.deviceId === '' ? null : hit.deviceId
}

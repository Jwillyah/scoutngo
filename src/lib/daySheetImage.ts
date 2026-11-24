/*
 * THE DAY SHEET AS A PICTURE, DRAWN ON THE PHONE (Batch SIMPLE-3, Section 4).
 * A canvas, no server, no request: the picture is made here and handed to the
 * share sheet as a file; where the phone cannot share files it is shown for a
 * long press to save. It never leaves the phone any other way.
 * Colours are the app's tokens, read from the page at draw time.
 */
export interface SheetPicture {
  title: string
  /** "Atlantic Park Surf · Sat 21 Nov". */
  sub: string
  /** Header then rows, as the page shows them: time, sun, light, cloud, wind, rain. */
  head: string[]
  rows: { cells: string[]; current: boolean; band: string | null }[]
  /** The warnings line, when there is one. */
  warning: string | null
  /** "from 9:12 AM", when the forecast shown is old or kept. */
  age: string | null
}

export const PICTURE_WIDTH = 1080
const PAD = 56
const ROW = 76
const COLS = [0, 150, 380, 690, 810, 960]
const BAND_TOKEN: Record<string, string> = { golden: '--sun-rise', side: '--sun', top: '--grey-1', blue: '--sun-shadow' }

const token = (name: string, fallback: string): string => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v === '' ? fallback : v
  } catch {
    return fallback
  }
}

/** The height the picture needs for this content. */
export function pictureHeight(p: SheetPicture): number {
  return PAD + 150 + ROW + p.rows.length * ROW + (p.warning === null ? 0 : 150) + 90 + PAD
}

/** Draws the sheet on a canvas context of PICTURE_WIDTH × pictureHeight(p). */
export function drawSheet(ctx: CanvasRenderingContext2D, p: SheetPicture): void {
  const h = pictureHeight(p)
  const ground = token('--black', '#000000')
  const ink = token('--white', '#ffffff')
  const dim = token('--grey-1', '#b4b4b4')
  const gold = token('--sun', '#ffd54a')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, PICTURE_WIDTH, h)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = ink
  ctx.font = '600 64px system-ui, sans-serif'
  ctx.fillText(p.title, PAD, PAD + 40)
  ctx.fillStyle = dim
  ctx.font = '400 36px system-ui, sans-serif'
  ctx.fillText(p.sub, PAD, PAD + 104)
  let y = PAD + 150
  ctx.font = '600 28px system-ui, sans-serif'
  p.head.forEach((c, i) => ctx.fillText(c.toUpperCase(), PAD + COLS[i], y + ROW / 2))
  y += ROW
  for (const r of p.rows) {
    if (r.current) {
      ctx.fillStyle = token('--surface-3', '#2e2a36')
      ctx.fillRect(PAD - 20, y, PICTURE_WIDTH - 2 * PAD + 40, ROW)
    }
    ctx.font = '600 36px system-ui, sans-serif'
    r.cells.forEach((c, i) => {
      ctx.fillStyle = i === 0 ? gold : ink
      ctx.fillText(c, PAD + COLS[i] + (i === 2 && r.band !== null ? 36 : 0), y + ROW / 2)
    })
    if (r.band !== null) {
      ctx.fillStyle = token(BAND_TOKEN[r.band] ?? '--grey-1', dim)
      ctx.beginPath()
      ctx.arc(PAD + COLS[2] + 12, y + ROW / 2, 12, 0, Math.PI * 2)
      ctx.fill()
    }
    y += ROW
  }
  if (p.warning !== null) {
    ctx.fillStyle = ink
    ctx.font = '400 34px system-ui, sans-serif'
    wrap(ctx, p.warning, PICTURE_WIDTH - 2 * PAD).forEach((line, i) => ctx.fillText(line, PAD, y + 50 + i * 46))
    y += 150
  }
  ctx.fillStyle = dim
  ctx.font = '400 30px system-ui, sans-serif'
  ctx.fillText(`ScoutNGo${p.age === null ? '' : ` · forecast ${p.age}`}`, PAD, y + 40)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`
    if (ctx.measureText(next).width > width && line !== '') {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line !== '') lines.push(line)
  return lines.slice(0, 2)
}

/** The picture as a PNG blob, or null where the phone cannot draw one. */
export async function renderSheet(p: SheetPicture): Promise<Blob | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = PICTURE_WIDTH
    canvas.height = pictureHeight(p)
    const ctx = canvas.getContext('2d')
    if (ctx === null) return null
    drawSheet(ctx, p)
    return await new Promise<Blob | null>((done) => canvas.toBlob((b) => done(b), 'image/png'))
  } catch {
    return null
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'show'

/** Hands the picture to the share sheet as a file; 'show' when the phone cannot share files (the page then shows it to long-press and save). */
export async function shareSheet(blob: Blob, name: string): Promise<ShareResult> {
  const file = new File([blob], name, { type: 'image/png' })
  try {
    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name.replace(/\.png$/, '') })
      return 'shared'
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
  }
  return 'show'
}

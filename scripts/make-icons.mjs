/*
 * Generates the PWA icons in public/icons/.
 *
 * Committed PNGs with no source are a maintenance trap: nobody can change the
 * colour or the mark without redrawing by hand and nobody can tell whether the
 * icon still matches src/styles/tokens.css. So the icons are generated from the
 * tokens, by this script, with zlib from the standard library and no dependency
 * on an image toolchain.
 *
 *   node scripts/make-icons.mjs
 *
 * Run it after changing the palette below, then commit the PNGs it writes. It is
 * not wired into `npm run build`: icons change about once a year and a build step
 * that rewrites binary files on every install is worse than a manual command.
 *
 * THE MARK. A field of view cone opening away from the sun, with a white dot at
 * the apex where the shooter stands. That is the whole product in three shapes:
 * here is where you stand, here is what you see, here is where the light is.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'icons')

/* Straight from src/styles/tokens.css. Keep them in step. */
const BLACK = [0x0a, 0x0b, 0x09] // --black
const ACCENT = [0xd6, 0xf8, 0x4c] // --accent, electric lime
const SUN = [0xff, 0xd5, 0x4a] // --sun
const MARK = [0xff, 0xff, 0xff] // --mark

/* The mark, in a 0..1 square. Redraw here, not in a pixel editor. */
const APEX = { x: 0.28, y: 0.8 }
const CONE = { bearingDeg: 42, halfAngleDeg: 27, radius: 0.66 }
const SUNSPOT = { x: 0.22, y: 0.2, r: 0.115 }
const APEX_DOT = 0.05

const SAMPLES = 4 // per axis, so 16 coverage samples a pixel

const toRad = (deg) => (deg * Math.PI) / 180

function inCone(x, y) {
  const dx = x - APEX.x
  // Screen y grows downward; negate so a positive angle points up the image.
  const dy = -(y - APEX.y)
  const distance = Math.hypot(dx, dy)
  if (distance > CONE.radius || distance === 0) return false
  const angle = Math.atan2(dy, dx)
  let delta = angle - toRad(CONE.bearingDeg)
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  return Math.abs(delta) <= toRad(CONE.halfAngleDeg)
}

const inCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) <= r

/**
 * Coverage of each shape at one pixel, 0 to 1, by supersampling. Antialiasing the
 * edges matters more here than anywhere else in the app: a 192px icon with hard
 * stair-stepped diagonals looks broken on a phone home screen.
 *
 * `scale` shrinks the mark about the centre. Maskable icons get 0.8 so nothing
 * important sits in the 20% a launcher may crop away.
 */
function coverage(px, py, size, scale) {
  let cone = 0
  let sun = 0
  let dot = 0

  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const ux = (px + (sx + 0.5) / SAMPLES) / size
      const uy = (py + (sy + 0.5) / SAMPLES) / size
      // Undo the shrink, so the shapes are still defined in the 0..1 space above.
      const x = (ux - 0.5) / scale + 0.5
      const y = (uy - 0.5) / scale + 0.5

      if (inCone(x, y)) cone += 1
      if (inCircle(x, y, SUNSPOT.x, SUNSPOT.y, SUNSPOT.r)) sun += 1
      if (inCircle(x, y, APEX.x, APEX.y, APEX_DOT)) dot += 1
    }
  }

  const total = SAMPLES * SAMPLES
  return { cone: cone / total, sun: sun / total, dot: dot / total }
}

const over = (under, above, alpha) => Math.round(under * (1 - alpha) + above * alpha)

/** RGBA pixels for one icon. Painted back to front: cone, sun, then the apex dot. */
function render(size, scale) {
  const pixels = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { cone, sun, dot } = coverage(x, y, size, scale)
      const channels = [0, 1, 2].map((c) => {
        let value = BLACK[c]
        value = over(value, ACCENT[c], cone)
        value = over(value, SUN[c], sun)
        value = over(value, MARK[c], dot)
        return value
      })

      const offset = (y * size + x) * 4
      pixels[offset] = channels[0]
      pixels[offset + 1] = channels[1]
      pixels[offset + 2] = channels[2]
      // Fully opaque throughout. A transparent icon picks up whatever the launcher
      // puts behind it, and this palette only reads on near-black.
      pixels[offset + 3] = 255
    }
  }

  return pixels
}

/* -------------------------------------------------------------- PNG encoding */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type 6, truecolour with alpha
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  // One filter byte per scanline. Filter 0 is "none": flat colour compresses
  // fine without the extra passes, and this keeps the encoder readable.
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------- outputs */

const icons = [
  // The two sizes the manifest needs, full bleed.
  { name: 'icon-192.png', size: 192, scale: 1 },
  { name: 'icon-512.png', size: 512, scale: 1 },
  /*
   * Maskable, for Android adaptive icons. The safe zone is the centre circle of
   * 80% diameter, so every shape has to sit inside radius 0.4 of the centre.
   * The furthest thing out is the SUN, whose outer edge is 0.525 from centre
   * unscaled; 0.75 brings it to 0.394 and 0.8 would leave a sliver of it to be
   * cropped. Measured, not guessed: if the mark moves, redo this arithmetic.
   */
  { name: 'icon-maskable-512.png', size: 512, scale: 0.75 },
  /*
   * iOS reads apple-touch-icon and rounds the corners itself. 180 is the size
   * current iPhones ask for.
   */
  { name: 'apple-touch-icon.png', size: 180, scale: 1 },
]

mkdirSync(outDir, { recursive: true })
for (const icon of icons) {
  const png = encodePng(icon.size, render(icon.size, icon.scale))
  writeFileSync(join(outDir, icon.name), png)
  console.log(`${icon.name.padEnd(26)} ${icon.size}x${icon.size}  ${png.length} bytes`)
}

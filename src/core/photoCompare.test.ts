import { describe, expect, it } from 'vitest'
import { brightest, distanceToEdges, edgeAgreement, edges, findHorizon, horizonDipDeg, horizonRow, luminance, project } from './photoCompare.ts'

describe('the horizon a camera should see', () => {
  it('dips below level with height: 0.28 deg from 89 m, with standard refraction', () => {
    /* acos(r / (r + h)) with r = R / 0.87: 0.2826 deg at 88.8 m. */
    expect(horizonDipDeg(88.8)).toBeCloseTo(0.2826, 3)
    expect(horizonDipDeg(0)).toBe(0)
  })
  it('a level camera at sea level puts it across the middle; tilted down 5 deg, above it', () => {
    expect(horizonRow(0, 0, 40, 1000)).toBeCloseTo(500, 9)
    /* f = 500 / tan 20 = 1373.7 px; tan 5 deg x f = 120.2 px above the middle. */
    expect(horizonRow(0, -5, 40, 1000)).toBeCloseTo(500 - 1373.74 * Math.tan((5 * Math.PI) / 180), 1)
  })
  it('agrees with the pinhole projection of a point on the horizon', () => {
    const dip = horizonDipDeg(120)
    const p = project({ azimuth: 30, altitude: -dip }, { yaw: 30, pitch: -6 }, { horizontalDeg: 60, verticalDeg: 45 }, { width: 800, height: 600 })
    expect(p?.y).toBeCloseTo(horizonRow(120, -6, 45, 600), 6)
  })
})

describe('the pinhole', () => {
  const fov = { horizontalDeg: 60, verticalDeg: 45 }
  const size = { width: 800, height: 600 }
  it('puts what the camera looks at in the middle, and behind it nowhere', () => {
    expect(project({ azimuth: 100, altitude: 10 }, { yaw: 100, pitch: 10 }, fov, size)).toEqual({ x: 400, y: 300 })
    expect(project({ azimuth: 280, altitude: 0 }, { yaw: 100, pitch: 0 }, fov, size)).toBeNull()
  })
  it('right of the heading is right in the frame, up is up', () => {
    const p = project({ azimuth: 110, altitude: 5 }, { yaw: 100, pitch: 0 }, fov, size)
    expect(p !== null && p.x > 400 && p.y < 300).toBe(true)
  })
})

describe('the horizon in the pixels', () => {
  /* An RGBA picture from a function of the row and column. */
  const picture = (w: number, h: number, rgb: (x: number, y: number) => [number, number, number]) => {
    const out = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const [r, g, b] = rgb(x, y)
        out.set([r, g, b, 255], (y * w + x) * 4)
      }
    return out
  }
  it('finds the step from a bright sky to a dark sea, despite a post across it', () => {
    const img = picture(60, 80, (x, y) => (x >= 20 && x < 25 && y >= 10 && y < 70 ? [20, 20, 20] : y < 31 ? [200, 200, 200] : [60, 60, 60]))
    expect(findHorizon(img, 60, 80)?.row).toBe(31)
  })
  /*
   * 27 Oct: the strongest step in a sunrise frame was the surf on the sand,
   * and the finder reported it as the horizon.
   */
  it('takes the sea horizon over a stronger surf line below it', () => {
    const img = picture(60, 80, (_x, y) => (y < 25 ? [170, 170, 170] : y < 60 ? [70, 70, 70] : [235, 235, 235]))
    expect(findHorizon(img, 60, 80)?.row).toBe(25)
  })
  /* And over waves: as strong as the horizon where they cross, but not straight across. */
  it('takes the straight line over wandering wave lines', () => {
    const img = picture(60, 80, (x, y) => {
      if (y < 30) return [220, 90, 60]
      const wave = 50 + Math.round(8 * Math.sin(x / 4))
      return Math.abs(y - wave) < 2 ? [250, 250, 250] : [120, 130, 150]
    })
    expect(findHorizon(img, 60, 80)?.row).toBe(30)
  })
  /* A red sky over a grey-blue sea at nearly the same brightness: invisible to luminance, plain in colour. */
  it('sees a colour step that luminance would not', () => {
    const img = picture(40, 60, (_x, y) => (y < 22 ? [215, 70, 60] : [105, 115, 135]))
    const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b
    expect(Math.abs(lum(215, 70, 60) - lum(105, 115, 135))).toBeLessThan(25)
    expect(findHorizon(img, 40, 60)?.row).toBe(22)
  })
  it('says nothing for a picture with no step', () => {
    expect(findHorizon(new Uint8ClampedArray(40 * 40 * 4).fill(100), 40, 40)).toBeNull()
  })
})

describe('the brightest spot and the edges', () => {
  it('finds the sun in a dark sky', () => {
    const w = 100
    const h = 100
    const lum = new Float32Array(w * h).fill(40)
    for (let y = 18; y < 23; y += 1) for (let x = 70; x < 75; x += 1) lum[y * w + x] = 255
    const b = brightest(lum, w)
    expect(b.x).toBeCloseTo(72, 0)
    expect(b.y).toBeCloseTo(20, 0)
  })
  it('scores a render that matches the photo at 0 px, and one moved 6 px clearly worse', () => {
    const w = 64
    const h = 64
    const block = (dx: number) => {
      const lum = new Float32Array(w * h).fill(50)
      for (let y = 20; y < 44; y += 1) for (let x = 20 + dx; x < 40 + dx; x += 1) lum[y * w + x] = 220
      return lum
    }
    const photo = distanceToEdges(edges(block(0), w, h), w, h)
    expect(edgeAgreement(edges(block(0), w, h), photo)?.medianPx).toBe(0)
    /* Its top and bottom edges slide along themselves and still meet the photo's; its sides are 6 px off. */
    const moved = edgeAgreement(edges(block(6), w, h), photo)
    expect(moved?.medianPx).toBeGreaterThanOrEqual(3)
    expect(moved?.within ?? 1).toBeLessThan(edgeAgreement(edges(block(0), w, h), photo)?.within ?? 0)
    expect(luminance(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1)[0]).toBeCloseTo(255, 6)
  })
})

describe("the photo's frame inside the 3D canvas", () => {
  it('a portrait photo in a portrait phone: widths match, top and bottom cut, the engine angle along the height', async () => {
    const { fitPhotoFrame } = await import('./photoCompare.ts')
    /* A 4:5 photo, 27.7 by 34.2 deg, in a 390 x 844 canvas. */
    const f = fitPhotoFrame(390, 844, 27.7, 34.2)
    expect(f.crop.x).toBe(0)
    expect(f.crop.w).toBe(390)
    const tanH = Math.tan((27.7 * Math.PI) / 360)
    const tanV = Math.tan((34.2 * Math.PI) / 360)
    expect(f.crop.h).toBeCloseTo((390 * tanV) / tanH, 6)
    /* The canvas's vertical angle: tanH stretched to 844 / 390. */
    expect(f.engineFovDeg).toBeCloseTo((2 * Math.atan((tanH * 844) / 390) * 180) / Math.PI, 6)
  })
  it('a landscape photo in a landscape canvas wider than it: heights match, the sides cut', async () => {
    const { fitPhotoFrame } = await import('./photoCompare.ts')
    const f = fitPhotoFrame(1600, 600, 60, 45)
    expect(f.crop.y).toBe(0)
    expect(f.crop.h).toBe(600)
    expect(f.crop.w).toBeLessThan(1600)
  })
})

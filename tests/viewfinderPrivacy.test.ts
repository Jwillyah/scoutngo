import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE CAMERA PICTURE NEVER LEAVES THE <video>.
 *
 * "No user data leaves the phone except what the user sends on purpose." The
 * viewfinder holds the most personal data the app has ever touched: a live
 * picture of wherever the phone is. So the rule is structural: the files that
 * touch the camera stream are read, and any way of turning that stream into
 * something storable or sendable -- a canvas copy, an encoded image, a
 * recorder, a frame grab, a network call, storage -- fails this test.
 */
const FILES = ['src/components/Viewfinder.tsx']

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bdrawImage\b/, why: 'copies a frame onto a canvas' },
  { pattern: /\bgetImageData\b|\btoDataURL\b|\btoBlob\b|\bconvertToBlob\b/, why: 'encodes or reads pixels' },
  { pattern: /\bMediaRecorder\b/, why: 'records the stream' },
  { pattern: /\bImageCapture\b|\bgrabFrame\b|\btakePhoto\b/, why: 'grabs a frame' },
  { pattern: /\bcaptureStream\b|\bVideoFrame\b|\bMediaStreamTrackProcessor\b/, why: 'reads frames from the stream' },
  { pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\bRTCPeerConnection\b/, why: 'can send something off the phone' },
  { pattern: /\blocalStorage\b|\bindexedDB\b|\bcaches\b|\bsessionStorage\b/, why: 'can store something' },
  { pattern: /<canvas\b|createElement\(\s*['"]canvas/, why: 'makes a canvas' },
]

const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

describe('the viewfinder keeps the picture on the screen', () => {
  for (const file of FILES) {
    const code = strip(readFileSync(file, 'utf8'))

    it(`${file} has no way to copy, record, store or send a frame`, () => {
      for (const { pattern, why } of FORBIDDEN) {
        const hit = pattern.exec(code)
        expect(hit, `${file} ${why}: "${hit?.[0] ?? ''}"`).toBeNull()
      }
    })

    it(`${file} stops the camera when it closes`, () => {
      expect(code).toMatch(/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/)
    })

    /* Positive: the scan is looking at the file that really opens the camera. */
    it(`${file} is the file that opens the camera`, () => {
      expect(code).toContain('getUserMedia')
      expect(code).toContain('srcObject')
    })
  }

  it('would catch each way of leaking a frame', () => {
    const leaks = [
      'ctx.drawImage(video, 0, 0)',
      'canvas.toDataURL("image/jpeg")',
      'new MediaRecorder(stream)',
      'new ImageCapture(track).grabFrame()',
      "fetch('/api/x', { body })",
      'localStorage.setItem("f", data)',
      "document.createElement('canvas')",
      'navigator.sendBeacon(url, blob)',
    ]
    for (const line of leaks) expect(FORBIDDEN.some(({ pattern }) => pattern.test(line)), line).toBe(true)
  })
})

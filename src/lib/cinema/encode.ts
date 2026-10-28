/*
 * TURNING RENDERED FRAMES INTO A STEADY 30 FPS CLIP.
 *
 * The preview is rendered one frame at a time, as slowly as the phone needs.
 * Each frame is handed here with its number; its place in the clip is its
 * number over the frame rate, never the time it took to draw. So the clip is
 * steady on any phone.
 *
 *   WebCodecs   VideoEncoder (H.264) with each frame's own timestamp, put in
 *               an MP4 by src/lib/cinema/mp4.ts
 *   otherwise   each frame kept as a JPEG, then played back at exactly the
 *               frame rate onto a canvas that MediaRecorder records: the
 *               drawing is cheap, so the pace holds
 */
import { writeMp4, type EncodedFrame } from './mp4.ts'

export interface ClipEncoder {
  /** Adds the canvas as frame `index` (0, 1, 2 ...). */
  add(canvas: HTMLCanvasElement, index: number): Promise<void>
  finish(onProgress?: (share: number) => void): Promise<Blob | null>
  kind: 'webcodecs' | 'mediarecorder'
}

const CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f']

async function webCodecs(width: number, height: number, fps: number): Promise<ClipEncoder | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null
  let codec: string | null = null
  for (const c of CODECS) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: c, width, height, bitrate: 8_000_000, framerate: fps, avc: { format: 'avc' } })
      if (s.supported === true) {
        codec = c
        break
      }
    } catch {
      /* The next. */
    }
  }
  if (codec === null) return null
  const frames: EncodedFrame[] = []
  let avcC: Uint8Array | null = null
  let failed: unknown = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      frames.push({ data, key: chunk.type === 'key' })
      const d = meta?.decoderConfig?.description
      if (d !== undefined && avcC === null) avcC = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice() : new Uint8Array(d).slice()
    },
    error: (e) => {
      failed = e
    },
  })
  encoder.configure({ codec, width, height, bitrate: 8_000_000, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' })
  const us = 1_000_000 / fps
  return {
    kind: 'webcodecs',
    add: async (canvas, index) => {
      /* Hold the queue short so a long clip does not pile frames in memory. */
      while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 5))
      const frame = new VideoFrame(canvas, { timestamp: Math.round(index * us), duration: Math.round(us) })
      encoder.encode(frame, { keyFrame: index % fps === 0 })
      frame.close()
    },
    finish: async () => {
      await encoder.flush()
      encoder.close()
      if (failed !== null || avcC === null || frames.length === 0) return null
      return new Blob([writeMp4(frames, avcC, width, height, fps) as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })
    },
  }
}

function paced(width: number, height: number, fps: number): ClipEncoder | null {
  if (typeof MediaRecorder === 'undefined') return null
  const kept: Blob[] = []
  return {
    kind: 'mediarecorder',
    add: async (canvas, index) => {
      const b = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (b !== null) kept[index] = b
    },
    finish: async (onProgress) => {
      const out = document.createElement('canvas')
      out.width = width
      out.height = height
      const ctx = out.getContext('2d')
      if (ctx === null || kept.length === 0) return null
      /* Decoded ahead, so drawing each one on time is all the loop does. */
      const images = await Promise.all(kept.map((b) => createImageBitmap(b)))
      ctx.drawImage(images[0], 0, 0)
      const type = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = new MediaRecorder(out.captureStream(fps), type === '' ? undefined : { mimeType: type })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.start()
      const start = performance.now()
      await new Promise<void>((resolve) => {
        const tick = () => {
          const i = Math.floor(((performance.now() - start) / 1000) * fps)
          if (i >= images.length) return resolve()
          ctx.drawImage(images[i], 0, 0)
          onProgress?.(i / images.length)
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      for (const im of images) im.close()
      return new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
        recorder.stop()
      })
    },
  }
}

/** Width and height rounded down to even numbers (H.264 wants them), at most `maxSide` on the long side. */
export function clipSize(width: number, height: number, maxSide = 1280): { width: number; height: number } {
  const s = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(2, Math.floor((width * s) / 2) * 2), height: Math.max(2, Math.floor((height * s) / 2) * 2) }
}

export async function clipEncoder(width: number, height: number, fps: number): Promise<ClipEncoder | null> {
  return (await webCodecs(width, height, fps)) ?? paced(width, height, fps)
}

/*
 * WHAT THE 3D VIEW PUTS ON THE GPU, BY OUR OWN COUNT (Batch FIX, Section
 * 0.3). WebKit tells a page nothing about its memory, so the app adds up what
 * it creates: every texture (4 bytes a pixel, a third more with mipmaps),
 * every geometry's buffers, the shadow map, and the canvas's own drawing
 * buffer (colour and depth, times the antialias samples). It is a lower
 * bound: the driver's own overhead is not counted. Settings › Debug shows it
 * as "3D memory 82 MB of 150"; src/core/lite3d.ts holds the cap.
 */
export interface GpuTexture {
  width: number
  height: number
  mipmaps: boolean
}

export interface GpuCount {
  textures: readonly GpuTexture[]
  /** Byte lengths of every vertex attribute and index buffer. */
  buffers: readonly number[]
  /** The shadow map's side in pixels, or 0 with shadows off. */
  shadowPx: number
  /** The canvas: CSS pixels, the pixel ratio, and the antialias samples (1 without). */
  canvas: { width: number; height: number; dpr: number; samples: number }
}

export const MB = 1e6

export const textureBytes = (t: GpuTexture): number => Math.round(Math.max(0, t.width) * Math.max(0, t.height) * 4 * (t.mipmaps ? 4 / 3 : 1))

/** The drawing buffer: RGBA colour plus a 4-byte depth-stencil, per sample, plus the resolved colour when antialiased. */
export function canvasBytes(c: GpuCount['canvas']): number {
  const px = Math.round(c.width * c.dpr) * Math.round(c.height * c.dpr)
  const samples = Math.max(1, c.samples)
  return px * 8 * samples + (samples > 1 ? px * 4 : 0)
}

export function gpuBytes(c: GpuCount): number {
  const tex = c.textures.reduce((sum, t) => sum + textureBytes(t), 0)
  const buf = c.buffers.reduce((sum, b) => sum + Math.max(0, b), 0)
  /* A depth shadow map: 4 bytes a texel. */
  const shadow = c.shadowPx * c.shadowPx * 4
  return tex + buf + shadow + canvasBytes(c.canvas)
}

/** "3D memory 82 MB of 150", or with no cap (not an iPhone) "3D memory 82 MB". */
export function memoryLine(bytes: number, capBytes: number | null): string {
  const mb = Math.round(bytes / MB)
  return capBytes === null ? `3D memory ${mb} MB` : `3D memory ${mb} MB of ${Math.round(capBytes / MB)}`
}

/** Over the cap? Never with no cap. */
export const overBudget = (bytes: number, capBytes: number | null): boolean => capBytes !== null && bytes > capBytes

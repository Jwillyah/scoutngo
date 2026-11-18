import type { GpuFacts } from '../core/errorReport.ts'

/*
 * WHAT THIS PHONE'S GRAPHICS SAY (Batch 3D, Section 0.4), for Last errors'
 * Copy all: read on the tap from a 1 x 1 canvas whose context is given back at
 * once, never while 3D is drawing.
 */
export function gpuFacts(): GpuFacts | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const gl2 = canvas.getContext('webgl2')
    const gl = gl2 ?? canvas.getContext('webgl')
    if (gl === null) return null
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info === null ? (gl.getParameter(gl.RENDERER) as string | null) : (gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string | null)
    const facts: GpuFacts = { renderer, version: (gl.getParameter(gl.VERSION) as string | null) ?? (gl2 === null ? 'WebGL 1' : 'WebGL 2'), maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number | null }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return facts
  } catch {
    return null
  }
}

/** Plain text onto the clipboard; true when it got there. A textarea and copy when the clipboard API is refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const t = document.createElement('textarea')
      t.value = text
      t.setAttribute('readonly', '')
      t.style.position = 'fixed'
      t.style.opacity = '0'
      document.body.appendChild(t)
      t.select()
      const ok = document.execCommand('copy')
      t.remove()
      return ok
    } catch {
      return false
    }
  }
}

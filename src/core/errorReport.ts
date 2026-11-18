/*
 * LAST ERRORS, AS ONE PASTE (Batch 3D, Section 0.4). Settings › Debug ›
 * Last errors › Copy all puts this plain text on the clipboard; Jwilly pastes
 * it. Nothing is sent anywhere. The build, the browser, what the phone's
 * graphics said, then each error oldest first with its time, screen, message
 * and stack.
 */
export interface GpuFacts {
  /** "Apple GPU", or what the browser would say. */
  renderer: string | null
  /** "WebGL 2.0", or "WebGL 1.0" when only that opened. */
  version: string | null
  maxTexture: number | null
}

export interface ReportError {
  at: string
  where: string
  message: string
  build: string
  stack?: string
}

export function errorReport(r: { build: string; userAgent: string; gpu: GpuFacts | null; errors: readonly ReportError[]; at: Date }): string {
  const gpu =
    r.gpu === null
      ? ['GPU: no WebGL context opened']
      : [`GPU renderer: ${r.gpu.renderer ?? 'not said'}`, `WebGL: ${r.gpu.version ?? 'not said'}`, `Max texture size: ${r.gpu.maxTexture ?? 'not said'}`]
  const head = [`ScoutNGo last errors · copied ${r.at.toISOString()}`, `Build: ${r.build}`, `Browser: ${r.userAgent}`, ...gpu, `Errors: ${r.errors.length}`]
  const body = r.errors.map((e, i) => [`#${i + 1} ${e.at} · ${e.where} · build ${e.build}`, e.message, ...(e.stack === undefined ? [] : [e.stack])].join('\n'))
  return [head.join('\n'), ...body].join('\n\n')
}

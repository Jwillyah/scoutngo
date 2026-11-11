import type { ReactNode } from 'react'
import { prerender } from 'react-dom/static'

/*
 * Batch Polish, Section 1: renderToStaticMarkup draws a React.lazy screen as
 * its fallback (nothing): Beach Section 4's 8 render tests failed on it. This
 * renders and waits for every lazy screen to arrive, as a phone does.
 */
export async function renderAll(node: ReactNode): Promise<string> {
  const { prelude } = await prerender(node)
  return (await new Response(prelude).text()).replace(/<!--\/?\$[!?]?-->/g, '')
}

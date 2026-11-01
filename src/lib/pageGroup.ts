import { createContext } from 'react'

/*
 * THE PAGES OF ONE JOB, as tabs over the page (field test, 30 Oct): Water is
 * Surf · Tides · Wind, Land is Wind · Terrain light (docs/navigation.md).
 * Given by whoever opens the pages, so each page stays as it was.
 */
export interface PageGroupValue {
  label: string
  items: readonly { id: string; label: string }[]
  current: string
  onPick: (id: string) => void
}
export const PageGroup = createContext<PageGroupValue | null>(null)

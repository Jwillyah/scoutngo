/* The detail pages, in their tab order (Batch N, Sections 1-4; src/components/DetailShell.tsx). */
export type DetailId = 'surf' | 'tide' | 'wind' | 'buoys'
export const DETAIL_TABS: readonly { id: DetailId; label: string }[] = [
  { id: 'surf', label: 'Surf' },
  { id: 'tide', label: 'Tide' },
  { id: 'wind', label: 'Wind' },
  { id: 'buoys', label: 'Buoys' },
]

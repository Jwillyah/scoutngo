import { useEffect, useState } from 'react'
import { signalChipWords } from '../core/signalChip.ts'
import { formatClock } from '../core/timezone.ts'
import { useNow } from './useNow.ts'
import { useOnline } from './useOnline.ts'
import { onWeatherChange, weatherShownAt } from './weatherStore.ts'

/** The signal chip's words now (src/core/signalChip.ts), or null for no chip. Batch CORE, Section 7A.6. */
export function useSignalWords(timeZone: string): string | null {
  const online = useOnline()
  const now = useNow(60_000)
  const [shownAt, setShownAt] = useState(weatherShownAt)
  useEffect(() => onWeatherChange(() => setShownAt(weatherShownAt())), [])
  return signalChipWords(online, shownAt, now.getTime(), (d) => formatClock(d, timeZone))
}

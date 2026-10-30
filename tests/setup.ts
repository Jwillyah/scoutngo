import { beforeEach } from 'vitest'
import { clearWeatherStore } from '../src/lib/weatherStore.ts'

/* The shared weather store keeps answers for the session (src/lib/weatherStore.ts); each test starts with none. */
beforeEach(async () => {
  await clearWeatherStore()
})

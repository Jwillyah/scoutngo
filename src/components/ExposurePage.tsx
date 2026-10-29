import type { KitProfile } from '../core/kit.ts'
import type { KitSelection } from '../lib/kitSelection.ts'
import { ExposurePlayground } from './ExposurePlayground.tsx'
import { Page } from './Page.tsx'

/*
 * EXPOSURE, A PAGE OF ITS OWN (29 Oct): out of the Sky tabs, opened from the
 * menu and from Kit. The photo as large as the page leaves it, the light
 * meter, presets and sliders under it; in landscape, side by side. No map,
 * no time bar, no dock; Close goes back to where it was opened.
 */
export function ExposurePage({ kit, bag, onClose }: { kit: KitProfile; bag: KitSelection; onClose: () => void }) {
  return (
    <Page title="Exposure" className="xpage" onClose={onClose}>
      <ExposurePlayground kit={kit} bag={bag} />
    </Page>
  )
}

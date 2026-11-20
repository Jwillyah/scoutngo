import type { CamAt } from '../core/camPick.ts'
import { bigCam, camLine } from '../lib/surfCam.ts'
import '../styles/tapin-surf.css'

/*
 * SURF > CAMS (Batch SIMPLE-2, Section 6.3; board Surf_Cams): the cams tagged
 * surf in reach, nearest first. One big, then the list; a tap picks one and
 * the phone remembers it (src/lib/surfCam.ts). A cam the owner lets the app
 * show plays here (an iframe of the owner's own page, nothing stored by us);
 * every other one is "link out ↗" to the owner's page. No Surfline or
 * Surfchex embed, ever (docs/sources-licenses.md).
 */

export function CamBig({ cam, yours }: { cam: CamAt; yours: boolean }) {
  const tag = `${cam.cam.embed ? 'LIVE' : 'LINK'} · ${cam.cam.name}`
  return cam.cam.embed ? (
    <div className="scams__big" data-cam-big={cam.cam.id}>
      <iframe className="scams__frame" title={cam.cam.name} src={cam.cam.url} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin" />
      <span className="scams__tag">{tag}</span>
    </div>
  ) : (
    <a className="scams__big" href={cam.cam.url} target="_blank" rel="noreferrer noopener" data-cam-big={cam.cam.id}>
      <span className="scams__tag">{`${cam.cam.name}${yours ? ' · your cam' : ''}`}</span>
      <span className="scams__open">{`Open ${cam.cam.operator}'s page for ${cam.cam.name} ↗`}</span>
    </a>
  )
}

export function CamList({ list, picked, onPick, miles }: { list: readonly CamAt[]; picked: string | null; onPick: (id: string) => void; miles: boolean }) {
  const shown = bigCam(list, picked)?.cam.cam.id ?? null
  return (
    <ul className="scams__list" data-cam-list>
      {list.map((c) => (
        <li key={c.cam.id}>
          <button type="button" className="scams__item" aria-pressed={shown === c.cam.id} onClick={() => onPick(c.cam.id)}>
            <span className="scams__name">
              <b>{c.cam.name}</b>
              <span>{`${camLine(c, miles)}${c.cam.embed ? '' : ' ↗'}`}</span>
            </span>
            <span aria-hidden="true">{shown === c.cam.id ? '✓' : '›'}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

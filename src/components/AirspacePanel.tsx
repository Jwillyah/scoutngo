import { useEffect, useState } from 'react'
import {
  AUTHORIZATION_RULE,
  NO_SURFACE_AIRSPACE_NOTE,
  TFR_NOT_CHECKED,
  TFR_URL,
  type AirspaceShape,
} from '../core/airspaceLookup.ts'
import { cycleNote, cycleState } from '../core/chartCycle.ts'
import { DRONEZONE_URL, FAA_SOURCE_NOTE, UASFM_INFORMATIONAL } from '../core/faaSource.ts'
import type { LatLon } from '../core/geo.ts'
import { ROUTE_LABEL, ROUTE_TIMING, laancPath, laancWhy } from '../core/laanc.ts'
import { airspaceAnswer, type AirspaceAnswer } from '../lib/airspace.ts'
import { facilityCellAt, facilityEffective } from '../lib/uasfm.ts'
import { Group } from './Panel.tsx'

interface AirspacePanelProps {
  venue: LatLon | null
  /**
   * The altitude to answer against, in feet AGL.
   *
   * Taken from the plan's air positions rather than asked for again, because
   * the question "which path does this venue take" is only meaningful against
   * an altitude that is actually planned. Null with nothing in the air.
   */
  altitudeFeet: number | null
}

/**
 * WHICH PAPERWORK PATH THIS VENUE TAKES, AND WHETHER AUTHORIZATION ATTACHES.
 *
 * Two questions, two sources, answered separately because they fail
 * separately. The facility map carries a ceiling and is silent outside its own
 * coverage; the airspace extract says whether 107.41 attaches at all. At
 * Sandbridge the first has nothing to say and the second has the answer, which
 * is exactly why both are here.
 *
 * EVERY NUMBER ON THIS PANEL IS COMPUTED ON THIS DEVICE. The venue coordinate
 * is used as an array index into data already in the bundle. Nothing is sent
 * anywhere, there is no key, and the panel works with no signal.
 *
 * NOTHING HERE IS AN AUTHORIZATION, and the panel says so in the FAA's own
 * terms rather than in a disclaimer at the bottom nobody reads.
 */
export function AirspacePanel({ venue, altitudeFeet }: AirspacePanelProps) {
  /*
   * THE ANSWER CARRIES THE PIN IT IS FOR.
   *
   * Not two pieces of state reset on every venue change. Resetting in the
   * effect sets state synchronously during a render pass, and more importantly
   * it leaves a window where a resolved answer for the OLD pin is on screen
   * beside the new one. Keeping the coordinate with the result and comparing
   * during render makes a stale answer unrenderable rather than merely
   * unlikely: if it is not for this pin, it is not shown.
   */
  const [loaded, setLoaded] = useState<{
    at: LatLon
    answer: AirspaceAnswer | null
    failed: boolean
  } | null>(null)

  useEffect(() => {
    if (venue === null) return
    let live = true
    void airspaceAnswer(venue).then(
      (next) => {
        if (live) setLoaded({ at: venue, answer: next, failed: false })
      },
      () => {
        if (live) setLoaded({ at: venue, answer: null, failed: true })
      },
    )
    return () => {
      live = false
    }
  }, [venue])

  const current =
    loaded !== null && venue !== null && loaded.at.lat === venue.lat && loaded.at.lon === venue.lon
      ? loaded
      : null
  const answer = current?.answer ?? null
  const failed = current?.failed ?? false

  if (venue === null) {
    return (
      <Group title="Airspace">
        <p className="air__none">Set a venue to look up its airspace.</p>
      </Group>
    )
  }

  const cell = facilityCellAt(venue.lat, venue.lon)
  /*
   * With nothing in the air there is no altitude to compare, so the ceiling is
   * reported on its own rather than against an invented default. A made-up
   * 200ft would produce a route that looked computed and was not.
   */
  const path = altitudeFeet === null ? null : laancPath(cell, altitudeFeet)
  const cycle = cycleState(facilityEffective, new Date())

  return (
    <div className="air">
      <Group title="LAANC path" meta={path === null ? undefined : ROUTE_LABEL[path.route]}>
        {path === null ? (
          <p className="air__none">
            No air position in the plan, so there is no altitude to compare against the map.
            {cell === null
              ? ' This pin has no facility-map cell either.'
              : ` The map's ceiling for this cell is ${cell.ceilingFeet} ft AGL.`}
          </p>
        ) : (
          <>
            <div className="air__verdict">
              <p className="air__route">{ROUTE_LABEL[path.route]}</p>
              <p className="air__timing">{ROUTE_TIMING[path.route]}</p>
            </div>

            <dl className="air__pair">
              <div className="air__cell">
                <dt>Cell ceiling</dt>
                <dd>
                  {path.route === 'manual' && path.reason === 'outside-coverage' ? (
                    /* A dash, not a zero. There is no ceiling here to print. */
                    <span className="air__dash">—</span>
                  ) : (
                    <span className="num">{path.ceilingFeet} ft</span>
                  )}
                </dd>
              </div>
              <div className="air__cell">
                <dt>Your altitude</dt>
                <dd>
                  <span className="num">{path.altitudeFeet} ft</span>
                </dd>
              </div>
            </dl>

            <p className="air__why">{laancWhy(path)}</p>

            {cell?.facility === null || cell === null ? null : (
              <p className="air__facility">
                Controlling facility: {cell.facility}
                {cell.icao === null ? '' : ` (${cell.icao})`}
                {cell.routes.length === 0
                  ? '. The FAA lists no LAANC routes here.'
                  : `. LAANC routes listed: ${cell.routes.join(', ')}.`}
              </p>
            )}

            {path.route === 'manual' ? (
              <p className="air__link">
                <a href={DRONEZONE_URL} target="_blank" rel="noreferrer noopener">
                  FAA DroneZone
                </a>
              </p>
            ) : null}
          </>
        )}

        <p className="air__informational">{UASFM_INFORMATIONAL}</p>
        <p className="air__cycle">{cycleNote(cycle)}</p>
      </Group>

      <Group title="Authorization">
        {failed ? (
          <p className="air__none">
            The airspace extract did not load, so this says nothing about the airspace here.
          </p>
        ) : answer === null ? (
          <p className="air__none">Reading the airspace extract…</p>
        ) : (
          <>
            {answer.hits.length === 0 ? (
              /*
               * STATED AS AN ABSENCE IN A DATED EXTRACT. Not "no authorization
               * needed", and not "clear": this app does not say an area is
               * clear of anything, from any source.
               */
              <p className="air__state">{NO_SURFACE_AIRSPACE_NOTE}</p>
            ) : (
              <>
                <p className="air__state">
                  This pin is inside {answer.hits.length === 1 ? 'a' : answer.hits.length} surface
                  {answer.hits.length === 1 ? ' area' : ' areas'} of controlled airspace.
                </p>
                <ul className="air__shapes">
                  {answer.hits.map((hit: AirspaceShape) => (
                    <li key={`${hit.name}-${hit.cls}`}>
                      <span className="air__class num">{hit.cls}</span>
                      <span className="air__name">{hit.name}</span>
                      {hit.upper === null ? null : (
                        <span className="air__upper num">
                          to {hit.upper} {hit.upperUom}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="air__rule">{AUTHORIZATION_RULE}</p>
            <p className="air__slop">
              Boundaries in this extract are generalised to about{' '}
              <span className="num">{answer.boundaryMetres} m</span>, so a pin within that of an
              edge could fall either side. Baked {answer.bakedAt}.
            </p>
          </>
        )}
      </Group>

      {/*
        * TFRs ARE NOT CHECKED, SAID WHERE IT CANNOT BE MISSED.
        *
        * There is no usable keyless public TFR feed and NOTAMs need OAuth2, so
        * this app checks neither. Leaving that silent would let an absence of
        * warnings read as an absence of restrictions, which is the same lie as
        * an unmarked power line.
        */}
      <Group title="Not checked">
        <p className="air__tfr">{TFR_NOT_CHECKED}</p>
        <p className="air__link">
          <a href={TFR_URL} target="_blank" rel="noreferrer noopener">
            tfr.faa.gov
          </a>
        </p>
      </Group>

      <p className="air__credit">{FAA_SOURCE_NOTE}</p>
    </div>
  )
}

import { buildLabel } from '../lib/build.ts'
import { COLOR_RULE } from '../core/colorRole.ts'
import { ESRI_ATTRIBUTION } from './MapView.tsx'

/**
 * /how — THE PAGE BEHIND THE LINK.
 *
 * Everything the cover used to carry, at full length, plus the two things the
 * cover never had room to say: what the model is actually for, and what this
 * app is NOT.
 *
 * SAME VERNACULAR AS THE APP. Numbered sections, rules rather than cards,
 * monospace for anything that is a figure, the same dark ground. No marketing
 * voice: there is nothing here to sell, because the thing is free and the
 * reader has already arrived.
 *
 * STATED AS FACT, NOT AS PROMISE. "No analytics" rather than "we will never
 * track you". The first is a description of the code and can be checked
 * against the repo linked at the bottom; the second is a pledge, and a pledge
 * is what a page says when it cannot show you the source.
 */
export function HowPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="how">
      <div className="how__scroll">
        <p className="how__backline">
          <button type="button" className="how__back" onClick={onBack}>
            ← ScoutNGo
          </button>
        </p>

        <section className="how__sec">
          <p className="how__idx num">01</p>
          <div className="how__body">
            <h2 className="how__h">How it works</h2>
            <p className="how__p">
              Three stages. They are the rail along the bottom of every screen, and the day runs
              left to right.
            </p>
            <dl className="how__stages">
              <div className="how__stage how__stage--1">
                <dt className="how__stage-name">
                  <span className="how__stage-n num">1</span> Setup
                </dt>
                <dd className="how__stage-when">Before the day</dd>
                <dd className="how__stage-what">Drop the pin, say when, pack the kit.</dd>
              </div>
              <div className="how__stage how__stage--2">
                <dt className="how__stage-name">
                  <span className="how__stage-n num">2</span> Plan
                </dt>
                <dd className="how__stage-when">The work</dd>
                <dd className="how__stage-what">
                  Place positions, read the light, mark the wires.
                </dd>
              </div>
              <div className="how__stage how__stage--3">
                <dt className="how__stage-name">
                  <span className="how__stage-n num">3</span> Field
                </dt>
                <dd className="how__stage-when">On the day</dd>
                <dd className="how__stage-what">One position at a time, offline, in sunlight.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="how__sec how__sec--sun">
          <p className="how__idx num">02</p>
          <div className="how__body">
            <h2 className="how__h">Why the numbers are trustworthy</h2>
            <p className="how__p">
              Every number on the screen is arithmetic from coordinates, computed on this device.
              The model is never asked for one.
            </p>

            {/*
              * NAMED, NOT SUMMARISED. "It computes things" is what every app
              * says. A list somebody can check against src/core is a different
              * kind of claim.
              */}
            <ul className="how__computed">
              {[
                ['Sun azimuth and altitude', 'src/core/sun.ts'],
                ['Lighting classification', 'src/core/lighting.ts'],
                ['Field of view and frame width', 'src/core/fov.ts'],
                ['Bearings, distance and slant range', 'src/core/geo.ts'],
                ['Tide state and the next turn', 'src/core/tide.ts'],
                ['Airspace grid and ceiling', 'src/core/faaGrid.ts'],
                ['Celestial positions and sky windows', 'src/core/celestial.ts'],
              ].map(([what, where]) => (
                <li className="how__computed-row" key={where}>
                  <span className="how__computed-what">{what}</span>
                  <span className="how__computed-where num">{where}</span>
                </li>
              ))}
            </ul>

            <h3 className="how__sub">What the model is for</h3>
            <p className="how__p">
              Words, and only words. It reads the brief you typed and suggests somewhere to stand
              and what the shot might be. It is never asked for a bearing, a distance, a time or an
              angle, and anything it says that looks like geometry is recomputed here before you
              see it.
            </p>

            <h3 className="how__sub">The honesty rule</h3>
            <p className="how__p">
              The app never says an area is clear of hazards, in any wording, from any source. It
              reports what is marked, which is a fact about the list, not a claim about the ground.
            </p>
            <p className="how__p how__p--dim">
              Where a number is not known it prints a dash and says why. A dash and “the forecast
              did not say” beats a zero every time. Where data is stale, it says how old it is
              rather than showing it as current.
            </p>

            <h3 className="how__sub">Why the map is readable</h3>
            <p className="how__p how__p--dim">{COLOR_RULE}</p>
          </div>
        </section>

        <section className="how__sec how__sec--shadow">
          <p className="how__idx num">03</p>
          <div className="how__body">
            <h2 className="how__h">What leaves the device</h2>
            <p className="how__p">
              Your venue coordinates, the screenshots you upload and the event description you type
              stay in this browser. There is no account, no database, no analytics and no telemetry.
            </p>
            <p className="how__p">
              Saved work — venues, kit, spots, marks — is in this browser’s local storage, on this
              device. Clearing the browser clears it. There is no copy anywhere else to restore
              from.
            </p>
            <p className="how__p how__p--dim">
              What does go out: map tiles, the weather and tide forecast for the area, the public
              map data behind the hazard layer, and — only when you ask for a suggestion — the brief
              and the map screenshot. The serverless function that carries that request exists to
              hold the API key so it is not in the page. It logs nothing.
            </p>
          </div>
        </section>

        <section className="how__sec how__sec--armed">
          <p className="how__idx num">04</p>
          <div className="how__body">
            <h2 className="how__h">What this is not</h2>
            <p className="how__p">
              It is not a forecast app. It computes where the sun will be, which is arithmetic; it
              does not know what the sky will do, which is not.
            </p>
            <p className="how__p">
              It is not a safety authority. It never says a flight is legal, cleared or compliant.
            </p>
            <p className="how__p">
              It is not a substitute for checking the airspace yourself before you fly. Temporary
              flight restrictions are not checked at all, and it says so where that matters rather
              than leaving the silence to be read as nothing to report.
            </p>
          </div>
        </section>

        <footer className="how__foot">
          <p className="how__build">
            Build <span className="num">{buildLabel()}</span>
          </p>
          <p className="how__repo">
            <a
              className="how__link"
              href="https://github.com/Jwillyah/scoutngo"
              target="_blank"
              rel="noreferrer noopener"
            >
              github.com/Jwillyah/scoutngo
            </a>
          </p>
          <p className="how__attrib">{ESRI_ATTRIBUTION}</p>
          <p className="how__attrib">
            Elevation by Mapzen and the Terrarium tiles. Weather and tide by Open-Meteo. Hazard and
            place data from OpenStreetMap contributors. Airspace from the FAA UAS Facility Map;
            this product is not endorsed by or affiliated with the FAA.
          </p>
          <p className="how__attrib how__attrib--dim">
            This page is in Settings whenever you want it.
          </p>
        </footer>
      </div>
    </div>
  )
}

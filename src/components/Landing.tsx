import { buildLabel } from '../lib/build.ts'
import { LandingHero } from './LandingHero.tsx'

/**
 * WHAT THIS IS, BEFORE THE MAP.
 *
 * SHOWN ONCE. A returning shooter goes straight to the map; there is a way
 * back to this from Settings. An app that explains itself every time is an app
 * that does not trust you to have read it.
 *
 * THE VERNACULAR IS THE APP'S OWN. Numbered sections, rules rather than cards,
 * monospace for anything that is a figure, and the same dark ground as every
 * other screen, because this is read in a car park at six in the morning on
 * the same phone at the same brightness as the rest of it. No feature grid, no
 * rounded tiles, no photograph of somebody else's shoot.
 *
 * IT SAYS FOUR THINGS AND STOPS. What it is, the three stages, the rule the
 * whole thing is built on, and where the data lives. Anything else belongs on
 * the screen where it is needed.
 */
export function Landing({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="land">
      <div className="land__scroll">
        {/*
          * ONE LOCKUP, not a label stuck above a headline. The name, the rule
          * it runs on, and the sentence that says what it is, as one block
          * with the ocean rule under it.
          */}
        <header className="land__head">
          {/*
            * NO COORDINATE HERE. The first draft printed the demo venue's
            * latitude and longitude, and src/components/coldStart.test.tsx
            * caught it: on a first run the app must not put a coordinate on
            * screen, because the one thing a person reads a coordinate on a
            * cold start as is their own position. The app does not know it and
            * does not ask. The test was right and the eyebrow was wrong.
            */}
          <p className="land__eyebrow">Sun · light · distance, computed</p>
          <h1 className="land__name">ScoutNGo</h1>
          <p className="land__what">
            Plan a shoot at a place you have never stood in.
          </p>
        </header>

        <LandingHero />

        <section className="land__sec">
          <p className="land__idx num">01</p>
          <div className="land__body">
            <h2 className="land__h">Three stages</h2>
            <p className="land__p">
              They are the rail along the bottom of every screen, and the day
              runs left to right.
            </p>
            <dl className="land__stages">
              <div className="land__stage land__stage--1">
                <dt className="land__stage-name">
                  <span className="land__stage-n num">1</span> Setup
                </dt>
                <dd className="land__stage-when">Before the day</dd>
                <dd className="land__stage-what">
                  Drop the pin, say when, pack the kit.
                </dd>
              </div>
              <div className="land__stage land__stage--2">
                <dt className="land__stage-name">
                  <span className="land__stage-n num">2</span> Plan
                </dt>
                <dd className="land__stage-when">The work</dd>
                <dd className="land__stage-what">
                  Place positions, read the light, mark the wires.
                </dd>
              </div>
              <div className="land__stage land__stage--3">
                <dt className="land__stage-name">
                  <span className="land__stage-n num">3</span> Field
                </dt>
                <dd className="land__stage-when">On the day</dd>
                <dd className="land__stage-what">
                  One position at a time, offline, in sunlight.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="land__sec">
          <p className="land__idx num">02</p>
          <div className="land__body">
            <h2 className="land__h">The model proposes, code computes</h2>
            <p className="land__p">
              Where the sun is, which way the light falls, what a lens frames
              from a distance, how far anything is from anything else: all of it
              is arithmetic, computed here, from coordinates.
            </p>

            {/*
              * The app's own plates, at the app's own size. Four readouts that
              * exist on the map, shown as the things they are rather than
              * described.
              */}
            <ul className="land__plates">
              <li className="land__plate">
                <span className="land__plate-k">Sun</span>
                <span className="land__plate-v num">254.1°</span>
              </li>
              <li className="land__plate">
                <span className="land__plate-k">Alt</span>
                <span className="land__plate-v num">8.2°</span>
              </li>
              <li className="land__plate">
                <span className="land__plate-k">Frame</span>
                <span className="land__plate-v num">90 m</span>
              </li>
              <li className="land__plate">
                <span className="land__plate-k">Reach</span>
                <span className="land__plate-v num">400 ft</span>
              </li>
            </ul>
            <p className="land__p">
              A model can suggest somewhere to stand and write down what the
              shot is. It is never asked for a number, and anything it says
              about geometry is recomputed before you see it.
            </p>
          </div>
        </section>

        <section className="land__sec">
          <p className="land__idx num">03</p>
          <div className="land__body">
            <h2 className="land__h">It stays on your phone</h2>
            <p className="land__p">
              No account. No database. No analytics. Your venue, your kit and
              your saved spots are in this browser and go nowhere else.
            </p>
            <p className="land__p land__p--dim">
              What does leave the device: map tiles, the weather and tide
              forecast for the area, and the public map data behind the hazard
              layer. Never the plan, and never a coordinate attached to you.
            </p>
          </div>
        </section>
      </div>

      <div className="land__foot">
        <button type="button" className="land__go" onClick={onDismiss}>
          Dive in
        </button>
        <p className="land__build">
          Build <span className="num">{buildLabel()}</span> · open source · this
          page is in Settings whenever you want it
        </p>
      </div>
    </div>
  )
}

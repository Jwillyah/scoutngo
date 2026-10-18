import { useState } from 'react'
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
 * THE FIRST SCREEN IS THE HERO, THE THREE STAGES, AND ONE LINE EACH on the
 * rule the whole thing is built on and where the data lives. That is the
 * whole cover.
 *
 * EVERYTHING ELSE MOVED BEHIND A LINK, AND NOTHING WAS DELETED. The full
 * privacy explanation, the list of what actually leaves the device, the
 * plates and the longer argument about the model are all on the details view
 * below, reachable in one tap and gone again in one. An honesty line is not
 * less true further down a page, but it is less read on a first screen
 * somebody is scrolling past to get to the map, and a cover page that has to
 * be scrolled is not a cover page.
 */
export function Landing({ onDismiss }: { onDismiss: () => void }) {
  const [view, setView] = useState<'cover' | 'details'>('cover')

  if (view === 'details') {
    return <LandingDetails onBack={() => setView('cover')} />
  }

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

        {/*
          * ONE LINE EACH, AND THEY ARE THE TWO RULES THAT MATTER.
          *
          * The computed rule and the privacy rule, as rules rather than as
          * sections. The argument behind each is one tap away and is not
          * shortened there, only moved.
          *
          * COLOUR CARRIES THROUGH FROM THE HERO. The amber is the sun, the
          * violet is the shadow and the magenta is the armed state, which is
          * what each means on the map; they stopped at the hero before and the
          * page went monochrome underneath it.
          */}
        <ul className="land__rules">
          <li className="land__rule land__rule--sun">
            <span className="land__rule-k">Computed</span>
            <span className="land__rule-v">
              Every number is arithmetic from coordinates. The model is never asked for one.
            </span>
          </li>
          <li className="land__rule land__rule--shadow">
            <span className="land__rule-k">Yours</span>
            <span className="land__rule-v">
              No account, no database, no analytics. Your plan stays in this browser.
            </span>
          </li>
        </ul>

        <p className="land__moreline">
          <button type="button" className="land__more" onClick={() => setView('details')}>
            How it computes, and what does leave the device
          </button>
        </p>
      </div>

      <div className="land__foot">
        {/*
          * STILL ONE BUTTON.
          *
          * The NOW glance wants to be one tap from launch, and a second
          * button here was the obvious place to put it. It is the wrong
          * place: this page is shown once, ever, and "ends with one button"
          * is a rule this page has because a cover page with two calls to
          * action asks the reader to choose before they know anything.
          *
          * One tap from launch is satisfied in the shell instead, where the
          * Now control sits beside the rail on every launch after this one.
          * landingAndDevice.test.tsx caught the regression.
          */}
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

/**
 * THE DETAIL, ONE TAP BEHIND THE COVER.
 *
 * NOTHING HERE WAS SHORTENED ON ITS WAY DOWN. The privacy explanation, the
 * list of what leaves the device and the argument about the model are the same
 * sentences that were on the front page; they are here because a cover page
 * with all of it on it is a page nobody finishes, not because any of it
 * stopped being true.
 */
export function LandingDetails({ onBack }: { onBack: () => void }) {
  return (
    <div className="land land--details">
      <div className="land__scroll">
        <p className="land__moreline">
          <button type="button" className="land__more land__more--back" onClick={onBack}>
            ← Back
          </button>
        </p>

        <section className="land__sec land__sec--sun">
          <p className="land__idx num">01</p>
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

        <section className="land__sec land__sec--shadow">
          <p className="land__idx num">02</p>
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

        <section className="land__sec land__sec--armed">
          <p className="land__idx num">03</p>
          <div className="land__body">
            <h2 className="land__h">What it will not tell you</h2>
            <p className="land__p">
              It never says an area is clear of hazards, from any source. It
              never says a flight is legal, cleared or compliant. Temporary
              flight restrictions are not checked at all, and it says so where
              that matters rather than leaving the silence to be read as
              nothing to report.
            </p>
            <p className="land__p land__p--dim">
              Where a number is not known it prints a dash. A dash and "the
              forecast did not say" beats a zero every time.
            </p>
          </div>
        </section>
      </div>

      <div className="land__foot">
        <button type="button" className="land__go" onClick={onBack}>
          Back to the start
        </button>
      </div>
    </div>
  )
}

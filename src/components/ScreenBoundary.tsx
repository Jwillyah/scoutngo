import { Component, type ReactNode } from 'react'
import { describe, recordError } from '../lib/errorLog.ts'

/*
 * ONE SCREEN'S CRASH STAYS ON THAT SCREEN (Batch CORE, Section 2.3). A throw
 * in 3D, Fly, the planner or the map shows "<screen> didn't load · Back" on
 * that screen and writes the error to the phone's log (Settings › Debug ›
 * Last errors); it never resets the app to the home.
 */
interface Props {
  /** "3D", "Fly", "Planner", "Map": said on the card and in the log. */
  name: string
  onBack: () => void
  children: ReactNode
}

export class ScreenBoundary extends Component<Props, { message: string | null }> {
  state = { message: null as string | null }
  static getDerivedStateFromError(error: unknown) {
    return { message: describe(error) }
  }
  componentDidCatch(error: unknown) {
    recordError(this.props.name, describe(error))
  }
  render() {
    if (this.state.message === null) return this.props.children
    return (
      <ScreenFailCard
        title={`${this.props.name} didn't load`}
        message={this.state.message}
        onBack={() => {
          this.setState({ message: null })
          this.props.onBack()
        }}
      />
    )
  }
}

/** The card itself, also for a screen that did not open in time (Fly in 3 s). */
export function ScreenFailCard({ title, message, onBack, onWait }: { title: string; message: string | null; onBack: () => void; onWait?: () => void }) {
  return (
    <div className="screenfail" role="alert">
      <div className="screenfail__card">
        <p className="screenfail__title">{title}</p>
        {message === null ? null : <p className="screenfail__msg num">{message}</p>}
        <p className="screenfail__note">Saved in Settings › Debug › Last errors.</p>
        <div className="btn-row">
          {onWait === undefined ? null : (
            <button type="button" className="btn" onClick={onWait}>
              Keep waiting
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

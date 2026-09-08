import { useEffect, useId, useRef, useState } from 'react'
import {
  ACCEPTED_TYPES,
  isAcceptedImage,
  normalizePoint,
  type Screenshot,
} from '../lib/screenshot.ts'
import { Section } from './Section.tsx'

interface FilePickerProps {
  id: string
  label: string
  onPick: (file: File | null) => void
}

/**
 * The native file input is hidden but still focusable, and its focus ring is
 * drawn on the label sitting right next to it.
 */
function FilePicker({ id, label, onPick }: FilePickerProps) {
  return (
    <span className="file-picker">
      <input
        id={id}
        className="file-picker__input"
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={(event) => {
          onPick(event.target.files?.item(0) ?? null)
          // Let the same filename be picked again after a remove.
          event.target.value = ''
        }}
      />
      <label className="btn btn--small" htmlFor={id}>
        {label}
      </label>
    </span>
  )
}

interface SatelliteImageProps {
  value: Screenshot | null
  onChange: (next: Screenshot | null) => void
  open: boolean
  onToggle: () => void
}

export function SatelliteImage({ value, onChange, open, onToggle }: SatelliteImageProps) {
  const inputId = useId()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Held so the URL can still be revoked when the component goes away.
  const liveUrl = useRef<string | null>(null)

  useEffect(() => {
    liveUrl.current = value === null ? null : value.url
  }, [value])

  useEffect(() => {
    return () => {
      if (liveUrl.current !== null) URL.revokeObjectURL(liveUrl.current)
    }
  }, [])

  const replaceWith = (file: File | null) => {
    if (file !== null && !isAcceptedImage(file)) {
      setError('That is not a PNG or a JPG.')
      return
    }
    setError(null)
    // Revoke the old blob before dropping the reference to it.
    if (value !== null) URL.revokeObjectURL(value.url)
    if (file === null) {
      onChange(null)
      return
    }
    onChange({ url: URL.createObjectURL(file), name: file.name, subject: null })
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    replaceWith(event.dataTransfer.files.item(0))
  }

  const setSubject = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (value === null) return
    const box = event.currentTarget.getBoundingClientRect()
    onChange({ ...value, subject: normalizePoint(event.clientX, event.clientY, box) })
  }

  const summary =
    value === null
      ? 'No image yet'
      : value.subject === null
        ? `${value.name}, no subject point`
        : `${value.name}, subject set`

  return (
    <Section index="04" title="Screenshot fallback" summary={summary} open={open} onToggle={onToggle}>
      <p className="section__note">
        Fallback path, for when the satellite imagery over a venue is too old or
        too cloudy to read. The live map is the primary flow now. Subject points
        set here are image coordinates, not real ones.
      </p>

      {value === null ? (
        <div
          className={`drop${dragging ? ' drop--over' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="drop__label">Drop a PNG or JPG here</p>
          <FilePicker id={inputId} label="Choose a file" onPick={replaceWith} />
        </div>
      ) : (
        <>
          <button type="button" className="plate" onClick={setSubject}>
            <img className="plate__img" src={value.url} alt={`Satellite view of ${value.name}`} />
            {value.subject === null ? null : (
              <span
                className="reticle"
                style={{
                  left: `${value.subject.x * 100}%`,
                  top: `${value.subject.y * 100}%`,
                }}
                aria-hidden="true"
              >
                <span className="reticle__bar reticle__bar--h" />
                <span className="reticle__bar reticle__bar--v" />
                <span className="reticle__box" />
              </span>
            )}
          </button>

          <p className="capture__subject">
            {value.subject === null ? (
              <span className="capture__subject--unset">
                Tap the image to set the subject point
              </span>
            ) : (
              <>
                <span>Subject</span>
                <span className="num">
                  x {value.subject.x.toFixed(3)} y {value.subject.y.toFixed(3)}
                </span>
                <span className="capture__subject--unset">tap again to move it</span>
              </>
            )}
          </p>

          <div className="btn-row">
            <FilePicker id={inputId} label="Replace image" onPick={replaceWith} />
            <button
              type="button"
              className="btn btn--small"
              onClick={() => replaceWith(null)}
            >
              Remove
            </button>
          </div>
        </>
      )}

      {error === null ? null : <p className="field__error">{error}</p>}

      <p className="capture__caption">
        This image stays in your browser. It is only sent when you press generate.
      </p>
    </Section>
  )
}

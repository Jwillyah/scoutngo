/* The Features sheet's icon marks (Batch K addendum, E). */
/** Small white marks for the icon squares: a line drawing in a 16 box. */
export const featIcon = (d: string) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d={d} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
export const FEAT_PATH = {
  bolt: 'M9 1.5 4 9h4l-1 5.5L12 7H8z',
  warn: 'M8 2 14.5 13.5h-13zM8 6.5v3.5M8 11.8v.2',
  track: 'M2 13c3-1 5-4 6-7M8 6l3-3M13 2l-1 4-4-1',
  shadow: 'M2 13h12M4 13l4-9M8 4l5 9',
  arc: 'M2 12c2-6 10-6 12 0M8 3v1',
  moon: 'M10.5 2.5a5.5 5.5 0 1 0 3 9 4.5 4.5 0 0 1-3-9z',
  cone: 'M3 8l10-5v10z',
  light: 'M8 2v2M8 12v2M2 8h2M12 8h2M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5',
  air: 'M2 8h12M8 2v12M4 4l8 8',
  hazard: 'M8 2 14 13H2zM8 6v3',
  label: 'M2 4h12M2 8h8M2 12h10',
  building: 'M3 14V5l5-3 5 3v9M6 14v-3h4v3',
}

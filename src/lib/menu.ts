/*
 * WHERE THE MENU GOES. The list in one place, so the menu, App and the audits'
 * navigation helper (scripts/preflight.mjs) name the same items the same way.
 */
export type MenuItem =
  | 'plan'
  | 'setup'
  | 'field'
  | 'sky'
  | 'kit'
  | 'saved'
  | 'now'
  | 'viewfinder'
  | 'callsheet'
  | 'settings'
  | 'about'

export const MENU_ITEMS: readonly { id: MenuItem; label: string; note: string }[] = [
  { id: 'plan', label: 'Plan', note: 'Positions, light and conditions' },
  { id: 'setup', label: 'Shoot setup', note: 'Place, date, time, how far you can go' },
  { id: 'sky', label: 'Sky', note: 'Tonight, the moon, the next 30 nights' },
  { id: 'kit', label: 'Kit', note: 'What is in the bag' },
  { id: 'saved', label: 'Saved spots', note: 'On this phone' },
  { id: 'field', label: 'Field', note: 'One position at a time, offline' },
  { id: 'now', label: 'Now', note: 'What the sky is doing where you are' },
  { id: 'callsheet', label: 'Call sheet', note: 'Run of show and shot list, on your own key' },
  { id: 'viewfinder', label: 'Viewfinder', note: 'The camera with the sun and your frames on it' },
  { id: 'settings', label: 'Settings', note: 'Clock, wind and distance' },
  { id: 'about', label: 'About', note: 'Backup, your key, what leaves your phone' },
]


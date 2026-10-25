/*
 * THE SHOOTER'S PLAYBOOK, ON THE PHONE. The rules they always shoot by, read
 * by the call sheet through its playbook tool. Seeded with the four given on
 * 25 October; edited on the call sheet card and kept in localStorage only.
 */
export const PLAYBOOK_KEY = 'scoutngo.playbook.v1'

export const SEED_PLAYBOOK = [
  'Open with a wide establishing shot.',
  'Reel: 12 to 18 seconds.',
  'Athlete clips: 5 to 8 seconds each, vertical, no music.',
  'One hero drone push-in at golden hour.',
].join('\n')

export function readPlaybook(): string {
  try {
    return localStorage.getItem(PLAYBOOK_KEY) ?? SEED_PLAYBOOK
  } catch {
    return SEED_PLAYBOOK
  }
}

export function savePlaybook(text: string): void {
  try {
    localStorage.setItem(PLAYBOOK_KEY, text)
  } catch {
    /* A full store keeps the old playbook; the card still shows what was typed. */
  }
}

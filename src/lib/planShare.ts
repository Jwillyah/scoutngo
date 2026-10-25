/*
 * A PLAN AS A LINK, AND THE DATA NEVER REACHES A SERVER.
 *
 * The plan is packed after the `#`. A browser never sends the fragment in a
 * request, so opening the link fetches the app and nothing else: Vercel's logs
 * see `/`, never a venue. Packed as deflated JSON in base64url, the same Spot
 * the ScoutNGo file carries (src/lib/scoutFile.ts), so there is one format.
 *
 * WHAT IS LEFT OUT. The "I have LAANC here" switch is the sender's authorization,
 * not the plan's, and it never travels: the person opening the link holds
 * their own. The spot id is replaced, so a shared plan never overwrites one of
 * the receiver's own spots.
 */
import { reviveSpot, type Spot } from './spots.ts'

export const SHARE_PREFIX = '#plan='

const toBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string) => {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** The plan without what must not travel. */
export function shareableSpot(spot: Spot): Spot {
  const { laanc: _laanc, ...venue } = spot.venue
  return { ...spot, venue }
}

/** The link: the app's own address, nothing in the query, the plan after the #. */
export async function shareLink(appUrl: string, spot: Spot): Promise<string> {
  const base = new URL(appUrl)
  base.search = ''
  base.hash = ''
  const json = new TextEncoder().encode(JSON.stringify(shareableSpot(spot)))
  const packed = await pipe(json, new CompressionStream('deflate-raw'))
  return `${base.toString()}${SHARE_PREFIX}${toBase64Url(packed)}`
}

/** The plan in a link's fragment, revived like any imported spot; null when there is none or it is unreadable. */
export async function readShareHash(hash: string): Promise<Spot | null> {
  if (!hash.startsWith(SHARE_PREFIX)) return null
  try {
    const json = await pipe(fromBase64Url(hash.slice(SHARE_PREFIX.length)), new DecompressionStream('deflate-raw'))
    const spot = reviveSpot(JSON.parse(new TextDecoder().decode(json)))
    if (spot === null) return null
    const { laanc: _laanc, ...venue } = spot.venue
    return { ...spot, venue, id: `shared-${Date.now().toString(36)}` }
  } catch {
    return null
  }
}

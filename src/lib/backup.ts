/*
 * WHERE YOUR THINGS ARE KEPT, AND A COPY YOU HOLD (Batch E, 1 Nov).
 *
 * Everything you save lives in this phone's browser storage: your spots,
 * kit, settings, the sky fire log and the truth loop in localStorage; saved
 * forecasts and weather in IndexedDB; offline packs' map tiles in Cache
 * Storage. Photos are never kept, only the numbers read from them, and the
 * sky fire log's optional small thumbnail.
 *
 * The Safari tab and the home-screen app each keep their own storage;
 * deleting the app or clearing Safari's data deletes it. So:
 *
 *   - the app asks the browser to keep its storage (navigator.storage.persist)
 *     and Settings says whether it agreed;
 *   - "Back up to a file" writes one .zip: backup.json with every key that is
 *     yours, and the thumbnails as JPEG files beside it. Stored, not
 *     compressed: a zip any phone or computer opens, written here in a few
 *     dozen lines rather than a library;
 *   - "Restore from a file" reads that zip (or a bare backup.json) back;
 *   - after a new log entry, a saved spot or a kit change (Batch G), if the
 *     last backup is older than NUDGE_AFTER_MS (or there is none), the one
 *     status line under the chips says "Back up? Last backup: never", with
 *     Back up (the phone's share sheet: Files, iCloud Drive) and Not now,
 *     which hides it for the same 7 days. Never a box over the map.
 *
 * NOT IN THE BACKUP: your Anthropic key (a secret does not belong in a file
 * that gets emailed), the map tiles of offline packs (save them again: they
 * are tens of megabytes), and caches the app rebuilds by itself.
 */

import { saveBytes } from './saveText.ts'

export const BACKUP_FORMAT = 'scoutngo-backup'
export const BACKUP_VERSION = 1
const LAST_BACKUP = 'scoutngo.backup.last.v1'
const LAST_REMIND = 'scoutngo.backup.reminded.v1'
export const NUDGE_AFTER_MS = 7 * 86_400_000
/** Fired on window when you changed something worth keeping: a log entry, the truth loop, a saved spot, the kit ('kit'). */
export const YOURS_CHANGED = 'scoutngo:yours-changed'
export function yoursChanged(what = ''): void {
  try {
    window.dispatchEvent(new CustomEvent(YOURS_CHANGED, { detail: what }))
  } catch {
    /* No window (tests, the server): nothing to nudge. */
  }
}

/** Keys that are not yours to carry: a secret, the app's bookkeeping, and caches it rebuilds. */
const NOT_BACKED_UP = new Set([
  'scoutngo.anthropicKey.v1',
  'scoutngo.adopted.v1',
  'scoutngo.storageProbe.v1',
  'scoutngo.debugTouch.v1',
  'scoutngo.forecast.v1',
  'scoutngo.buildings.v1',
  'scoutngo.trees.v1',
  'scoutngo.tide.stations.v1',
  'scoutngo.offline.areas.v1',
  'scoutngo.venuePacks.v1',
  'scoutngo.fieldpack.v1',
  'scoutngo.nearMe.seen.v1',
  'scoutngo.nearMe.snooze.v1',
  LAST_REMIND,
])
/** What counts as something to lose, for the nudge. */
/* Not the kit: the app writes its default kit on first open, and a default is nothing to lose. */
const WORTH_KEEPING = ['scoutngo.spots.v1', 'scoutngo.fireLog.v1', 'scoutngo.truthLog.v1', 'scoutngo.marks.v1', 'scoutngo.kitAmendments.v1']

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

export const isYours = (key: string): boolean => key.startsWith('scoutngo.') && !NOT_BACKED_UP.has(key)

/* ------------------------------------------------------------ the zip */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

/** A stored (uncompressed) zip of `entries`. */
export function zip(entries: readonly ZipEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.bytes)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(8, 0, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, e.bytes.length, true)
    local.setUint32(22, e.bytes.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, e.bytes)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, e.bytes.length, true)
    dir.setUint32(24, e.bytes.length, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + e.bytes.length
  }
  const dirSize = central.reduce((s, p) => s + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, dirSize, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** The entries of a stored zip, or null when it is not one this can read (only "stored" entries). */
export function unzip(bytes: Uint8Array): ZipEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dec = new TextDecoder()
  const out: ZipEntry[] = []
  let at = 0
  while (at + 30 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true)
    const size = view.getUint32(at + 18, true)
    const nameLen = view.getUint16(at + 26, true)
    const extra = view.getUint16(at + 28, true)
    if (method !== 0) return null
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLen))
    const start = at + 30 + nameLen + extra
    out.push({ name, bytes: bytes.slice(start, start + size) })
    at = start + size
  }
  return out.length === 0 ? null : out
}

/* --------------------------------------------------------- the backup */

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  savedAt: string
  /** Every key that is yours, as stored; thumbnails replaced by "thumb:<file>". */
  keys: Record<string, string>
}

const THUMB = /"data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/g

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** The backup's entries: backup.json and a JPEG for each thumbnail. */
export function buildBackup(store: Store, now: Date = new Date()): ZipEntry[] {
  const keys: Record<string, string> = {}
  const thumbs: ZipEntry[] = []
  for (let i = 0; i < store.length; i += 1) {
    const k = store.key(i)
    if (k === null || !isYours(k)) continue
    const v = store.getItem(k)
    if (v === null) continue
    keys[k] = v.replace(THUMB, (_m, b64: string) => {
      const name = `thumbnails/${thumbs.length + 1}.jpg`
      thumbs.push({ name, bytes: b64ToBytes(b64) })
      return `"thumb:${name}"`
    })
  }
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, savedAt: now.toISOString(), keys }
  return [{ name: 'backup.json', bytes: new TextEncoder().encode(JSON.stringify(file, null, 1)) }, ...thumbs]
}

export type RestoreResult = { ok: true; keys: number; thumbs: number; savedAt: string } | { ok: false; reason: string }

/** Write a backup (zip or bare backup.json) back into storage. Keys not in the file are left alone. */
export function restoreBackup(bytes: Uint8Array, store: Store): RestoreResult {
  const entries = unzip(bytes) ?? [{ name: 'backup.json', bytes }]
  const json = entries.find((e) => e.name === 'backup.json')
  if (json === undefined) return { ok: false, reason: 'There is no backup.json in that file.' }
  let file: BackupFile
  try {
    file = JSON.parse(new TextDecoder().decode(json.bytes)) as BackupFile
  } catch {
    return { ok: false, reason: 'That file is not a ScoutNGo backup: it is not readable JSON.' }
  }
  if (file?.format !== BACKUP_FORMAT || typeof file.keys !== 'object' || file.keys === null) return { ok: false, reason: 'That file is not a ScoutNGo backup.' }
  if (file.version > BACKUP_VERSION) return { ok: false, reason: 'That backup is from a newer version of the app; update it first.' }
  const thumbs = new Map(entries.filter((e) => e.name.startsWith('thumbnails/')).map((e) => [e.name, bytesToB64(e.bytes)]))
  let n = 0
  for (const [k, v] of Object.entries(file.keys)) {
    if (!isYours(k) || typeof v !== 'string') continue
    const back = v.replace(/"thumb:(thumbnails\/[^"]+)"/g, (_m, name: string) => (thumbs.has(name) ? `"data:image/jpeg;base64,${thumbs.get(name)}"` : 'null'))
    try {
      store.setItem(k, back)
      n += 1
    } catch {
      return { ok: false, reason: `This phone's storage is full: ${n} of ${Object.keys(file.keys).length} items were restored.` }
    }
  }
  return { ok: true, keys: n, thumbs: thumbs.size, savedAt: file.savedAt }
}

export const backupFilename = (now: Date = new Date()): string => `scoutngo-backup-${now.toISOString().slice(0, 10)}.zip`

export function markBackedUp(store: Pick<Storage, 'setItem'>, now: Date = new Date()): void {
  try {
    store.setItem(LAST_BACKUP, now.toISOString())
  } catch {
    /* The file was still written. */
  }
}
export const lastBackup = (store: Pick<Storage, 'getItem'>): Date | null => {
  const v = store.getItem(LAST_BACKUP)
  const t = v === null ? Number.NaN : Date.parse(v)
  return Number.isFinite(t) ? new Date(t) : null
}

/** The nudge: something worth keeping, no backup in 7 days (or ever), not put off in the last 7. */
export function backupDue(store: Pick<Storage, 'getItem'>, now: number, changedKit = false): boolean {
  const worth =
    changedKit ||
    WORTH_KEEPING.some((k) => {
      const v = store.getItem(k)
      return v !== null && v !== '[]' && v !== '{}' && v.length > 2
    })
  if (!worth) return false
  const last = lastBackup(store)
  if (last !== null && now - last.getTime() < NUDGE_AFTER_MS) return false
  const putOff = Date.parse(store.getItem(LAST_REMIND) ?? '')
  return !(Number.isFinite(putOff) && now - putOff < NUDGE_AFTER_MS)
}

/** "Back up? Last backup: never", or the day of the last one. */
export function backupLine(store: Pick<Storage, 'getItem'>, timeZone?: string): string {
  const last = lastBackup(store)
  return `Back up? Last backup: ${last === null ? 'never' : new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(last)}`
}

/** Not now: hidden for NUDGE_AFTER_MS. */
export function markReminded(store: Pick<Storage, 'setItem'>, now: Date = new Date()): void {
  try {
    store.setItem(LAST_REMIND, now.toISOString())
  } catch {
    /* Asked again next time. */
  }
}

/* ------------------------------------------------- how much, and where */

export interface Kept {
  /** Bytes of what is yours in localStorage (UTF-16, as the browser counts it). */
  yoursBytes: number
  /** Bytes of the caches in localStorage. */
  cacheBytes: number
  /** The browser's own total for this site (every store), and its allowance; null when it does not say. */
  usage: number | null
  quota: number | null
  /** Whether the browser agreed to keep this site's storage; null when it cannot say. */
  persisted: boolean | null
}

export function localBytes(store: Store): { yours: number; cache: number } {
  let yours = 0
  let cache = 0
  for (let i = 0; i < store.length; i += 1) {
    const k = store.key(i)
    if (k === null || !k.startsWith('scoutngo.')) continue
    const n = (k.length + (store.getItem(k)?.length ?? 0)) * 2
    if (isYours(k)) yours += n
    else cache += n
  }
  return { yours, cache }
}

type StorageManagerLike = { estimate?: () => Promise<{ usage?: number; quota?: number }>; persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> }
const manager = (): StorageManagerLike | null => (typeof navigator !== 'undefined' && 'storage' in navigator ? (navigator.storage as StorageManagerLike) : null)

export async function whatIsKept(store: Store): Promise<Kept> {
  const m = manager()
  const local = localBytes(store)
  const est = await m?.estimate?.().catch(() => null)
  const persisted = (await m?.persisted?.().catch(() => null)) ?? null
  return { yoursBytes: local.yours, cacheBytes: local.cache, usage: est?.usage ?? null, quota: est?.quota ?? null, persisted }
}

/** Ask the browser to keep this site's storage rather than clear it when space runs short. */
export async function askToPersist(): Promise<boolean | null> {
  const m = manager()
  if (m?.persist === undefined) return null
  try {
    return await m.persist()
  } catch {
    return null
  }
}

/** Write the backup file and remember when (src/lib/saveText.ts). Returns its name. */
export function backupNow(): string {
  const file = backupFilename()
  saveBytes(zip(buildBackup(localStorage)), 'application/zip', file)
  markBackedUp(localStorage)
  return file
}

/*
 * ONE TAP TO THE SHARE SHEET (Batch G): on the phone, "Save to Files" puts
 * the backup in Files or iCloud Drive. Where the browser cannot share a file,
 * it is downloaded as before. Remembered as backed up only when it went.
 */
export async function backupShare(): Promise<'shared' | 'saved' | 'cancelled'> {
  const name = backupFilename()
  const bytes = zip(buildBackup(localStorage))
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  try {
    const file = new File([bytes as BlobPart], name, { type: 'application/zip' })
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) === true) {
      await nav.share({ files: [file], title: 'ScoutNGo backup' })
      markBackedUp(localStorage)
      return 'shared'
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled'
  }
  saveBytes(bytes, 'application/zip', name)
  markBackedUp(localStorage)
  return 'saved'
}

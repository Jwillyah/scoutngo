/* The messages between scan.ts and its worker, apart from the worker so nothing else imports the worker module. */
import type { LidarArea } from './grid.ts'

export interface ScanJob {
  base: string
  keys: string[]
  area: LidarArea
  /** The footprints to measure, Web Mercator rings, by id. */
  footprints: { id: string; ring: { x: number; y: number }[] }[]
}

export type ScanMessage =
  | { kind: 'progress'; done: number; total: number; bytes: number }
  | { kind: 'done'; width: number; height: number; cell: number; minx: number; maxy: number; dtm: Float32Array; dsm: Float32Array; kind2: Uint8Array; water: Uint8Array; heights: Record<string, { metres: number; byRaster: number } | 'newer'>; bytes: number; points: number }
  | { kind: 'failed'; reason: string }


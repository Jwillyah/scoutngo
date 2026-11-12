/*
 * WHERE TO STAND: A SMALL STARTER LIST (Batch BEST SKY, Section 2), in the
 * repo and fixed: the batch's named places round Virginia Beach. Each with
 * the way it faces over open ground or water and what is in front of it.
 * Places from OpenStreetMap and your saved spots join it on the phone.
 */
export interface StarterSpot {
  id: string
  name: string
  at: { lat: number; lon: number }
  /** The bearing the open view faces, degrees. */
  facing: number
  /** How wide the open view is, either side of `facing`, degrees. */
  openDeg: number
  water: boolean
  silhouette: string | null
}

export const STARTER_SPOTS: readonly StarterSpot[] = [
  { id: 'lynnhaven-inlet', name: 'Lynnhaven Inlet', at: { lat: 36.9076, lon: -76.0915 }, facing: 250, openDeg: 70, water: true, silhouette: 'bridge' },
  { id: 'lesner-bridge', name: 'Lesner Bridge', at: { lat: 36.9097, lon: -76.0863 }, facing: 270, openDeg: 60, water: true, silhouette: 'bridge' },
  { id: 'chicks-beach', name: "Chick's Beach", at: { lat: 36.9196, lon: -76.1255 }, facing: 330, openDeg: 80, water: true, silhouette: null },
  { id: 'first-landing', name: 'First Landing', at: { lat: 36.9214, lon: -76.0507 }, facing: 300, openDeg: 80, water: true, silhouette: null },
  { id: 'fort-story', name: 'Ft Story', at: { lat: 36.9262, lon: -76.0079 }, facing: 45, openDeg: 90, water: true, silhouette: 'lighthouse' },
  { id: 'vb-pier', name: 'VB Pier', at: { lat: 36.8436, lon: -75.9713 }, facing: 100, openDeg: 90, water: true, silhouette: 'pier' },
  { id: 'rudee-inlet', name: 'Rudee Inlet', at: { lat: 36.8305, lon: -75.9698 }, facing: 110, openDeg: 80, water: true, silhouette: 'jetty' },
  { id: 'crab-creek', name: 'Crab Creek', at: { lat: 36.9033, lon: -76.0997 }, facing: 220, openDeg: 50, water: true, silhouette: null },
  { id: 'sandbridge', name: 'Sandbridge', at: { lat: 36.7266, lon: -75.9405 }, facing: 100, openDeg: 90, water: true, silhouette: 'pier' },
  { id: 'back-bay', name: 'Back Bay', at: { lat: 36.6704, lon: -75.9168 }, facing: 270, openDeg: 90, water: true, silhouette: null },
]

import type { LatLng } from '@/components/map/geofence-map'

const EARTH_RADIUS_M = 6371000

/** Great-circle distance between two lat/lng points, in metres (haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Simple average of a polygon's vertices — good enough for our small quadrilateral geofences. */
export function centroidOf(nodes: LatLng[]): LatLng {
  return {
    lat: nodes.reduce((s, p) => s + p.lat, 0) / nodes.length,
    lng: nodes.reduce((s, p) => s + p.lng, 0) / nodes.length
  }
}

/**
 * The item whose polygon centroid is nearest `from`, or `null` for an empty list.
 * Ties keep the earlier item (stable — matches `Array#reduce` left-to-right order).
 */
export function closestByCentroid<T>(
  from: LatLng,
  items: T[],
  areaNodesOf: (item: T) => LatLng[]
): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const item of items) {
    const nodes = areaNodesOf(item)
    if (nodes.length === 0) continue
    const dist = haversineMeters(from, centroidOf(nodes))
    if (dist < bestDist) {
      bestDist = dist
      best = item
    }
  }
  return best
}

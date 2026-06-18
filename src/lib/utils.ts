import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Returns distance in meters. Returns Infinity if coordinates are invalid.
 */
export function calculateDistance(
  from: { lat: number; lng: number } | undefined | null,
  to: { lat: number; lng: number } | undefined | null
): number {
  // Return infinite distance if coordinates are invalid
  if (!from || !to || !from.lat || !from.lng || !to.lat || !to.lng) {
    return Infinity;
  }
  
  const R = 6371000; // Earth's radius in meters
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const deltaLat = (to.lat - from.lat) * Math.PI / 180;
  const deltaLng = (to.lng - from.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Generate a curved line (arc) between two points for flight paths.
 * Uses great circle arc calculation for accurate geodesic paths.
 */
export function generateCurvedLine(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  numPoints: number = 50
): [number, number][] {
  const points: [number, number][] = [];
  
  // Convert to radians
  const lat1 = start.lat * Math.PI / 180;
  const lng1 = start.lng * Math.PI / 180;
  const lat2 = end.lat * Math.PI / 180;
  const lng2 = end.lng * Math.PI / 180;
  
  // Calculate the great circle distance
  const d = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lng1 - lng2) / 2), 2)
  ));
  
  // Generate intermediate points along the great circle
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lng = Math.atan2(y, x);
    
    // Convert back to degrees and store as [lng, lat] for GeoJSON
    points.push([lng * 180 / Math.PI, lat * 180 / Math.PI]);
  }
  
  return points;
}

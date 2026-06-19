import type { RouteInfo, TripLocation } from "@/types/trip";

const OVERNIGHT_COLOR = "#8b5cf6";

function isValidLngLat(lng: unknown, lat: unknown): boolean {
  return typeof lng === "number" && typeof lat === "number" && Number.isFinite(lng) && Number.isFinite(lat);
}

/** Clean a raw [lng, lat][] geometry into [lng, lat, alt][] for the 3D globe. */
export function sanitizePath3D(
  coordinates: Array<[number, number]> | undefined | null,
  altitude = 1500
): [number, number, number][] {
  if (!Array.isArray(coordinates)) return [];
  const out: [number, number, number][] = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const [lng, lat] = point;
    if (!isValidLngLat(lng, lat)) continue;
    out.push([lng, lat, altitude]);
  }
  return out;
}

export function sanitizePath2D(
  coordinates: Array<[number, number]> | undefined | null
): [number, number][] {
  if (!Array.isArray(coordinates)) return [];
  const out: [number, number][] = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const [lng, lat] = point;
    if (!isValidLngLat(lng, lat)) continue;
    out.push([lng, lat]);
  }
  return out;
}

export interface RouteDisplayItem {
  key: string;
  path2d: [number, number][];
  path3d: [number, number, number][];
  color: string;
}

function locationVisible(
  loc: TripLocation | undefined,
  visibleDays?: Set<number>,
  visibleTypes?: Set<string>
): boolean {
  if (!loc) return false;
  if (visibleDays && !visibleDays.has(loc.day || 1)) return false;
  if (visibleTypes && !visibleTypes.has(loc.type || "custom")) return false;
  return true;
}

/**
 * Build renderable land-route items from route metadata (fromLocationId / toLocationId)
 * instead of fragile index-based pairing between routes[] and locations[].
 */
export function buildLandRouteDisplayItems(
  routes: RouteInfo[],
  locations: TripLocation[],
  getDayColor: (day: number) => { bg: string },
  visibleDays?: Set<number>,
  visibleTypes?: Set<string>
): RouteDisplayItem[] {
  const locById = new Map(locations.map((l) => [l.id, l]));
  const landRoutes = routes.filter((r) => !r.isFlight);

  return landRoutes
    .map((route, index) => {
      const startLoc = route.fromLocationId ? locById.get(route.fromLocationId) : undefined;
      const endLoc = route.toLocationId ? locById.get(route.toLocationId) : undefined;
      const isCrossDay = !!(route.isCrossDay || route.isOvernight);
      const routeDay = isCrossDay ? route.fromDay || 1 : startLoc?.day || 1;
      const color = isCrossDay ? OVERNIGHT_COLOR : getDayColor(routeDay).bg;

      return {
        key: route.fromLocationId && route.toLocationId
          ? `route-${route.fromLocationId}-${route.toLocationId}`
          : `route-${index}`,
        path2d: sanitizePath2D(route.coordinates),
        path3d: sanitizePath3D(route.coordinates),
        color,
        routeDay,
        isCrossDay,
        startLoc,
        endLoc,
        route,
        index,
      };
    })
    .filter((item) => item.path2d.length >= 2 && item.path3d.length >= 2)
    .filter(({ isCrossDay, startLoc, endLoc, routeDay, route }) => {
      if (isCrossDay) {
        if (!visibleDays) return true;
        const fromDay = startLoc?.day ?? route.fromDay ?? routeDay;
        const toDay = endLoc?.day ?? route.toDay ?? routeDay + 1;
        return visibleDays.has(fromDay) && visibleDays.has(toDay);
      }
      return locationVisible(startLoc, visibleDays, visibleTypes) &&
        locationVisible(endLoc, visibleDays, visibleTypes);
    })
    .map(({ key, path2d, path3d, color }) => ({ key, path2d, path3d, color }));
}

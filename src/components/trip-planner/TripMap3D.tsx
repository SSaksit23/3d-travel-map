"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ComponentProps } from "react";
import {
  Globe,
  GlobeContextProvider,
  useGlobeContext,
  XYZ,
  Vector,
  Entity,
  Polyline,
  Billboard,
} from "@openglobus/openglobus-react";
import { GlobusRgbTerrain, Extent, LonLat } from "@openglobus/og";
import "@openglobus/og/styles";
import type { TripLocation, RouteInfo, FlightInfo } from "@/types/trip";
import { getDayColor } from "./TripStopsList";

interface TripMap3DProps {
  locations: TripLocation[];
  routes: RouteInfo[];
  flights?: FlightInfo[];
  selectedLocationId?: string | null;
  onLocationClick?: (id: string) => void;
  visibleDays?: Set<number>;
  visibleTypes?: Set<string>;
  days?: number[];
  onVisibleDaysChange?: (days: Set<number>) => void;
}

const FLIGHT_COLOR = "#0ea5e9";
const STATION_COLOR = "#10b981";
const AIRPORT_COLOR = "#0ea5e9";
const OVERNIGHT_COLOR = "#8b5cf6";
const MAX_LAND_ROUTE_DISTANCE = 1000000; // meters (1000 km)

// ---- Marker image generation (canvas -> data URI, avoids OpenGlobus font atlas) ----
const markerCache = new Map<string, string>();

function makeMarkerDataUrl(color: string, text: string, selected: boolean): string {
  const key = `${color}|${text}|${selected ? 1 : 0}`;
  const cached = markerCache.get(key);
  if (cached) return cached;

  const dpr = 2;
  const size = 36;
  const canvas = document.createElement("canvas");
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const r = 13;

  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const isEmoji = /\p{Emoji}/u.test(text);
  ctx.font = isEmoji ? "14px sans-serif" : "bold 15px sans-serif";
  ctx.fillText(text, cx, cy + 0.5);

  const url = canvas.toDataURL("image/png");
  markerCache.set(key, url);
  return url;
}

// ---- Coordinate sanitizers (OpenGlobus crashes on undefined/NaN path points) ----
function isValidCoord(c: { lat: number; lng: number } | undefined | null): boolean {
  return (
    !!c &&
    typeof c.lat === "number" &&
    typeof c.lng === "number" &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng)
  );
}

// Turn a raw [lng, lat][] route geometry into a clean [lng, lat, alt][] path,
// discarding any malformed points so OpenGlobus never reads `.x` of undefined.
function sanitizePath3D(
  coordinates: Array<[number, number]> | undefined | null
): [number, number, number][] {
  if (!Array.isArray(coordinates)) return [];
  const out: [number, number, number][] = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const [lng, lat] = point;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    out.push([lng, lat, 200]);
  }
  return out;
}

// ---- Flight arc with altitude (the 3D advantage) ----
function generateFlightArc3D(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  numPoints = 64
): [number, number, number][] {
  const points: [number, number, number][] = [];
  const latDiff = to.lat - from.lat;
  const lngDiff = to.lng - from.lng;
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  // Peak altitude in meters, scaled by distance (capped)
  const maxAlt = Math.min(distance * 60000, 900000) + 60000;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = from.lat + latDiff * t;
    const lng = from.lng + lngDiff * t;
    const alt = maxAlt * Math.sin(t * Math.PI);
    points.push([lng, lat, alt]);
  }
  return points;
}

function getDistance(
  from: { lat: number; lng: number } | undefined,
  to: { lat: number; lng: number } | undefined
): number {
  if (!from || !to || !from.lat || !from.lng || !to.lat || !to.lng) return Infinity;
  const R = 6371000;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---- Camera framing: flies to the bounds of the visible stops ----
function CameraController({ locations }: { locations: TripLocation[] }) {
  const { globe } = useGlobeContext();

  const boundsKey = useMemo(() => {
    if (locations.length === 0) return "";
    const lngs = locations.map((l) => l.coordinates.lng);
    const lats = locations.map((l) => l.coordinates.lat);
    return [
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ]
      .map((n) => n.toFixed(3))
      .join(",");
  }, [locations]);

  useEffect(() => {
    if (!globe || !boundsKey) return;
    const [minLng, minLat, maxLng, maxLat] = boundsKey.split(",").map(Number);
    // Pad the extent so markers are not flush against the screen edge.
    const padLng = Math.max((maxLng - minLng) * 0.25, 0.15);
    const padLat = Math.max((maxLat - minLat) * 0.25, 0.15);
    const extent = new Extent(
      new LonLat(minLng - padLng, minLat - padLat),
      new LonLat(maxLng + padLng, maxLat + padLat)
    );
    const timer = setTimeout(() => {
      globe.planet?.flyExtent(extent);
    }, 400);
    return () => clearTimeout(timer);
  }, [globe, boundsKey]);

  return null;
}

export default function TripMap3D({
  locations,
  routes,
  flights = [],
  selectedLocationId,
  onLocationClick,
  visibleDays,
  visibleTypes,
}: TripMap3DProps) {
  const onLocationClickRef = useRef(onLocationClick);
  useEffect(() => {
    onLocationClickRef.current = onLocationClick;
  }, [onLocationClick]);

  const terrain = useMemo(() => new GlobusRgbTerrain(), []);

  // --- Filter stops by visible days + types (mirrors TripMap) ---
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      if (visibleDays && !visibleDays.has(loc.day || 1)) return false;
      if (visibleTypes && !visibleTypes.has(loc.type || "custom")) return false;
      return true;
    });
  }, [locations, visibleDays, visibleTypes]);

  const validLocations = useMemo(
    () =>
      filteredLocations.filter(
        (loc) =>
          loc.coordinates &&
          typeof loc.coordinates.lat === "number" &&
          typeof loc.coordinates.lng === "number" &&
          !isNaN(loc.coordinates.lat) &&
          !isNaN(loc.coordinates.lng)
      ),
    [filteredLocations]
  );

  // --- Land routes (exclude flights) + map each to its location pair (mirrors TripMap) ---
  const landRoutes = useMemo(() => routes.filter((r) => !r.isFlight), [routes]);

  const locationsByDay = useMemo(() => {
    const map = new Map<number, TripLocation[]>();
    locations.forEach((loc) => {
      const day = loc.day || 1;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(loc);
    });
    return map;
  }, [locations]);

  const routeToLocationPair = useMemo(() => {
    const mapping: Array<{ startLoc: TripLocation; endLoc: TripLocation }> = [];
    let routeIdx = 0;
    const isLastOfDay = (loc: TripLocation) => {
      const d = locationsByDay.get(loc.day || 1) || [];
      return d.length > 0 && d[d.length - 1].id === loc.id;
    };
    const isFirstOfDay = (loc: TripLocation) => {
      const d = locationsByDay.get(loc.day || 1) || [];
      return d.length > 0 && d[0].id === loc.id;
    };
    for (let i = 0; i < locations.length - 1; i++) {
      const startLoc = locations[i];
      const endLoc = locations[i + 1];
      if (startLoc.type === "airport" || endLoc.type === "airport") continue;
      if (getDistance(startLoc.coordinates, endLoc.coordinates) > MAX_LAND_ROUTE_DISTANCE) continue;
      if (startLoc.day !== endLoc.day) {
        const startDay = startLoc.day || 1;
        const endDay = endLoc.day || 1;
        if (isLastOfDay(startLoc) && isFirstOfDay(endLoc) && endDay === startDay + 1) {
          if (routeIdx < landRoutes.length) {
            mapping.push({ startLoc, endLoc });
            routeIdx++;
          }
        }
        continue;
      }
      if (routeIdx < landRoutes.length) {
        mapping.push({ startLoc, endLoc });
        routeIdx++;
      }
    }
    return mapping;
  }, [locations, landRoutes, locationsByDay]);

  const renderRoutes = useMemo(() => {
    return landRoutes
      .map((route, index) => ({ route, pair: routeToLocationPair[index], index }))
      .filter(({ route, pair }) => {
        if (route.isCrossDay || route.isOvernight) {
          if (visibleDays) {
            const fromDay = route.fromDay || 1;
            const toDay = route.toDay || 1;
            if (!visibleDays.has(fromDay) || !visibleDays.has(toDay)) return false;
          }
          return true;
        }
        if (!pair) return true;
        if (visibleDays) {
          if (!visibleDays.has(pair.startLoc.day || 1) || !visibleDays.has(pair.endLoc.day || 1))
            return false;
        }
        if (visibleTypes) {
          if (
            !visibleTypes.has(pair.startLoc.type || "custom") ||
            !visibleTypes.has(pair.endLoc.type || "custom")
          )
            return false;
        }
        return true;
      })
      .map(({ route, pair, index }) => {
        const isOvernight = route.isCrossDay || route.isOvernight;
        const routeDay = isOvernight ? route.fromDay || 1 : pair?.startLoc.day || 1;
        const color = isOvernight ? OVERNIGHT_COLOR : getDayColor(routeDay).bg;
        const path = sanitizePath3D(route.coordinates);
        return { key: `route-${index}`, path, color };
      })
      // Drop any route whose geometry is missing/degenerate — feeding an
      // undefined or single-point path to OpenGlobus crashes its renderer.
      .filter((r) => r.path.length >= 2);
  }, [landRoutes, routeToLocationPair, visibleDays, visibleTypes]);

  const flightArcs = useMemo(() => {
    return flights
      .filter((f) => !visibleDays || visibleDays.has(f.day || 1))
      .filter((f) => isValidCoord(f.departure?.coordinates) && isValidCoord(f.arrival?.coordinates))
      .map((flight) => ({
        key: `flight-${flight.id}`,
        path: generateFlightArc3D(flight.departure.coordinates, flight.arrival.coordinates),
      }))
      .filter((f) => f.path.length >= 2);
  }, [flights, visibleDays]);

  // --- Marker entities ---
  const markers = useMemo(() => {
    return validLocations.map((location) => {
      const isAirport = location.type === "airport";
      const isStation = location.type === "station";
      const isHotel = location.type === "hotel";
      const shouldShowNumber = !isAirport && !isStation;

      let label = "";
      if (isHotel) label = "🏨";
      else if (isAirport) label = "✈️";
      else if (isStation) label = "🚂";
      else if (shouldShowNumber) {
        const sameTypeLocations = locations.filter(
          (l) =>
            l.type !== "airport" &&
            l.type !== "station" &&
            (l.day || 1) === (location.day || 1)
        );
        label = String(sameTypeLocations.findIndex((l) => l.id === location.id) + 1);
      }

      const color = isAirport
        ? AIRPORT_COLOR
        : isStation
          ? STATION_COLOR
          : getDayColor(location.day).bg;
      const selected = selectedLocationId === location.id;

      return {
        id: location.id,
        lon: location.coordinates.lng,
        lat: location.coordinates.lat,
        src: makeMarkerDataUrl(color, label, selected),
        selected,
      };
    });
  }, [validLocations, locations, selectedLocationId]);

  const handleLclick = (e: unknown) => {
    const picked = (e as { pickingObject?: { properties?: { id?: string } } })?.pickingObject;
    const id = picked?.properties?.id;
    if (id) onLocationClickRef.current?.(id);
  };

  return (
    <div className="w-full h-full relative">
      <GlobeContextProvider>
        <Globe
          name="trip-globe-3d"
          terrain={terrain}
          atmosphereEnabled
          sunActive={false}
          nightTextureSrc={null}
          specularTextureSrc={null}
        >
          <XYZ
            name="ESRI Satellite"
            isBaseLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={18}
            attribution="Tiles &copy; Esri"
          />

          <Vector name="trip-vector" scaleByDistance={[6000000, 24000000, 10000000000]} onLclick={handleLclick}>
            {([
              ...renderRoutes.map((r) => (
                <Entity key={r.key}>
                  <Polyline path={[r.path]} color={r.color} thickness={4} opacity={0.9} />
                </Entity>
              )),
              ...flightArcs.map((f) => (
                <Entity key={f.key}>
                  <Polyline path={[f.path]} color={FLIGHT_COLOR} thickness={3} opacity={0.95} />
                </Entity>
              )),
              ...markers.map((m) => (
                <Entity
                  key={`${m.id}${m.selected ? "-sel" : ""}`}
                  lon={m.lon}
                  lat={m.lat}
                  properties={{ id: m.id }}
                >
                  <Billboard src={m.src} size={[m.selected ? 40 : 36, m.selected ? 40 : 36]} />
                </Entity>
              )),
            ] as unknown as ComponentProps<typeof Vector>["children"])}
          </Vector>
        </Globe>
        <CameraController locations={validLocations} />
      </GlobeContextProvider>
    </div>
  );
}

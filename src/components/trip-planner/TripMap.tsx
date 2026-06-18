"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Map as MapContainer,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MapRoute,
  MapControls,
  Map3DBuildings,
} from "@/components/ui/map";
import type { TripLocation, RouteInfo, FlightInfo } from "@/types/trip";
import type MapLibreGL from "maplibre-gl";
import { getDayColor } from "./TripStopsList";
import { Layers, Eye, EyeOff, Map as MapIcon, Satellite, Mountain, Plane, Building2 } from "lucide-react";

interface TripMapProps {
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

// Drop malformed points (missing/NaN lng or lat) so a bad route geometry can't
// crash MapLibre or the routeKey math (`start[0].toFixed`). Returns clean [lng, lat][].
function sanitizeLngLatPath(
  coordinates: Array<[number, number]> | undefined | null
): [number, number][] {
  if (!Array.isArray(coordinates)) return [];
  const out: [number, number][] = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const [lng, lat] = point;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    out.push([lng, lat]);
  }
  return out;
}

// Generate curved arc points for flight routes (great circle approximation)
function generateFlightArc(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  numPoints: number = 50
): [number, number][] {
  const points: [number, number][] = [];
  
  // Calculate the midpoint and arc height
  const midLat = (from.lat + to.lat) / 2;
  const midLng = (from.lng + to.lng) / 2;
  
  // Calculate distance for arc height
  const latDiff = Math.abs(to.lat - from.lat);
  const lngDiff = Math.abs(to.lng - from.lng);
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  
  // Arc height proportional to distance (max 15 degrees)
  const arcHeight = Math.min(distance * 0.3, 15);
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    
    // Linear interpolation for position
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    
    // Add arc (parabolic curve)
    const arcOffset = arcHeight * Math.sin(t * Math.PI);
    
    points.push([lng, lat + arcOffset]);
  }
  
  return points;
}

type MapStyleType = "street" | "satellite" | "terrain";

const mapStyles: Record<MapStyleType, { light: string; dark: string; label: string; icon: typeof MapIcon }> = {
  street: {
    // Using Voyager style for better visibility in both themes
    light: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    dark: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    label: "Street",
    icon: MapIcon,
  },
  satellite: {
    // Using free OpenFreeMap satellite style
    light: "https://tiles.openfreemap.org/styles/liberty",
    dark: "https://tiles.openfreemap.org/styles/liberty",
    label: "Satellite",
    icon: Satellite,
  },
  terrain: {
    // Dark Matter style for a sleek dark map
    light: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    label: "Dark",
    icon: Mountain,
  },
};

export function TripMap({
  locations,
  routes,
  flights = [],
  selectedLocationId,
  onLocationClick,
  visibleDays,
  visibleTypes,
  days = [],
  onVisibleDaysChange,
}: TripMapProps) {
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [currentStyle, setCurrentStyle] = useState<MapStyleType>("street");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showDayFilter, setShowDayFilter] = useState(false);
  const [show3DBuildings, setShow3DBuildings] = useState(false);

  // The camera tilt + terrain + extrusions are handled inside <Map3DBuildings>
  // (via the map context) so this just flips the mode on/off.
  const toggle3DBuildings = () => setShow3DBuildings((v) => !v);

  // Toggle day visibility
  const toggleDayVisibility = (day: number) => {
    if (!visibleDays || !onVisibleDaysChange) return;
    
    const newVisible = new Set(visibleDays);
    if (newVisible.has(day)) {
      // Don't allow hiding all days
      if (newVisible.size > 1) {
        newVisible.delete(day);
      }
    } else {
      newVisible.add(day);
    }
    onVisibleDaysChange(newVisible);
  };

  // Show all days
  const showAllDays = () => {
    if (onVisibleDaysChange) {
      onVisibleDaysChange(new Set(days));
    }
  };

  // Generate flight arc routes
  const flightRoutes = useMemo(() => {
    return flights
      .filter(f => !visibleDays || visibleDays.has(f.day || 1))
      .map(flight => ({
        flight,
        coordinates: generateFlightArc(flight.departure.coordinates, flight.arrival.coordinates),
      }));
  }, [flights, visibleDays]);

  // Filter locations based on visible days AND visible types
  const filteredLocations = useMemo(() => {
    return locations.filter(loc => {
      // Check day visibility
      if (visibleDays && !visibleDays.has(loc.day || 1)) {
        return false;
      }
      // Check type visibility
      if (visibleTypes && !visibleTypes.has(loc.type || "custom")) {
        return false;
      }
      return true;
    });
  }, [locations, visibleDays, visibleTypes]);

  // Filter routes - only show LAND routes (not flights)
  // Flight routes are rendered separately as curved arcs
  const landRoutes = useMemo(() => routes.filter(route => !route.isFlight), [routes]);
  
  // Max distance for land routes (1000 km) - beyond this, locations should be connected by flight
  const MAX_LAND_ROUTE_DISTANCE = 1000000; // meters (1000 km)
  
  // Calculate distance between two coordinates (Haversine formula)
  const getDistance = (from: { lat: number; lng: number } | undefined, to: { lat: number; lng: number } | undefined) => {
    // Return infinite distance if coordinates are invalid (will be filtered out)
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
  };
  
  // Group locations by day for cross-day detection
  const locationsByDay = useMemo(() => {
    const map = new Map<number, TripLocation[]>();
    locations.forEach(loc => {
      const day = loc.day || 1;
      if (!map.has(day)) {
        map.set(day, []);
      }
      map.get(day)!.push(loc);
    });
    return map;
  }, [locations]);

  // Helper to check if a location is the last of its day
  const isLastOfDay = (loc: TripLocation) => {
    const dayLocs = locationsByDay.get(loc.day || 1) || [];
    return dayLocs.length > 0 && dayLocs[dayLocs.length - 1].id === loc.id;
  };

  // Helper to check if a location is the first of its day
  const isFirstOfDay = (loc: TripLocation) => {
    const dayLocs = locationsByDay.get(loc.day || 1) || [];
    return dayLocs.length > 0 && dayLocs[0].id === loc.id;
  };

  // Build mapping from land route index to location pair
  const routeToLocationPair = useMemo(() => {
    const mapping: Array<{ startLoc: TripLocation; endLoc: TripLocation; isCrossDay?: boolean }> = [];
    let routeIdx = 0;
    
    for (let i = 0; i < locations.length - 1; i++) {
      const startLoc = locations[i];
      const endLoc = locations[i + 1];
      
      // Skip if either location is an airport (they use flight routes)
      if (startLoc.type === 'airport' || endLoc.type === 'airport') {
        continue;
      }
      
      // Skip if locations are too far apart
      const distance = getDistance(startLoc.coordinates, endLoc.coordinates);
      if (distance > MAX_LAND_ROUTE_DISTANCE) {
        continue;
      }
      
      // Handle cross-day routes (last of day N → first of day N+1)
      if (startLoc.day !== endLoc.day) {
        const startDay = startLoc.day || 1;
        const endDay = endLoc.day || 1;
        
        // Only allow cross-day if it's last→first and consecutive days
        if (isLastOfDay(startLoc) && isFirstOfDay(endLoc) && endDay === startDay + 1) {
          if (routeIdx < landRoutes.length) {
            mapping.push({ startLoc, endLoc, isCrossDay: true });
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

  // Filter land routes based on visible days AND visible types
  const filteredRoutes = useMemo(() => {
    return landRoutes.map((route, index) => {
      const pair = routeToLocationPair[index];
      return { route, pair, index };
    }).filter(({ route, pair }) => {
      // Handle cross-day routes directly using route properties
      if (route.isCrossDay) {
        // Cross-day routes: check if both fromDay and toDay are visible
        if (visibleDays) {
          const fromDay = route.fromDay || 1;
          const toDay = route.toDay || 1;
          if (!visibleDays.has(fromDay) || !visibleDays.has(toDay)) {
            return false;
          }
        }
        // Cross-day routes should always be visible regardless of type filters
        return true;
      }
      
      // Regular routes: use pair mapping
      if (!pair) return true;
      
      // Check day visibility
      if (visibleDays) {
        if (!visibleDays.has(pair.startLoc.day || 1) || !visibleDays.has(pair.endLoc.day || 1)) {
          return false;
        }
      }
      
      // Check type visibility
      if (visibleTypes) {
        if (!visibleTypes.has(pair.startLoc.type || "custom") || !visibleTypes.has(pair.endLoc.type || "custom")) {
          return false;
        }
      }
      
      return true;
    });
  }, [landRoutes, routeToLocationPair, visibleDays, visibleTypes]);

  // Filter locations with valid coordinates
  const validLocations = useMemo(() => {
    return filteredLocations.filter(loc => 
      loc.coordinates && 
      typeof loc.coordinates.lat === 'number' && 
      typeof loc.coordinates.lng === 'number' &&
      !isNaN(loc.coordinates.lat) && 
      !isNaN(loc.coordinates.lng)
    );
  }, [filteredLocations]);

  // Calculate center based on valid locations
  const center: [number, number] = validLocations.length > 0
    ? [
        validLocations.reduce((sum, loc) => sum + loc.coordinates.lng, 0) / validLocations.length,
        validLocations.reduce((sum, loc) => sum + loc.coordinates.lat, 0) / validLocations.length,
      ]
    : [0, 20]; // Default center

  // Calculate appropriate zoom level based on valid locations spread
  const calculateZoom = () => {
    if (validLocations.length === 0) return 2;
    if (validLocations.length === 1) return 12;

    const lngs = validLocations.map((l) => l.coordinates.lng);
    const lats = validLocations.map((l) => l.coordinates.lat);
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);
    const latSpread = Math.max(...lats) - Math.min(...lats);
    const maxSpread = Math.max(lngSpread, latSpread);

    if (maxSpread > 100) return 2;
    if (maxSpread > 50) return 3;
    if (maxSpread > 20) return 4;
    if (maxSpread > 10) return 5;
    if (maxSpread > 5) return 6;
    if (maxSpread > 2) return 7;
    if (maxSpread > 1) return 8;
    if (maxSpread > 0.5) return 10;
    return 12;
  };

  // Fit bounds when valid locations change
  useEffect(() => {
    if (mapRef.current && validLocations.length > 0) {
      const bounds = validLocations.reduce(
        (acc, loc) => {
          acc.minLng = Math.min(acc.minLng, loc.coordinates.lng);
          acc.maxLng = Math.max(acc.maxLng, loc.coordinates.lng);
          acc.minLat = Math.min(acc.minLat, loc.coordinates.lat);
          acc.maxLat = Math.max(acc.maxLat, loc.coordinates.lat);
          return acc;
        },
        { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
      );

      mapRef.current.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding: 80, duration: 1000, maxZoom: 14 }
      );
    }
  }, [validLocations]);

  const StyleIcon = mapStyles[currentStyle].icon;

  return (
    <div className="w-full h-full relative">
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={calculateZoom()}
        styles={{
          light: mapStyles[currentStyle].light,
          dark: mapStyles[currentStyle].dark,
        }}
      >
        <MapControls
          position="bottom-right"
          showZoom
          showLocate
          showFullscreen
          showCompass={show3DBuildings}
        />

        {/* 3D terrain + extruded buildings (toggled via the 3D control) */}
        <Map3DBuildings enabled={show3DBuildings} />

        {/* Render land routes with day-based colors - solid lines following roads */}
        {filteredRoutes.map(({ route, pair, index }) => {
          const isOvernight = route.isCrossDay || route.isOvernight;
          const routeDay = isOvernight ? (route.fromDay || 1) : (pair?.startLoc.day || 1);
          const routeColor = isOvernight ? "#8b5cf6" : getDayColor(routeDay).bg;

          const coords = sanitizeLngLatPath(route.coordinates);
          // Skip routes whose geometry is missing/degenerate to avoid crashing MapLibre.
          if (coords.length < 2) return null;

          const start = coords[0];
          const end = coords[coords.length - 1];
          const routeKey = `route-${index}-${start[0].toFixed(4)}-${start[1].toFixed(4)}-${end[0].toFixed(4)}-${end[1].toFixed(4)}`;

          return (
            <MapRoute
              key={routeKey}
              coordinates={coords}
              color={routeColor}
              width={4}
              opacity={0.85}
            />
          );
        })}

        {/* Render flight routes as curved arcs */}
        {flightRoutes.map(({ flight, coordinates }) => {
          const coords = sanitizeLngLatPath(coordinates);
          if (coords.length < 2) return null;
          return (
            <MapRoute
              key={`flight-${flight.id}`}
              coordinates={coords}
              color="#0ea5e9" // Sky blue for flights
              width={3}
              opacity={0.9}
              dashArray={[8, 4]} // Dashed line for flights
            />
          );
        })}

        {/* Render location markers with day-based colors */}
        {validLocations.map((location) => {
          const dayColor = getDayColor(location.day);
          const isHotel = location.type === "hotel";
          const isAirport = location.type === "airport";
          const isStation = location.type === "station";
          
          // Only number these types: attraction, city, hotel, restaurant, landmark, custom
          const shouldShowNumber = !isAirport && !isStation;
          
          // Calculate display number only for numbered types (within the same day)
          let displayNumber = 0;
          if (shouldShowNumber) {
            // Count only numbered types in the same day that come before this location
            const sameTypeLocations = locations.filter(l => 
              l.type !== "airport" && 
              l.type !== "station" &&
              (l.day || 1) === (location.day || 1)
            );
            displayNumber = sameTypeLocations.findIndex(l => l.id === location.id) + 1;
          }

          // Get marker content based on type
          const getMarkerContent = () => {
            if (isHotel) return "🏨";
            if (isAirport) return "✈️";
            if (isStation) return "🚂";
            return displayNumber;
          };

          return (
            <MapMarker
              key={location.id}
              longitude={location.coordinates.lng}
              latitude={location.coordinates.lat}
              onClick={() => onLocationClick?.(location.id)}
            >
              <MarkerContent>
                <div
                  className={`
                    size-8 rounded-full flex items-center justify-center 
                    text-white text-sm font-bold shadow-lg border-2 border-white
                    transition-transform hover:scale-110
                    ${selectedLocationId === location.id ? "ring-2 ring-offset-2 ring-indigo-500 scale-110" : ""}
                    ${isHotel ? "ring-2 ring-violet-300" : ""}
                    ${isAirport ? "bg-sky-500" : ""}
                    ${isStation ? "bg-emerald-500" : ""}
                  `}
                  style={{ backgroundColor: isAirport ? "#0ea5e9" : isStation ? "#10b981" : dayColor.bg }}
                >
                  {getMarkerContent()}
                </div>
                {showLabels && (
                  <MarkerLabel position="bottom">
                    <span
                      className="bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-medium shadow-sm"
                      style={{ borderLeft: `3px solid ${isAirport ? "#0ea5e9" : isStation ? "#10b981" : dayColor.bg}` }}
                    >
                      {location.name.split(",")[0]}
                    </span>
                  </MarkerLabel>
                )}
              </MarkerContent>
            </MapMarker>
          );
        })}
      </MapContainer>

      {/* Map Controls - Top Left */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        {/* Label Toggle */}
        <button
          onClick={() => setShowLabels(!showLabels)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg shadow-md transition-all
            ${showLabels 
              ? "bg-primary text-primary-foreground" 
              : "bg-background/90 backdrop-blur-sm text-foreground hover:bg-accent"
            }
          `}
          title={showLabels ? "Hide labels" : "Show labels"}
        >
          {showLabels ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          <span className="text-xs font-medium">Labels</span>
        </button>

        {/* Map Style Selector */}
        <div className="relative">
          <button
            onClick={() => setShowStyleMenu(!showStyleMenu)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-md bg-background/90 backdrop-blur-sm hover:bg-accent transition-all"
          >
            <Layers className="size-4" />
            <span className="text-xs font-medium">{mapStyles[currentStyle].label}</span>
          </button>

          {showStyleMenu && (
            <div className="absolute top-full left-0 mt-1 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border border-border/50 overflow-hidden min-w-[140px]">
              {(Object.keys(mapStyles) as MapStyleType[]).map((style) => {
                const Icon = mapStyles[style].icon;
                return (
                  <button
                    key={style}
                    onClick={() => {
                      setCurrentStyle(style);
                      setShowStyleMenu(false);
                    }}
                    className={`
                      flex items-center gap-2 w-full px-3 py-2 text-left text-xs transition-colors
                      ${currentStyle === style ? "bg-primary/10 text-primary" : "hover:bg-accent"}
                    `}
                  >
                    <Icon className="size-4" />
                    {mapStyles[style].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3D Buildings Toggle */}
        <button
          onClick={toggle3DBuildings}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg shadow-md transition-all
            ${show3DBuildings
              ? "bg-primary text-primary-foreground"
              : "bg-background/90 backdrop-blur-sm text-foreground hover:bg-accent"
            }
          `}
          title={show3DBuildings ? "Disable 3D buildings" : "Show 3D buildings & terrain"}
        >
          <Building2 className="size-4" />
          <span className="text-xs font-medium">3D Buildings</span>
        </button>

        {/* Day Filter on Map */}
        {days.length > 1 && onVisibleDaysChange && (
          <div className="relative">
            <button
              onClick={() => setShowDayFilter(!showDayFilter)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-md bg-background/90 backdrop-blur-sm hover:bg-accent transition-all"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="9" y1="4" x2="9" y2="10" />
                <line x1="15" y1="4" x2="15" y2="10" />
              </svg>
              <span className="text-xs font-medium">Days</span>
            </button>

            {showDayFilter && (
              <div className="absolute top-full left-0 mt-1 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border border-border/50 overflow-hidden min-w-[160px] p-2">
                <div className="flex flex-wrap gap-1 mb-2">
                  {days.map(day => {
                    const dayColor = getDayColor(day);
                    const isVisible = visibleDays?.has(day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDayVisibility(day)}
                        className={`
                          px-2 py-1 rounded text-xs font-medium transition-all
                          ${isVisible
                            ? "text-white"
                            : "opacity-40 bg-muted-foreground/20 text-muted-foreground hover:opacity-70"
                          }
                        `}
                        style={isVisible ? { backgroundColor: dayColor.bg } : {}}
                      >
                        Day {day}
                      </button>
                    );
                  })}
                </div>
                {visibleDays && visibleDays.size < days.length && (
                  <button
                    onClick={() => {
                      showAllDays();
                      setShowDayFilter(false);
                    }}
                    className="w-full px-2 py-1 rounded text-xs font-medium text-center bg-accent hover:bg-accent/80 transition-colors"
                  >
                    Show All Days
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

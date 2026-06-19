"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Plane, Sparkles, X, PanelLeftClose, PanelLeft, Maximize2, Minimize2, Upload, Download, PlaneTakeoff, Train, Hotel, Save, FolderOpen, Trash2, Clock, RotateCw, Globe2, Map as MapIcon, FilePlus } from "lucide-react";
import { LocationSearch } from "./LocationSearch";
import { TripStopsList } from "./TripStopsList";
import { TripMap } from "./TripMap";
import { TripMap3DClient } from "./TripMap3DClient";
import { DocumentUpload } from "./DocumentUpload";
import { ExportItinerary } from "./ExportItinerary";
import { FlightInput } from "./FlightInput";
import { TrainInput } from "./TrainInput";
import { Button } from "@/components/ui/button";
import type { TripLocation, RouteInfo, GeminiResponse, GeocodeResult, FlightInfo, TrainInfo, AccommodationSuggestion, SavedTrip } from "@/types/trip";
import { calculateDistance } from "@/lib/utils";
import {
  loadSavedTrips,
  persistSavedTrips,
  loadActiveTripId,
  persistActiveTripId,
  upsertSavedTrip,
} from "@/lib/trip-storage";
import { normalizeLocationOrders } from "@/lib/trip-order";

interface OvernightRoute {
  fromDay: number;
  toDay: number;
  fromLocation: string;
  toLocation: string;
  distance: number;
  duration: number;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function TripPlanner() {
  const [locations, setLocations] = useState<TripLocation[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([1]);
  const [visibleDays, setVisibleDays] = useState<Set<number>>(new Set([1]));
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(["attraction", "restaurant", "hotel", "landmark", "city", "airport", "station", "custom"]));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapMode, setMapMode] = useState<"2d" | "3d">("2d");
  // Once the 3D globe has been opened we keep it mounted and just hide it, because
  // unmounting OpenGlobus mid-session destroys the WebGL context and crashes its
  // entity buffer cleanup ("deleteBuffer of null").
  const [has3DBeenOpened, setHas3DBeenOpened] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFlightModal, setShowFlightModal] = useState(false);
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [flights, setFlights] = useState<FlightInfo[]>([]);
  const [trains, setTrains] = useState<TrainInfo[]>([]);
  const [editingFlight, setEditingFlight] = useState<FlightInfo | null>(null);
  const [overnightRoutes, setOvernightRoutes] = useState<OvernightRoute[]>([]);
  const [accommodationSuggestions, setAccommodationSuggestions] = useState<Map<string, AccommodationSuggestion[]>>(new Map());
  const [loadingAccommodations, setLoadingAccommodations] = useState<Set<string>>(new Set());
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [showSavedTrips, setShowSavedTrips] = useState(false);
  const [tripName, setTripName] = useState("");
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTripName, setActiveTripName] = useState("Untitled trip");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySavedTrip = useCallback((trip: SavedTrip) => {
    setLocations(trip.locations);
    setRoutes(trip.routes);
    setFlights(trip.flights || []);
    setTrains(trip.trains || []);
    setDays(trip.days.length > 0 ? trip.days : [1]);
    setVisibleDays(new Set(trip.days.length > 0 ? trip.days : [1]));
    setVisibleTypes(new Set(["attraction", "restaurant", "hotel", "landmark", "city", "airport", "station", "custom"]));
    setSelectedLocationId(null);
    setActiveTripId(trip.id);
    setActiveTripName(trip.name);
    setTripName(trip.name);
    persistActiveTripId(trip.id);
  }, []);

  const clearTripWorkspace = useCallback(() => {
    setLocations([]);
    setRoutes([]);
    setFlights([]);
    setTrains([]);
    setDays([1]);
    setVisibleDays(new Set([1]));
    setVisibleTypes(new Set(["attraction", "restaurant", "hotel", "landmark", "city", "airport", "station", "custom"]));
    setSelectedLocationId(null);
    setAiMessage(null);
    setSuggestions([]);
    setOvernightRoutes([]);
    setAccommodationSuggestions(new Map());
    setTripName("");
  }, []);

  const handleNewTrip = useCallback(() => {
    const newId = `trip-${Date.now()}`;
    clearTripWorkspace();
    setActiveTripId(newId);
    setActiveTripName("Untitled trip");
    persistActiveTripId(newId);
    setShowSavedTrips(false);
  }, [clearTripWorkspace]);

  const persistCurrentTrip = useCallback((
    tripId: string,
    name: string,
    snapshot: {
      locations: TripLocation[];
      routes: RouteInfo[];
      flights: FlightInfo[];
      trains: TrainInfo[];
      days: number[];
    }
  ) => {
    if (snapshot.locations.length === 0) return;
    const trip: SavedTrip = {
      id: tripId,
      name,
      savedAt: new Date().toISOString(),
      ...snapshot,
    };
    setSavedTrips((prev) => {
      const next = upsertSavedTrip(prev, trip);
      persistSavedTrips(next);
      return next;
    });
  }, []);

  // Load saved trips + restore last active trip on mount
  useEffect(() => {
    const trips = loadSavedTrips();
    setSavedTrips(trips);
    const activeId = loadActiveTripId();
    if (!activeId) return;
    const active = trips.find((t) => t.id === activeId);
    if (active) applySavedTrip(active);
  }, [applySavedTrip]);

  const persistTrips = useCallback((trips: SavedTrip[]) => {
    setSavedTrips(trips);
    persistSavedTrips(trips);
  }, []);

  const handleSaveTrip = useCallback(() => {
    if (locations.length === 0) return;
    const name = tripName.trim() || activeTripName || `Trip ${new Date().toLocaleDateString()}`;
    const tripId = activeTripId || `trip-${Date.now()}`;
    const trip: SavedTrip = {
      id: tripId,
      name,
      savedAt: new Date().toISOString(),
      locations,
      routes,
      flights,
      trains,
      days,
    };
    persistTrips(upsertSavedTrip(savedTrips, trip));
    setActiveTripId(tripId);
    setActiveTripName(name);
    setTripName("");
    persistActiveTripId(tripId);
  }, [locations, routes, flights, trains, days, tripName, activeTripId, activeTripName, savedTrips, persistTrips]);

  const handleLoadTrip = useCallback((trip: SavedTrip) => {
    applySavedTrip(trip);
    setShowSavedTrips(false);
  }, [applySavedTrip]);

  const handleDeleteTrip = useCallback((tripId: string) => {
    persistTrips(savedTrips.filter(t => t.id !== tripId));
    if (activeTripId === tripId) {
      handleNewTrip();
    }
  }, [savedTrips, persistTrips, activeTripId, handleNewTrip]);

  // Fetch route between two points - tries local OSMnx service first, then falls back to OSRM
  const fetchRoute = useCallback(async (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): Promise<RouteInfo | null> => {
    // Validate coordinates
    if (!from.lat || !from.lng || !to.lat || !to.lng ||
        from.lat === 0 || from.lng === 0 || to.lat === 0 || to.lng === 0 ||
        isNaN(from.lat) || isNaN(from.lng) || isNaN(to.lat) || isNaN(to.lng)) {
      console.warn("Invalid coordinates for route:", { from, to });
      // Return a direct line as fallback
      return {
        coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
        duration: 0,
        distance: 0,
      };
    }

    try {
      // Try local API route which handles OpenRouteService + OSRM fallback
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: from.lat, lng: from.lng },
          destination: { lat: to.lat, lng: to.lng },
          mode: 'drive'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        console.log("Route API response:", {
          success: data.success,
          distance_km: data.distance_km,
          duration_minutes: data.duration_minutes,
          hasCoordinates: !!data.path_coordinates,
          coordinatesLength: data.path_coordinates?.length || 0
        });
        
        if (data.path_coordinates && data.path_coordinates.length > 0) {
          let distMeters = (data.distance_km || 0) * 1000;
          let durSeconds = (data.duration_minutes || 0) * 60;

          // If API returned 0 distance but points differ, compute Haversine client-side
          if (distMeters < 10 && (from.lat !== to.lat || from.lng !== to.lng)) {
            const R = 6371000;
            const p1 = (from.lat * Math.PI) / 180;
            const p2 = (to.lat * Math.PI) / 180;
            const dp = ((to.lat - from.lat) * Math.PI) / 180;
            const dl = ((to.lng - from.lng) * Math.PI) / 180;
            const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
            const direct = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            distMeters = direct * 1.4;
            durSeconds = (distMeters / 1000) / 60 * 3600;
            console.log("⚠ API returned 0 distance, using Haversine:", (distMeters / 1000).toFixed(1), "km");
          } else {
            console.log("✓ Using road route:", data.distance_km?.toFixed(1), "km,", data.duration_minutes?.toFixed(0), "min");
          }

          return {
            coordinates: data.path_coordinates,
            duration: durSeconds,
            distance: distMeters,
          };
        } else {
          console.warn("Route API returned no coordinates, data:", data);
        }
      } else {
        console.warn("Route API returned error status:", response.status);
      }
      
      // If API route fails, calculate Haversine distance as fallback
      console.warn("⚠ Route API failed, using Haversine fallback");
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn("Route fetch timeout, using Haversine fallback");
      } else {
        console.warn("Route fetch error:", error);
      }
    }

    // Haversine fallback - calculate direct distance and estimate road distance
    const R = 6371000; // Earth's radius in meters
    const lat1 = (from.lat * Math.PI) / 180;
    const lat2 = (to.lat * Math.PI) / 180;
    const dLat = ((to.lat - from.lat) * Math.PI) / 180;
    const dLng = ((to.lng - from.lng) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const directDistance = R * c;

    // Roads are typically ~1.4x direct distance
    const roadDistance = directDistance * 1.4;
    // Estimate 60 km/h average speed
    const duration = (roadDistance / 1000) / 60 * 3600; // seconds

    console.log("Using Haversine fallback:", (roadDistance / 1000).toFixed(1), "km");
    
    return {
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
      duration: duration,
      distance: roadDistance,
    };
  }, []);

  // Calculate routes for all locations (preserving flight routes)
  // Max distance for land routes (1000 km) - beyond this, locations should be connected by flight
  const MAX_LAND_ROUTE_DISTANCE = 1000000; // meters (1000 km)
  
  const calculateRoutes = useCallback(async (locs: TripLocation[], currentFlights?: FlightInfo[]) => {
    // Use provided flights or get from state
    const flightsList = currentFlights || flights;
    
    // IMPORTANT: Sort locations by day first, then by order within each day
    // This ensures cross-day connections work properly
    const sortedLocs = [...locs].sort((a, b) => {
      const dayA = a.day || 1;
      const dayB = b.day || 1;
      if (dayA !== dayB) {
        return dayA - dayB;
      }
      // Within the same day, sort by order
      return (a.order || 0) - (b.order || 0);
    });
    
    console.log("Calculating routes for sorted locations:", sortedLocs.map(l => ({
      name: l.name.substring(0, 30),
      day: l.day,
      order: l.order,
      type: l.type,
    })));
    
    // Build a set of location IDs that are flight-related (departure/arrival airports)
    const flightLocationIds = new Set<string>();
    flightsList.forEach(f => {
      flightLocationIds.add(`${f.id}-dep`);
      flightLocationIds.add(`${f.id}-arr`);
    });
    
    // Group locations by day for cross-day connection detection
    const locationsByDay = new Map<number, TripLocation[]>();
    sortedLocs.forEach(loc => {
      const day = loc.day || 1;
      if (!locationsByDay.has(day)) {
        locationsByDay.set(day, []);
      }
      locationsByDay.get(day)!.push(loc);
    });
    
    // Get sorted days
    const sortedDays = Array.from(locationsByDay.keys()).sort((a, b) => a - b);
    console.log(`Days found: ${sortedDays.join(", ")}`);
    
    // Build a flat array of locations in the correct order:
    // Day 1 locations in order, then Day 2 locations in order, etc.
    const orderedLocs: TripLocation[] = [];
    for (const day of sortedDays) {
      const dayLocs = locationsByDay.get(day) || [];
      // Sort by order within the day
      dayLocs.sort((a, b) => (a.order || 0) - (b.order || 0));
      orderedLocs.push(...dayLocs);
    }
    
    // Helper to check if a location is the last of its day
    const isLastOfDay = (loc: TripLocation) => {
      const day = loc.day || 1;
      const dayLocs = locationsByDay.get(day) || [];
      return dayLocs.length > 0 && dayLocs[dayLocs.length - 1].id === loc.id;
    };
    
    // Helper to check if a location is the first of its day
    const isFirstOfDay = (loc: TripLocation) => {
      const day = loc.day || 1;
      const dayLocs = locationsByDay.get(day) || [];
      return dayLocs.length > 0 && dayLocs[0].id === loc.id;
    };
    
    // Calculate routes within each day
    const newLandRoutes: RouteInfo[] = [];
    
    for (const day of sortedDays) {
      const dayLocs = locationsByDay.get(day) || [];
      console.log(`Processing Day ${day}: ${dayLocs.length} locations`);
      
      // Calculate routes between consecutive locations within the same day
      for (let i = 0; i < dayLocs.length - 1; i++) {
        const loc = dayLocs[i];
        const nextLoc = dayLocs[i + 1];
        
        // Skip flight-related pairs
        if (flightLocationIds.has(loc.id) && flightLocationIds.has(nextLoc.id)) {
          continue;
        }
        
        // Skip airport connections
        if (loc.type === 'airport' || nextLoc.type === 'airport') {
          continue;
        }
        
        // Skip if too far apart for land travel
        const distance = calculateDistance(loc.coordinates, nextLoc.coordinates);
        if (distance > MAX_LAND_ROUTE_DISTANCE) {
          console.log(`Skipping land route: ${loc.name} to ${nextLoc.name} (${Math.round(distance/1000)}km - too far)`);
          continue;
        }
        
        // Small delay between requests to avoid OSRM rate limiting
        if (newLandRoutes.length > 0) {
          await new Promise(r => setTimeout(r, 300));
        }
        console.log(`Route: ${loc.name} → ${nextLoc.name} (Day ${day})`);
        const route = await fetchRoute(loc.coordinates, nextLoc.coordinates);
        if (route) {
          route.fromLocationId = loc.id;
          route.toLocationId = nextLoc.id;
          newLandRoutes.push(route);
        }
      }
    }
    
    // Calculate cross-day routes (last NON-AIRPORT location of day N to first NON-AIRPORT location of day N+1)
    console.log(`Calculating cross-day routes for ${sortedDays.length} days: ${sortedDays.join(', ')}`);
    
    for (let i = 0; i < sortedDays.length - 1; i++) {
      const currentDay = sortedDays[i];
      const nextDay = sortedDays[i + 1];
      
      const currentDayLocs = locationsByDay.get(currentDay) || [];
      const nextDayLocs = locationsByDay.get(nextDay) || [];
      
      console.log(`Day ${currentDay}: ${currentDayLocs.length} locations, Day ${nextDay}: ${nextDayLocs.length} locations`);
      
      if (currentDayLocs.length > 0 && nextDayLocs.length > 0) {
        // Find the last NON-AIRPORT, NON-STATION location of the current day
        // If all locations are airports/stations, fall back to using the last location
        const nonTransportCurrentDay = currentDayLocs.filter(
          loc => loc.type !== 'airport' && loc.type !== 'station'
        );
        const nonTransportNextDay = nextDayLocs.filter(
          loc => loc.type !== 'airport' && loc.type !== 'station'
        );
        
        // Use non-transport locations if available, otherwise fall back to all locations
        const lastOfCurrentDay = nonTransportCurrentDay.length > 0 
          ? nonTransportCurrentDay[nonTransportCurrentDay.length - 1]
          : currentDayLocs[currentDayLocs.length - 1];
        const firstOfNextDay = nonTransportNextDay.length > 0
          ? nonTransportNextDay[0]
          : nextDayLocs[0];
        
        // Calculate distance
        const distance = calculateDistance(lastOfCurrentDay.coordinates, firstOfNextDay.coordinates);
        console.log(`Cross-day distance: ${lastOfCurrentDay.name} → ${firstOfNextDay.name} = ${Math.round(distance/1000)}km`);
        
        // For cross-day routes, we ALWAYS create a connection (even for long distances)
        // For very long distances, use a direct line instead of road routing
        let route: RouteInfo | null = null;
        
        if (distance <= MAX_LAND_ROUTE_DISTANCE) {
          if (newLandRoutes.length > 0) {
            await new Promise(r => setTimeout(r, 300));
          }
          route = await fetchRoute(lastOfCurrentDay.coordinates, firstOfNextDay.coordinates);
        } else {
          // Long distance - create a direct line route
          console.log(`Using direct line for long cross-day route (${Math.round(distance/1000)}km)`);
          route = {
            coordinates: [
              [lastOfCurrentDay.coordinates.lng, lastOfCurrentDay.coordinates.lat],
              [firstOfNextDay.coordinates.lng, firstOfNextDay.coordinates.lat],
            ],
            duration: Math.round((distance / 1000) / 80 * 3600), // Estimate at 80km/h
            distance: distance,
          };
        }
        
        if (route) {
          route.fromLocationId = lastOfCurrentDay.id;
          route.toLocationId = firstOfNextDay.id;
          route.isCrossDay = true;
          route.isOvernight = true;
          route.fromDay = currentDay;
          route.toDay = nextDay;
          route.startLocationName = lastOfCurrentDay.name;
          route.endLocationName = firstOfNextDay.name;
          newLandRoutes.push(route);
          console.log(`✓ Created cross-day route: Day ${currentDay} → Day ${nextDay} (${lastOfCurrentDay.name} → ${firstOfNextDay.name})`);
        }
      } else {
        console.log(`⚠ Skipping cross-day route: Day ${currentDay} → Day ${nextDay} (no locations)`);
      }
    }
    
    console.log(`Calculated ${newLandRoutes.length} land routes (${newLandRoutes.filter(r => r.isCrossDay).length} cross-day)`);
    
    // Extract overnight route information for accommodation suggestions
    const overnight: OvernightRoute[] = newLandRoutes
      .filter(r => r.isCrossDay || r.isOvernight)
      .map(r => ({
        fromDay: r.fromDay || 1,
        toDay: r.toDay || 2,
        fromLocation: r.startLocationName || '',
        toLocation: r.endLocationName || '',
        distance: r.distance,
        duration: r.duration,
      }));
    
    setOvernightRoutes(overnight);
    
    // Update routes: preserve existing flight routes, replace land routes
    setRoutes(prevRoutes => {
      const existingFlightRoutes = prevRoutes.filter(r => r.isFlight);
      return [...existingFlightRoutes, ...newLandRoutes];
    });
  }, [fetchRoute, flights]);

  // Auto-save the active trip whenever its data changes (debounced).
  useEffect(() => {
    if (!activeTripId || locations.length === 0) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      persistCurrentTrip(activeTripId, activeTripName, {
        locations,
        routes,
        flights,
        trains,
        days,
      });
    }, 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [activeTripId, activeTripName, locations, routes, flights, trains, days, persistCurrentTrip]);

  // Auto-recalculate routes whenever locations change (debounced to avoid rapid-fire calls)
  const routeRecalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLocationsRef = useRef<TripLocation[]>([]);

  useEffect(() => {
    const prevIds = prevLocationsRef.current.map(l => `${l.id}:${l.day}:${l.coordinates.lat}:${l.coordinates.lng}`).join(",");
    const currIds = locations.map(l => `${l.id}:${l.day}:${l.coordinates.lat}:${l.coordinates.lng}`).join(",");

    if (prevIds === currIds) return;

    const prevCount = prevLocationsRef.current.length;
    prevLocationsRef.current = locations;

    // If locations were removed, immediately clear stale land routes
    if (locations.length < prevCount) {
      setRoutes(prev => prev.filter(r => r.isFlight));
    }

    if (routeRecalcTimer.current) clearTimeout(routeRecalcTimer.current);
    routeRecalcTimer.current = setTimeout(() => {
      calculateRoutes(locations);
    }, 400);

    return () => {
      if (routeRecalcTimer.current) clearTimeout(routeRecalcTimer.current);
    };
  }, [locations, calculateRoutes]);

  // Auto-sync visibleDays whenever locations or days change
  useEffect(() => {
    const locationDays = new Set(locations.map(l => l.day || 1));
    const allDays = new Set([...days, ...locationDays]);

    setVisibleDays(prev => {
      const missing = [...allDays].filter(d => !prev.has(d));
      if (missing.length === 0) return prev;
      return new Set([...prev, ...missing]);
    });
  }, [locations, days]);

  // Fetch AI-powered accommodation suggestions for overnight routes
  const fetchAccommodationSuggestions = useCallback(async (overnightRoute: OvernightRoute) => {
    const key = `${overnightRoute.fromDay}-${overnightRoute.toDay}`;
    
    // Don't fetch if already loading or already have suggestions
    if (loadingAccommodations.has(key) || accommodationSuggestions.has(key)) {
      return;
    }
    
    // Don't fetch if we don't have location names
    if (!overnightRoute.fromLocation || !overnightRoute.toLocation) {
      console.log('Skipping accommodation fetch: missing location names');
      return;
    }
    
    setLoadingAccommodations(prev => new Set([...prev, key]));
    
    try {
      const response = await fetch('/api/gemini-hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastStopName: overnightRoute.fromLocation,
          firstStopName: overnightRoute.toLocation,
          distance: overnightRoute.distance,
          fromDay: overnightRoute.fromDay,
          toDay: overnightRoute.toDay,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }

      const data = await response.json();
      if (data.accommodations) {
        setAccommodationSuggestions(prev => {
          const newMap = new Map(prev);
          newMap.set(key, data.accommodations);
          return newMap;
        });
      }
    } catch (error) {
      console.error('Accommodation search error:', error);
    } finally {
      setLoadingAccommodations(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  }, [accommodationSuggestions, loadingAccommodations]);

  // Add a location from geocode result
  const handleLocationSelect = useCallback(async (result: GeocodeResult) => {
    if (!activeTripId) {
      const newId = `trip-${Date.now()}`;
      setActiveTripId(newId);
      setActiveTripName("Untitled trip");
      persistActiveTripId(newId);
    }
    const currentMaxDay = Math.max(...days, 1);
    const newLocation: TripLocation = {
      id: generateId(),
      name: result.name,
      coordinates: { lat: result.lat, lng: result.lng },
      type: "custom",
      day: currentMaxDay,
      order: locations.length,
    };
    
    const newLocations = [...locations, newLocation];
    setLocations(newLocations);
    setSelectedLocationId(newLocation.id);
    await calculateRoutes(newLocations);
  }, [locations, days, calculateRoutes, activeTripId]);

  // AI-powered search using Gemini
  const handleAISearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setAiMessage(null);
    setSuggestions([]);

    try {
      const context = locations.length > 0
        ? `Current stops: ${locations.map(l => l.name.split(",")[0]).join(", ")}`
        : undefined;

      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response");
      }

      const data: GeminiResponse = await response.json();
      
      if (data.message) {
        setAiMessage(data.message);
      }
      
      if (data.suggestions) {
        setSuggestions(data.suggestions);
      }

      if (data.locations && data.locations.length > 0) {
        const newLocations: TripLocation[] = data.locations.map((loc, index) => ({
          id: generateId(),
          name: loc.name,
          description: loc.description,
          address: loc.address,
          coordinates: loc.coordinates,
          type: loc.type as TripLocation["type"],
          day: loc.day || 1,
          order: locations.length + index,
        }));

        // Update days array to include all days from the new locations
        const newDays = [...new Set([...days, ...newLocations.map(l => l.day || 1)])].sort((a, b) => a - b);
        setDays(newDays);
        // Also make new days visible
        setVisibleDays(prev => new Set([...prev, ...newLocations.map(l => l.day || 1)]));

        const allLocations = [...locations, ...newLocations];
        setLocations(allLocations);
        
        if (newLocations.length > 0) {
          setSelectedLocationId(newLocations[0].id);
        }
        
        await calculateRoutes(allLocations);
      }
    } catch (error) {
      console.error("AI search error:", error);
      setAiMessage("Sorry, I couldn't process your request. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [locations, days, calculateRoutes]);

  // Add location to a specific day using AI
  const handleAddLocationToDay = useCallback(async (query: string, targetDay: number) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query: `Find this location: ${query}. Return only this single location.`,
          context: `Adding to Day ${targetDay} of trip`
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response");
      }

      const data: GeminiResponse = await response.json();

      if (data.locations && data.locations.length > 0) {
        // Take only the first location and assign it to the target day
        const loc = data.locations[0];
        const newLocation: TripLocation = {
          id: generateId(),
          name: loc.name,
          description: loc.description,
          address: loc.address,
          coordinates: loc.coordinates,
          type: loc.type as TripLocation["type"],
          day: targetDay,
          order: locations.filter(l => l.day === targetDay).length,
        };

        const allLocations = [...locations, newLocation];
        // Sort by day
        allLocations.sort((a, b) => (a.day || 1) - (b.day || 1));
        setLocations(allLocations);
        setSelectedLocationId(newLocation.id);
        await calculateRoutes(allLocations);
      }
    } catch (error) {
      console.error("Add location error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [locations, calculateRoutes]);

  // Insert location at a specific position (before/after a given location)
  const handleInsertLocationToDay = useCallback(async (query: string, targetDay: number, afterLocationId: string | null) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `Find this location: ${query}. Return only this single location.`,
          context: `Adding to Day ${targetDay} of trip`
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response");
      }

      const data: GeminiResponse = await response.json();

      if (data.locations && data.locations.length > 0) {
        const loc = data.locations[0];
        const newLocation: TripLocation = {
          id: generateId(),
          name: loc.name,
          description: loc.description,
          address: loc.address,
          coordinates: loc.coordinates,
          type: loc.type as TripLocation["type"],
          day: targetDay,
          order: 0,
        };

        const allLocations = [...locations];

        if (afterLocationId === null) {
          // Insert at the very beginning of the day
          const firstOfDay = allLocations.findIndex(l => (l.day || 1) === targetDay);
          if (firstOfDay >= 0) {
            allLocations.splice(firstOfDay, 0, newLocation);
          } else {
            allLocations.push(newLocation);
          }
        } else {
          // Insert after the specified location
          const afterIndex = allLocations.findIndex(l => l.id === afterLocationId);
          if (afterIndex >= 0) {
            allLocations.splice(afterIndex + 1, 0, newLocation);
          } else {
            allLocations.push(newLocation);
          }
        }

        // Re-assign order values
        const updatedLocations = allLocations.map((loc, idx) => ({
          ...loc,
          order: idx,
        }));

        setLocations(updatedLocations);
        setSelectedLocationId(newLocation.id);
        await calculateRoutes(updatedLocations);
      }
    } catch (error) {
      console.error("Insert location error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [locations, calculateRoutes]);

  // Remove a location
  const handleLocationRemove = useCallback(async (id: string) => {
    const newLocations = locations.filter(l => l.id !== id);
    setLocations(newLocations);
    if (selectedLocationId === id) {
      setSelectedLocationId(null);
    }
    // Immediately clear land routes so stale lines disappear before async recalculation
    setRoutes(prev => prev.filter(r => r.isFlight));
    await calculateRoutes(newLocations);
  }, [locations, selectedLocationId, calculateRoutes]);

  // Reorder locations
  const handleReorder = useCallback(async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    const newLocations = [...locations];
    const [removed] = newLocations.splice(fromIndex, 1);
    newLocations.splice(toIndex, 0, removed);
    
    // Update order values to reflect new positions
    const updatedLocations = newLocations.map((loc, idx) => ({
      ...loc,
      order: idx,
    }));
    
    setLocations(updatedLocations);
    await calculateRoutes(updatedLocations);
  }, [locations, calculateRoutes]);

  // Change location day
  const handleDayChange = useCallback(async (locationId: string, newDay: number) => {
    const location = locations.find(l => l.id === locationId);
    if (!location || location.day === newDay) return;
    
    const newLocations = locations.map(loc => 
      loc.id === locationId ? { ...loc, day: newDay } : loc
    );
    
    // Sort by day, then by original order within day
    newLocations.sort((a, b) => {
      if ((a.day || 1) !== (b.day || 1)) {
        return (a.day || 1) - (b.day || 1);
      }
      return (a.order || 0) - (b.order || 0);
    });
    
    // Update order values to reflect new positions
    const updatedLocations = newLocations.map((loc, idx) => ({
      ...loc,
      order: idx,
    }));
    
    setLocations(updatedLocations);
    await calculateRoutes(updatedLocations);
  }, [locations, calculateRoutes]);

  // Optimize route order using nearest-neighbor TSP per day, then optionally Gemini AI
  const handleOptimizeRoutes = useCallback(async () => {
    if (locations.length < 3) {
      setAiMessage("Need at least 3 stops to optimize.");
      return;
    }

    setIsOptimizing(true);
    setAiMessage(null);

    try {
      // Group locations by day (exclude airports/stations as they're fixed by flights/trains)
      const locsByDay = new Map<number, TripLocation[]>();
      const fixedLocs: TripLocation[] = [];

      for (const loc of locations) {
        if (loc.type === "airport" || loc.type === "station") {
          fixedLocs.push(loc);
          continue;
        }
        const day = loc.day || 1;
        if (!locsByDay.has(day)) locsByDay.set(day, []);
        locsByDay.get(day)!.push(loc);
      }

      let totalSaved = 0;
      const optimizedAll: TripLocation[] = [...fixedLocs];

      for (const [day, dayLocs] of locsByDay) {
        if (dayLocs.length < 3) {
          optimizedAll.push(...dayLocs);
          continue;
        }

        // Calculate original total distance for this day
        let originalDist = 0;
        for (let i = 0; i < dayLocs.length - 1; i++) {
          originalDist += calculateDistance(dayLocs[i].coordinates, dayLocs[i + 1].coordinates);
        }

        // Try Gemini-based optimization
        let optimizedOrder: TripLocation[] | null = null;
        try {
          const res = await fetch("/api/optimize-route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locations: dayLocs.map(l => ({
                id: l.id,
                name: l.name,
                lat: l.coordinates.lat,
                lng: l.coordinates.lng,
                type: l.type,
              })),
              day,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.order && Array.isArray(data.order)) {
              const idToLoc = new Map(dayLocs.map(l => [l.id, l]));
              const aiOrder = data.order
                .map((id: string) => idToLoc.get(id))
                .filter(Boolean) as TripLocation[];
              if (aiOrder.length === dayLocs.length) {
                optimizedOrder = aiOrder;
              }
            }
          }
        } catch {
          // Gemini failed, fall through to nearest-neighbor
        }

        // Fallback: nearest-neighbor TSP
        if (!optimizedOrder) {
          const remaining = [...dayLocs];
          const ordered: TripLocation[] = [remaining.shift()!];
          while (remaining.length > 0) {
            const last = ordered[ordered.length - 1];
            let nearestIdx = 0;
            let nearestDist = Infinity;
            for (let j = 0; j < remaining.length; j++) {
              const d = calculateDistance(last.coordinates, remaining[j].coordinates);
              if (d < nearestDist) {
                nearestDist = d;
                nearestIdx = j;
              }
            }
            ordered.push(remaining.splice(nearestIdx, 1)[0]);
          }
          optimizedOrder = ordered;
        }

        // Calculate optimized distance
        let optimizedDist = 0;
        for (let i = 0; i < optimizedOrder.length - 1; i++) {
          optimizedDist += calculateDistance(optimizedOrder[i].coordinates, optimizedOrder[i + 1].coordinates);
        }

        totalSaved += Math.max(0, originalDist - optimizedDist);
        optimizedAll.push(...optimizedOrder);
      }

      // Sort by day, then assign new order indices
      optimizedAll.sort((a, b) => (a.day || 1) - (b.day || 1));
      const reordered = optimizedAll.map((loc, idx) => ({ ...loc, order: idx }));

      // Clear stale routes and apply
      setRoutes(prev => prev.filter(r => r.isFlight));
      setLocations(reordered);
      await calculateRoutes(reordered);

      const savedKm = (totalSaved / 1000).toFixed(1);
      setAiMessage(
        totalSaved > 100
          ? `Route optimized! Estimated ${savedKm} km saved by reordering stops.`
          : "Route order has been optimized for shortest travel distance."
      );
    } catch (err) {
      console.error("Optimize error:", err);
      setAiMessage("Optimization failed. Please try again.");
    } finally {
      setIsOptimizing(false);
    }
  }, [locations, calculateRoutes]);

  // Add a new day - find the first missing day number
  const handleAddDay = useCallback(() => {
    // Find the first missing day number (e.g., if days are [1, 8], add 2)
    const sortedDays = [...days].sort((a, b) => a - b);
    let newDay = 1;
    
    for (let i = 0; i < sortedDays.length; i++) {
      if (sortedDays[i] > newDay) {
        break; // Found a gap
      }
      newDay = sortedDays[i] + 1;
    }
    
    setDays([...days, newDay].sort((a, b) => a - b));
    setVisibleDays(prev => new Set([...prev, newDay]));
  }, [days]);

  // Add a new day after a specific day
  const handleAddDayAfter = useCallback((afterDay: number) => {
    const newDay = afterDay + 1;
    // Check if newDay already exists
    if (days.includes(newDay)) {
      // Shift all days >= newDay up by 1
      const shiftedDays = days.map(d => d >= newDay ? d + 1 : d);
      setDays([...shiftedDays, newDay].sort((a, b) => a - b));
      // Update locations
      setLocations(prev => prev.map(loc => ({
        ...loc,
        day: (loc.day || 1) >= newDay ? (loc.day || 1) + 1 : (loc.day || 1)
      })));
      // Update flights
      setFlights(prev => prev.map(f => ({
        ...f,
        day: (f.day || 1) >= newDay ? (f.day || 1) + 1 : (f.day || 1)
      })));
      // Update trains
      setTrains(prev => prev.map(t => ({
        ...t,
        day: (t.day || 1) >= newDay ? (t.day || 1) + 1 : (t.day || 1)
      })));
    } else {
      setDays([...days, newDay].sort((a, b) => a - b));
    }
    setVisibleDays(prev => new Set([...prev, newDay]));
  }, [days]);

  // Swap two days (move all content from one day to another)
  const handleSwapDays = useCallback(async (fromDay: number, toDay: number) => {
    // Swap the day assignments for all locations
    const newLocations = locations.map(loc => {
      if ((loc.day || 1) === fromDay) {
        return { ...loc, day: toDay };
      } else if ((loc.day || 1) === toDay) {
        return { ...loc, day: fromDay };
      }
      return loc;
    });
    
    // Swap flights
    setFlights(prev => prev.map(f => {
      if ((f.day || 1) === fromDay) {
        return { ...f, day: toDay };
      } else if ((f.day || 1) === toDay) {
        return { ...f, day: fromDay };
      }
      return f;
    }));

    // Swap trains
    setTrains(prev => prev.map(t => {
      if ((t.day || 1) === fromDay) {
        return { ...t, day: toDay };
      } else if ((t.day || 1) === toDay) {
        return { ...t, day: fromDay };
      }
      return t;
    }));

    // Sort locations by day
    newLocations.sort((a, b) => (a.day || 1) - (b.day || 1));
    setLocations(newLocations);
    await calculateRoutes(newLocations);
  }, [locations, calculateRoutes]);

  // Handle data extracted from document upload (locations, flights, trains)
  const handleDocumentExtracted = useCallback(async (data: {
    locations: Array<{
      name: string;
      description?: string;
      address?: string;
      coordinates: { lat: number; lng: number };
      type: string;
      day?: number;
      order?: number; // Order from crew output
    }>;
    flights?: Array<{
      flightNumber: string;
      airline?: string;
      departureAirport?: string;
      departureCode: string;
      arrivalAirport?: string;
      arrivalCode: string;
      departureTime?: string;
      arrivalTime?: string;
      day?: number;
    }>;
    trains?: Array<{
      trainNumber: string;
      trainType?: "high-speed" | "normal" | "metro" | "other";
      operator?: string;
      departureStation: string;
      arrivalStation: string;
      departureTime?: string;
      arrivalTime?: string;
      day?: number;
    }>;
    message?: string;
    estimatedDays?: number;
  }) => {
    // Each document upload starts a fresh trip — never merge into the current one.
    const newTripId = `trip-${Date.now()}`;
    const extractedFlights: FlightInfo[] = [];
    const extractedTrains: TrainInfo[] = [];
    const extractedFlightRoutes: RouteInfo[] = [];
    const extractedTrainRoutes: RouteInfo[] = [];

    const allDays: number[] = [];
    let allNewLocations: TripLocation[] = [];
    
    // Process locations - filter out those without valid coordinates
    if (data.locations && data.locations.length > 0) {
      const validDataLocations = data.locations.filter(loc => 
        loc.coordinates && 
        typeof loc.coordinates.lat === 'number' && 
        typeof loc.coordinates.lng === 'number' &&
        !isNaN(loc.coordinates.lat) && 
        !isNaN(loc.coordinates.lng) &&
        loc.coordinates.lat !== 0 && 
        loc.coordinates.lng !== 0
      );
      
      // Sort by day, then by order (from crew output) to preserve sequence
      const sortedLocations = [...validDataLocations].sort((a, b) => {
        const dayA = a.day || 1;
        const dayB = b.day || 1;
        if (dayA !== dayB) return dayA - dayB;
        // Use order from crew output, fallback to original array index
        const orderA = a.order ?? Infinity;
        const orderB = b.order ?? Infinity;
        return orderA - orderB;
      });
      
      // Assign sequential order numbers within each day
      const orderByDay = new Map<number, number>();
      const newLocations: TripLocation[] = sortedLocations.map((loc) => {
        const day = loc.day || 1;
        const currentOrder = orderByDay.get(day) ?? 0;
        orderByDay.set(day, currentOrder + 1);
        
        return {
          id: generateId(),
          name: loc.name,
          description: loc.description,
          address: loc.address,
          coordinates: loc.coordinates,
          type: loc.type as TripLocation["type"],
          day: day,
          order: currentOrder,
        };
      });
      
      allNewLocations = [...allNewLocations, ...newLocations];
      allDays.push(...newLocations.map(l => l.day || 1));
      
      console.log(`Processed ${newLocations.length} locations from document:`, 
        newLocations.map(l => ({ name: l.name.substring(0, 30), day: l.day, order: l.order })));
      
      // Log if any locations were filtered out
      const filteredCount = data.locations.length - validDataLocations.length;
      if (filteredCount > 0) {
        console.warn(`${filteredCount} location(s) filtered out due to invalid coordinates`);
      }
    }

    // Process extracted flights
    if (data.flights && data.flights.length > 0) {
      for (const flight of data.flights) {
        // Use pre-resolved coordinates from pipeline if available
        const flightAny = flight as Record<string, unknown>;
        let depCoords = (flightAny.departureCoordinates as { lat: number; lng: number }) || { lat: 0, lng: 0 };
        let arrCoords = (flightAny.arrivalCoordinates as { lat: number; lng: number }) || { lat: 0, lng: 0 };

        // Only fetch from API if coordinates weren't pre-resolved
        if (depCoords.lat === 0 || arrCoords.lat === 0) {
          try {
            if (depCoords.lat === 0) {
              const depResponse = await fetch(`/api/airport?code=${flight.departureCode}`);
              if (depResponse.ok) {
                const depData = await depResponse.json();
                depCoords = { lat: depData.lat, lng: depData.lon || depData.lng };
              }
            }
            if (arrCoords.lat === 0) {
              const arrResponse = await fetch(`/api/airport?code=${flight.arrivalCode}`);
              if (arrResponse.ok) {
                const arrData = await arrResponse.json();
                arrCoords = { lat: arrData.lat, lng: arrData.lon || arrData.lng };
              }
            }
          } catch (e) {
            console.error("Failed to fetch airport coordinates:", e);
          }
        }

        // Only add if we have valid coordinates
        if (depCoords.lat !== 0 && arrCoords.lat !== 0) {
          const flightDay = flight.day || 1;
          allDays.push(flightDay);

          const flightInfo: FlightInfo = {
            id: `flight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            flightNumber: flight.flightNumber,
            airline: flight.airline || extractAirlineFromNumber(flight.flightNumber),
            departure: {
              airport: flight.departureAirport || `${flight.departureCode} Airport`,
              iata: flight.departureCode,
              city: "",
              coordinates: depCoords,
              scheduledTime: flight.departureTime,
            },
            arrival: {
              airport: flight.arrivalAirport || `${flight.arrivalCode} Airport`,
              iata: flight.arrivalCode,
              city: "",
              coordinates: arrCoords,
              scheduledTime: flight.arrivalTime,
            },
            status: "Extracted",
            day: flightDay,
          };

          // Collect flight (replaces any previous trip data)
          extractedFlights.push(flightInfo);

          // Add departure and arrival as locations
          const depLocation: TripLocation = {
            id: `${flightInfo.id}-dep`,
            name: `${flightInfo.departure.airport} (${flight.departureCode})`,
            description: `Flight ${flight.flightNumber} departure`,
            coordinates: depCoords,
            type: "airport",
            day: flightDay,
            order: allNewLocations.length,
          };

          const arrLocation: TripLocation = {
            id: `${flightInfo.id}-arr`,
            name: `${flightInfo.arrival.airport} (${flight.arrivalCode})`,
            description: `Flight ${flight.flightNumber} arrival`,
            coordinates: arrCoords,
            type: "airport",
            day: flightDay,
            order: allNewLocations.length + 1,
          };

          allNewLocations = [...allNewLocations, depLocation, arrLocation];

          // Add flight route
          const flightRoute: RouteInfo = {
            coordinates: [
              [depCoords.lng, depCoords.lat],
              [arrCoords.lng, arrCoords.lat],
            ],
            duration: 0,
            distance: calculateFlightDistance(depCoords, arrCoords),
            isFlight: true,
          };
          extractedFlightRoutes.push(flightRoute);
        }
      }
    }

    // Process extracted trains
    if (data.trains && data.trains.length > 0) {
      for (const train of data.trains) {
        // Look up station coordinates via geocoding
        let depCoords = { lat: 0, lng: 0 };
        let arrCoords = { lat: 0, lng: 0 };
        
        try {
          // Geocode departure station
          const depResponse = await fetch(`/api/geocode?q=${encodeURIComponent(train.departureStation + " station")}`);
          if (depResponse.ok) {
            const depData = await depResponse.json();
            if (depData.results && depData.results.length > 0) {
              depCoords = { lat: depData.results[0].lat, lng: depData.results[0].lng };
            }
          }
          
          // Geocode arrival station
          const arrResponse = await fetch(`/api/geocode?q=${encodeURIComponent(train.arrivalStation + " station")}`);
          if (arrResponse.ok) {
            const arrData = await arrResponse.json();
            if (arrData.results && arrData.results.length > 0) {
              arrCoords = { lat: arrData.results[0].lat, lng: arrData.results[0].lng };
            }
          }
        } catch (e) {
          console.error("Failed to geocode stations:", e);
        }

        // Only add if we have valid coordinates
        if (depCoords.lat !== 0 && arrCoords.lat !== 0) {
          const trainDay = train.day || 1;
          allDays.push(trainDay);

          const trainInfo: TrainInfo = {
            id: `train-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            trainNumber: train.trainNumber,
            trainType: train.trainType || "normal",
            operator: train.operator,
            departure: {
              station: train.departureStation,
              city: "",
              coordinates: depCoords,
              time: train.departureTime,
            },
            arrival: {
              station: train.arrivalStation,
              city: "",
              coordinates: arrCoords,
              time: train.arrivalTime,
            },
            day: trainDay,
          };

          extractedTrains.push(trainInfo);

          // Add departure and arrival as locations
          const depLocation: TripLocation = {
            id: `${trainInfo.id}-dep`,
            name: train.departureStation,
            description: `Train ${train.trainNumber} departure`,
            coordinates: depCoords,
            type: "station",
            day: trainDay,
            order: allNewLocations.length,
          };

          const arrLocation: TripLocation = {
            id: `${trainInfo.id}-arr`,
            name: train.arrivalStation,
            description: `Train ${train.trainNumber} arrival`,
            coordinates: arrCoords,
            type: "station",
            day: trainDay,
            order: allNewLocations.length + 1,
          };

          allNewLocations = [...allNewLocations, depLocation, arrLocation];

          // Calculate train route
          const trainRoute = await fetchRoute(depCoords, arrCoords);
          if (trainRoute) {
            extractedTrainRoutes.push(trainRoute);
          }
        }
      }
    }

    // Apply extracted data as a brand-new trip (no merge with previous workspace).
    if (allNewLocations.length > 0) {
      const normalizedLocations = normalizeLocationOrders(allNewLocations);
      const newDays = [...new Set(allDays.length > 0 ? allDays : [1])].sort((a, b) => a - b);
      const tripLabel = data.message?.slice(0, 60) || `Uploaded trip ${new Date().toLocaleDateString()}`;

      setActiveTripId(newTripId);
      setActiveTripName(tripLabel);
      setTripName(tripLabel);
      persistActiveTripId(newTripId);

      setDays(newDays);
      setVisibleDays(new Set(newDays));
      setFlights(extractedFlights);
      setTrains(extractedTrains);
      setRoutes([...extractedFlightRoutes, ...extractedTrainRoutes]);
      setLocations(normalizedLocations);
      setSelectedLocationId(normalizedLocations[0].id);

      await calculateRoutes(normalizedLocations, extractedFlights);

      persistCurrentTrip(newTripId, tripLabel, {
        locations: normalizedLocations,
        routes: [...extractedFlightRoutes, ...extractedTrainRoutes],
        flights: extractedFlights,
        trains: extractedTrains,
        days: newDays,
      });
    }

    // Show AI message if provided
    if (data.message) {
      setAiMessage(data.message);
    }
  }, [calculateRoutes, fetchRoute, persistCurrentTrip]);

  // Helper to extract airline from flight number
  const extractAirlineFromNumber = (fn: string): string => {
    const codes: Record<string, string> = {
      "CZ": "China Southern", "MU": "China Eastern", "CA": "Air China",
      "TG": "Thai Airways", "FD": "Thai AirAsia", "SL": "Thai Lion Air",
      "SQ": "Singapore Airlines", "CX": "Cathay Pacific",
      "JL": "Japan Airlines", "NH": "ANA", "KE": "Korean Air",
      "VN": "Vietnam Airlines", "QR": "Qatar Airways", "EK": "Emirates",
      "LH": "Lufthansa", "BA": "British Airways", "AF": "Air France",
      "AA": "American Airlines", "UA": "United", "DL": "Delta",
    };
    const code = fn.substring(0, 2).toUpperCase();
    return codes[code] || `${code} Airlines`;
  };

  // Remove a day and all its content
  const handleRemoveDay = useCallback(async (dayToRemove: number) => {
    // Remove locations for this day
    const newLocations = locations.filter(l => (l.day || 1) !== dayToRemove);

    // Remove flights for this day
    setFlights(prev => prev.filter(f => (f.day || 1) !== dayToRemove));

    // Remove trains for this day
    setTrains(prev => prev.filter(t => (t.day || 1) !== dayToRemove));

    // Immediately clear all routes so stale lines disappear
    setRoutes([]);

    setLocations(newLocations);
    
    const newDays = days.filter(d => d !== dayToRemove);
    if (newDays.length === 0) {
      setDays([1]);
      setVisibleDays(new Set([1]));
    } else {
      setDays(newDays);
      setVisibleDays(prev => {
        const newVisible = new Set(prev);
        newVisible.delete(dayToRemove);
        if (newVisible.size === 0) {
          return new Set(newDays);
        }
        return newVisible;
      });
    }
    
    await calculateRoutes(newLocations);
  }, [days, locations, flights, calculateRoutes]);

  // Add a flight
  const handleFlightAdd = useCallback(async (flight: FlightInfo) => {
    // Add departure and arrival airports as locations
    const departureLocation: TripLocation = {
      id: `${flight.id}-dep`,
      name: `${flight.departure.airport} (${flight.departure.iata})`,
      description: `Departure: ${flight.flightNumber} - ${flight.airline}`,
      coordinates: flight.departure.coordinates,
      type: "airport",
      day: flight.day || Math.max(...days, 1),
      order: locations.length,
    };

    const arrivalLocation: TripLocation = {
      id: `${flight.id}-arr`,
      name: `${flight.arrival.airport} (${flight.arrival.iata})`,
      description: `Arrival: ${flight.flightNumber} - ${flight.airline}`,
      coordinates: flight.arrival.coordinates,
      type: "airport",
      day: flight.day || Math.max(...days, 1),
      order: locations.length + 1,
    };

    const newLocations = [...locations, departureLocation, arrivalLocation];
    
    // Create flight route (will be rendered as curved line)
    const flightRoute: RouteInfo = {
      coordinates: [
        [flight.departure.coordinates.lng, flight.departure.coordinates.lat],
        [flight.arrival.coordinates.lng, flight.arrival.coordinates.lat],
      ],
      duration: flight.duration || 0,
      distance: calculateFlightDistance(
        flight.departure.coordinates,
        flight.arrival.coordinates
      ),
      isFlight: true,
    };

    // Update state
    setFlights(prev => [...prev, flight]);
    setLocations(newLocations);
    
    // Set routes directly - only the flight route for now (no land route between airports)
    setRoutes(prev => {
      const existingFlightRoutes = prev.filter(r => r.isFlight);
      return [...existingFlightRoutes, flightRoute];
    });
    
    setSelectedLocationId(departureLocation.id);
  }, [locations, days]);

  // Remove a flight
  const handleFlightRemove = useCallback((flightId: string) => {
    setFlights(prev => prev.filter(f => f.id !== flightId));
    // Remove associated locations
    setLocations(prev => prev.filter(l => !l.id.startsWith(flightId)));
    // Remove the flight route (we need to recalculate which routes to keep)
    setRoutes(prev => {
      // Keep only non-flight routes or flight routes for remaining flights
      const remainingFlightIds = flights.filter(f => f.id !== flightId).map(f => f.id);
      return prev.filter(r => {
        if (!r.isFlight) return true;
        // This is a simplification - ideally we'd track which route belongs to which flight
        return remainingFlightIds.length > 0;
      });
    });
  }, [flights]);

  // Edit a flight
  const handleFlightEdit = useCallback(async (updatedFlight: FlightInfo) => {
    // Remove old flight data
    const oldFlight = flights.find(f => f.id === updatedFlight.id);
    if (!oldFlight) return;

    // Update flights array
    setFlights(prev => prev.map(f => f.id === updatedFlight.id ? updatedFlight : f));

    // Update associated locations
    setLocations(prev => {
      const filtered = prev.filter(l => !l.id.startsWith(updatedFlight.id));
      
      const departureLocation: TripLocation = {
        id: `${updatedFlight.id}-dep`,
        name: `${updatedFlight.departure.airport} (${updatedFlight.departure.iata})`,
        description: `Departure: ${updatedFlight.flightNumber} - ${updatedFlight.airline}`,
        coordinates: updatedFlight.departure.coordinates,
        type: "airport",
        day: updatedFlight.day || Math.max(...days, 1),
        order: filtered.length,
      };

      const arrivalLocation: TripLocation = {
        id: `${updatedFlight.id}-arr`,
        name: `${updatedFlight.arrival.airport} (${updatedFlight.arrival.iata})`,
        description: `Arrival: ${updatedFlight.flightNumber} - ${updatedFlight.airline}`,
        coordinates: updatedFlight.arrival.coordinates,
        type: "airport",
        day: updatedFlight.day || Math.max(...days, 1),
        order: filtered.length + 1,
      };

      return [...filtered, departureLocation, arrivalLocation];
    });

    // Update flight route
    const flightRoute: RouteInfo = {
      coordinates: [
        [updatedFlight.departure.coordinates.lng, updatedFlight.departure.coordinates.lat],
        [updatedFlight.arrival.coordinates.lng, updatedFlight.arrival.coordinates.lat],
      ],
      duration: updatedFlight.duration || 0,
      distance: calculateFlightDistance(
        updatedFlight.departure.coordinates,
        updatedFlight.arrival.coordinates
      ),
      isFlight: true,
    };

    setRoutes(prev => {
      // Replace the flight route (simplified - assumes one flight route)
      const nonFlightRoutes = prev.filter(r => !r.isFlight);
      return [...nonFlightRoutes, flightRoute];
    });

    setEditingFlight(null);
  }, [flights, days]);

  // Open flight edit modal
  const handleOpenFlightEdit = useCallback((flight: FlightInfo) => {
    setEditingFlight(flight);
    setShowFlightModal(true);
  }, []);

  // Add a train
  const handleTrainAdd = useCallback(async (train: TrainInfo) => {
    setTrains(prev => [...prev, train]);
    
    // Add departure and arrival stations as locations
    const departureLocation: TripLocation = {
      id: `${train.id}-dep`,
      name: train.departure.station,
      description: `Departure: ${train.trainNumber} - ${train.operator || "Railway"}`,
      coordinates: train.departure.coordinates,
      type: "station",
      day: train.day || Math.max(...days, 1),
      order: locations.length,
    };

    const arrivalLocation: TripLocation = {
      id: `${train.id}-arr`,
      name: train.arrival.station,
      description: `Arrival: ${train.trainNumber} - ${train.operator || "Railway"}`,
      coordinates: train.arrival.coordinates,
      type: "station",
      day: train.day || Math.max(...days, 1),
      order: locations.length + 1,
    };

    const newLocations = [...locations, departureLocation, arrivalLocation];
    setLocations(newLocations);
    
    // Calculate route between stations (using OSRM for ground transportation)
    const trainRoute = await fetchRoute(
      train.departure.coordinates,
      train.arrival.coordinates
    );
    
    if (trainRoute) {
      // Override duration if provided
      if (train.duration) {
        trainRoute.duration = train.duration;
      }
      setRoutes(prev => [...prev, trainRoute]);
    }
    
    setSelectedLocationId(departureLocation.id);
  }, [locations, days, fetchRoute]);

  // Calculate great circle distance for flights
  function calculateFlightDistance(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (from.lat * Math.PI) / 180;
    const φ2 = (to.lat * Math.PI) / 180;
    const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
    const Δλ = ((to.lng - from.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className={`flex-shrink-0 border-b border-border/30 bg-background/40 backdrop-blur-xl relative z-50 transition-all ${mapExpanded ? "hidden" : ""}`}>
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Plane className="size-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  Voyage AI
                </h1>
                <p className="text-[10px] text-muted-foreground">
                  {locations.length > 0 ? (
                    <>Current trip: <span className="text-foreground/80">{activeTripName}</span></>
                  ) : (
                    "AI-Powered Trip Planner"
                  )}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <div className="flex-1">
              <LocationSearch
                onLocationSelect={handleLocationSelect}
                onAISearch={handleAISearch}
                isLoading={isLoading}
                placeholder="Try: 'Plan a 3-day trip to Paris' or 'Road trip from LA to San Francisco'"
              />
            </div>
            <Button
              onClick={handleNewTrip}
              variant="outline"
              className="h-12 px-4 gap-2 border-indigo-500/30 hover:border-indigo-500/50 hover:bg-indigo-500/10"
              title="Start a new empty trip"
            >
              <FilePlus className="size-4" />
              <span className="hidden sm:inline">New Trip</span>
            </Button>
            <Button
              onClick={() => setShowUploadModal(true)}
              variant="outline"
              className="h-12 px-4 gap-2 border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-500/10"
              title="Upload itinerary document"
            >
              <Upload className="size-4" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
            <Button
              onClick={() => setShowFlightModal(true)}
              variant="outline"
              className="h-12 px-4 gap-2 border-sky-500/30 hover:border-sky-500/50 hover:bg-sky-500/10"
              title="Add flight"
            >
              <PlaneTakeoff className="size-4" />
              <span className="hidden sm:inline">Flight</span>
            </Button>
            <Button
              onClick={() => setShowTrainModal(true)}
              variant="outline"
              className="h-12 px-4 gap-2 border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10"
              title="Add train"
            >
              <Train className="size-4" />
              <span className="hidden sm:inline">Train</span>
            </Button>
            <Button
              onClick={handleOptimizeRoutes}
              variant="outline"
              className="h-12 px-4 gap-2 border-cyan-500/30 hover:border-cyan-500/50 hover:bg-cyan-500/10"
              title="Re-optimize route order to minimize travel distance"
              disabled={locations.length < 3 || isOptimizing}
            >
              <RotateCw className={`size-4 ${isOptimizing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{isOptimizing ? "Optimizing..." : "Optimize"}</span>
            </Button>
            <Button
              onClick={() => setShowExportModal(true)}
              variant="outline"
              className="h-12 px-4 gap-2 border-green-500/30 hover:border-green-500/50 hover:bg-green-500/10"
              title="Export itinerary"
              disabled={locations.length === 0}
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              onClick={handleSaveTrip}
              variant="outline"
              className="h-12 px-4 gap-2 border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/10"
              title="Save current trip"
              disabled={locations.length === 0}
            >
              <Save className="size-4" />
              <span className="hidden sm:inline">Save</span>
            </Button>
            <Button
              onClick={() => setShowSavedTrips(true)}
              variant="outline"
              className="h-12 px-4 gap-2 border-orange-500/30 hover:border-orange-500/50 hover:bg-orange-500/10 relative"
              title="Load saved trip"
            >
              <FolderOpen className="size-4" />
              <span className="hidden sm:inline">Load</span>
              {savedTrips.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-orange-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {savedTrips.length}
                </span>
              )}
            </Button>
          </div>

          {/* AI Message */}
          {aiMessage && (
            <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 relative">
              <button
                onClick={() => {
                  setAiMessage(null);
                  setSuggestions([]);
                }}
                className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/10 transition-colors group"
                aria-label="Close message"
              >
                <X className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
              <div className="flex items-start gap-2 pr-6">
                <div className="size-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="size-3.5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-foreground/90">{aiMessage}</p>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleAISearch(suggestion)}
                          className="px-2 py-1 text-[10px] rounded-full bg-background/50 hover:bg-background/80 border border-border/50 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Sidebar - Trip Stops */}
        <aside 
          className={`
            flex-shrink-0 border-r border-border/30 bg-background/20 backdrop-blur-sm
            transition-all duration-300 ease-in-out
            flex flex-col min-h-0
            ${sidebarCollapsed ? "w-0 overflow-hidden" : "w-[280px] sm:w-[300px] md:w-[340px]"}
            ${mapExpanded ? "hidden" : ""}
          `}
        >
          <div className="flex-1 min-h-0 overflow-hidden">
            <TripStopsList
              locations={locations}
              routes={routes}
              flights={flights}
              selectedLocationId={selectedLocationId}
              onLocationSelect={setSelectedLocationId}
              onLocationRemove={handleLocationRemove}
              onReorder={handleReorder}
              onDayChange={handleDayChange}
              onAddDay={handleAddDay}
              onAddDayAfter={handleAddDayAfter}
              onRemoveDay={handleRemoveDay}
              onSwapDays={handleSwapDays}
              onAddLocationToDay={handleAddLocationToDay}
              onInsertLocationToDay={handleInsertLocationToDay}
              onFlightEdit={handleOpenFlightEdit}
              onFlightRemove={handleFlightRemove}
              days={days}
              isSearching={isLoading}
              visibleDays={visibleDays}
              onVisibleDaysChange={setVisibleDays}
              visibleTypes={visibleTypes}
              onVisibleTypesChange={setVisibleTypes}
              overnightRoutes={overnightRoutes}
              accommodationSuggestions={accommodationSuggestions}
              loadingAccommodations={loadingAccommodations}
              onFetchAccommodations={fetchAccommodationSuggestions}
            />
          </div>
        </aside>

        {/* Sidebar Toggle Button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`
            absolute top-3 z-20 p-2 rounded-lg bg-background/90 backdrop-blur-sm 
            shadow-md border border-border/50 hover:bg-accent transition-all
            ${sidebarCollapsed ? "left-3" : "left-[292px] sm:left-[312px] md:left-[352px]"}
            ${mapExpanded ? "hidden" : ""}
          `}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>

        {/* Map view + fullscreen controls */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          {/* 2D / 3D Toggle */}
          <button
            onClick={() => {
              const next = mapMode === "2d" ? "3d" : "2d";
              if (next === "3d") setHas3DBeenOpened(true);
              setMapMode(next);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background/90 backdrop-blur-sm shadow-md border border-border/50 hover:bg-accent transition-all"
            title={mapMode === "2d" ? "Switch to 3D globe" : "Switch to 2D map"}
          >
            {mapMode === "2d" ? <Globe2 className="size-4" /> : <MapIcon className="size-4" />}
            <span className="text-xs font-medium">{mapMode === "2d" ? "3D" : "2D"}</span>
          </button>

          {/* Map Expand Button */}
          <button
            onClick={() => setMapExpanded(!mapExpanded)}
            className="p-2 rounded-lg bg-background/90 backdrop-blur-sm shadow-md border border-border/50 hover:bg-accent transition-all"
            title={mapExpanded ? "Exit fullscreen" : "Fullscreen map"}
          >
            {mapExpanded ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
        </div>

        {/* Map - both views stay mounted and are stacked; visibility is toggled via
            z-index/opacity so the 3D globe is never unmounted (avoids WebGL teardown crash). */}
        <main className={`flex-1 relative z-0 min-h-0 ${mapExpanded ? "absolute inset-0" : ""}`}>
          <div
            className={`absolute inset-0 ${mapMode === "2d" ? "z-10" : "z-0 opacity-0 pointer-events-none"}`}
          >
            <TripMap
              locations={locations}
              routes={routes}
              flights={flights}
              selectedLocationId={selectedLocationId}
              onLocationClick={setSelectedLocationId}
              visibleDays={visibleDays}
              visibleTypes={visibleTypes}
              days={days}
              onVisibleDaysChange={setVisibleDays}
            />
          </div>

          {has3DBeenOpened && (
            <div
              className={`absolute inset-0 ${mapMode === "3d" ? "z-10" : "z-0 opacity-0 pointer-events-none"}`}
            >
              <TripMap3DClient
                locations={locations}
                routes={routes}
                flights={flights}
                selectedLocationId={selectedLocationId}
                onLocationClick={setSelectedLocationId}
                visibleDays={visibleDays}
                visibleTypes={visibleTypes}
                days={days}
                onVisibleDaysChange={setVisibleDays}
              />
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className={`flex-shrink-0 border-t border-border/30 bg-background/40 backdrop-blur-xl py-2 px-4 ${mapExpanded ? "hidden" : ""}`}>
        <p className="text-center text-xs text-muted-foreground">
          This app made by <span className="font-medium text-foreground/80">Saksit Saelow</span>
        </p>
      </footer>

      {/* Document Upload Modal */}
      <DocumentUpload
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onDataExtracted={handleDocumentExtracted}
      />

      {/* Export Itinerary Modal */}
      <ExportItinerary
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        locations={locations}
        routes={routes}
        flights={flights}
        trains={trains}
        days={[...visibleDays].sort((a, b) => a - b)}
      />

      {/* Flight Input Modal */}
      <FlightInput
        isOpen={showFlightModal}
        onClose={() => {
          setShowFlightModal(false);
          setEditingFlight(null);
        }}
        onFlightAdd={handleFlightAdd}
        onFlightEdit={handleFlightEdit}
        editFlight={editingFlight}
        currentDay={Math.max(...days, 1)}
        totalDays={days.length}
      />

      {/* Train Input Modal */}
      <TrainInput
        isOpen={showTrainModal}
        onClose={() => setShowTrainModal(false)}
        onTrainAdd={handleTrainAdd}
        currentDay={Math.max(...days, 1)}
        totalDays={days.length}
      />

      {/* Saved Trips Modal */}
      {showSavedTrips && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSavedTrips(false)} />
          <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                  <FolderOpen className="size-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold">Saved Trips</h2>
                  <p className="text-xs text-muted-foreground">{savedTrips.length} trip{savedTrips.length !== 1 ? "s" : ""} saved</p>
                </div>
              </div>
              <button onClick={() => setShowSavedTrips(false)} className="p-2 rounded-lg hover:bg-accent transition-colors">
                <X className="size-5" />
              </button>
            </div>

            {/* Quick save */}
            <div className="p-3 border-b border-border/30 bg-accent/20 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="Trip name (optional)"
                  className="flex-1 h-9 px-3 text-sm rounded-lg border border-border/50 bg-background/80 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTrip(); }}
                />
                <Button
                  onClick={handleSaveTrip}
                  disabled={locations.length === 0}
                  className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
                >
                  <Save className="size-3.5" />
                  Save current
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {savedTrips.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderOpen className="size-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No saved trips yet</p>
                  <p className="text-xs mt-1">Save your current trip to access it later</p>
                </div>
              ) : (
                savedTrips.map((trip) => (
                  <div
                    key={trip.id}
                    className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      trip.id === activeTripId
                        ? "border-amber-500/60 bg-amber-500/10"
                        : "border-border/40 hover:border-amber-500/40 hover:bg-accent/40"
                    }`}
                    onClick={() => handleLoadTrip(trip)}
                  >
                    <div className="size-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <Plane className="size-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{trip.name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{trip.locations.length} stop{trip.locations.length !== 1 ? "s" : ""}</span>
                        <span>·</span>
                        <span>{trip.days.length} day{trip.days.length !== 1 ? "s" : ""}</span>
                        {trip.flights?.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{trip.flights.length} flight{trip.flights.length !== 1 ? "s" : ""}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 mt-0.5">
                        <Clock className="size-2.5" />
                        {new Date(trip.savedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${trip.name}"?`)) handleDeleteTrip(trip.id);
                      }}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                      title="Delete trip"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-border/50 bg-accent/20 flex-shrink-0">
              <Button variant="outline" onClick={() => setShowSavedTrips(false)} className="w-full">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

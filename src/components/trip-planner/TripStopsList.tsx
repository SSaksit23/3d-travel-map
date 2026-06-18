"use client";

import { useState, useRef, useMemo } from "react";
import { GripVertical, Trash2, MapPin, Clock, Route, Calendar, Building2, Plus, X, ChevronDown, ChevronRight, Search, Loader2, Filter, Eye, EyeOff, Plane, Pencil, ArrowUpDown, ArrowRight, Hotel, Star, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { TripLocation, RouteInfo, FlightInfo, AccommodationSuggestion } from "@/types/trip";

interface OvernightRoute {
  fromDay: number;
  toDay: number;
  fromLocation: string;
  toLocation: string;
  distance: number;
  duration: number;
}

interface TripStopsListProps {
  locations: TripLocation[];
  routes: RouteInfo[];
  flights?: FlightInfo[];
  selectedLocationId?: string | null;
  onLocationSelect: (id: string) => void;
  onLocationRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDayChange: (locationId: string, newDay: number) => void;
  onAddDay: () => void;
  onAddDayAfter?: (afterDay: number) => void;
  onRemoveDay: (day: number) => void;
  onSwapDays?: (fromDay: number, toDay: number) => void;
  onAddLocationToDay: (query: string, day: number) => void;
  onInsertLocationToDay?: (query: string, day: number, afterLocationId: string | null) => void;
  onFlightEdit?: (flight: FlightInfo) => void;
  onFlightRemove?: (flightId: string) => void;
  days: number[];
  isSearching?: boolean;
  visibleDays: Set<number>;
  onVisibleDaysChange: (days: Set<number>) => void;
  visibleTypes: Set<string>;
  onVisibleTypesChange: (types: Set<string>) => void;
  // Accommodation suggestions
  overnightRoutes?: OvernightRoute[];
  accommodationSuggestions?: Map<string, AccommodationSuggestion[]>;
  loadingAccommodations?: Set<string>;
  onFetchAccommodations?: (route: OvernightRoute) => void;
}

const typeLabels: Record<string, string> = {
  attraction: "Attraction",
  restaurant: "Restaurant",
  hotel: "Hotel",
  landmark: "Landmark",
  city: "City",
  airport: "Airport",
  station: "Station",
  custom: "Location",
};

const typeColors: Record<string, string> = {
  attraction: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  restaurant: "bg-red-500/10 text-red-600 border-red-500/20",
  hotel: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  landmark: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  city: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  airport: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  station: "bg-green-500/10 text-green-600 border-green-500/20",
  custom: "bg-pink-500/10 text-pink-600 border-pink-500/20",
};

// Day colors for visual distinction
export const dayColors = [
  { bg: "#f97316", light: "bg-orange-500/10", text: "text-orange-500", border: "border-orange-500/30" }, // Day 1 - Orange
  { bg: "#3b82f6", light: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/30" },       // Day 2 - Blue
  { bg: "#22c55e", light: "bg-green-500/10", text: "text-green-500", border: "border-green-500/30" },    // Day 3 - Green
  { bg: "#a855f7", light: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-500/30" }, // Day 4 - Purple
  { bg: "#ec4899", light: "bg-pink-500/10", text: "text-pink-500", border: "border-pink-500/30" },       // Day 5 - Pink
  { bg: "#14b8a6", light: "bg-teal-500/10", text: "text-teal-500", border: "border-teal-500/30" },       // Day 6 - Teal
  { bg: "#f59e0b", light: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/30" },    // Day 7 - Amber
  { bg: "#6366f1", light: "bg-indigo-500/10", text: "text-indigo-500", border: "border-indigo-500/30" }, // Day 8 - Indigo
];

export function getDayColor(day: number | undefined) {
  if (!day || day < 1) return dayColors[0];
  return dayColors[(day - 1) % dayColors.length];
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function TripStopsList({
  locations,
  routes,
  flights = [],
  selectedLocationId,
  onLocationSelect,
  onLocationRemove,
  onReorder,
  onDayChange,
  onAddDay,
  onAddDayAfter,
  onRemoveDay,
  onSwapDays,
  onAddLocationToDay,
  onInsertLocationToDay,
  onFlightEdit,
  onFlightRemove,
  days,
  isSearching = false,
  visibleDays,
  onVisibleDaysChange,
  visibleTypes,
  onVisibleTypesChange,
  overnightRoutes = [],
  accommodationSuggestions = new Map(),
  loadingAccommodations = new Set(),
  onFetchAccommodations,
}: TripStopsListProps) {
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [draggedDay, setDraggedDay] = useState<number | null>(null);
  const [dragOverDayTarget, setDragOverDayTarget] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null); // Track which item is being dragged over
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null); // Position relative to item
  const [dayInputs, setDayInputs] = useState<Record<number, string>>({});
  const [activeDayInput, setActiveDayInput] = useState<number | null>(null);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  // Insert-at-position state: tracks which slot is active (day + afterLocationId, null = before first)
  const [insertSlot, setInsertSlot] = useState<{ day: number; afterId: string | null } | null>(null);
  const [insertQuery, setInsertQuery] = useState("");
  const dragCounter = useRef(0);
  const dayDragCounter = useRef(0);

  // Get flights for a specific day
  const getFlightsForDay = (day: number) => {
    return flights.filter(f => (f.day || 1) === day);
  };

  // Day drag handlers
  const handleDayDragStart = (e: React.DragEvent, day: number) => {
    e.stopPropagation();
    setDraggedDay(day);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("day", day.toString());
  };

  const handleDayDragEnd = () => {
    setDraggedDay(null);
    setDragOverDayTarget(null);
    dayDragCounter.current = 0;
  };

  const handleDayDragEnter = (e: React.DragEvent, targetDay: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedDay !== null && draggedDay !== targetDay) {
      dayDragCounter.current++;
      setDragOverDayTarget(targetDay);
    }
  };

  const handleDayDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    dayDragCounter.current--;
    if (dayDragCounter.current === 0) {
      setDragOverDayTarget(null);
    }
  };

  const handleDayDrop = (e: React.DragEvent, targetDay: number) => {
    e.preventDefault();
    e.stopPropagation();
    const fromDay = parseInt(e.dataTransfer.getData("day"));
    if (fromDay && fromDay !== targetDay && onSwapDays) {
      onSwapDays(fromDay, targetDay);
    }
    setDraggedDay(null);
    setDragOverDayTarget(null);
    dayDragCounter.current = 0;
  };

  // Get all unique types from locations
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    locations.forEach(loc => types.add(loc.type || "custom"));
    return Array.from(types);
  }, [locations]);

  // Toggle type visibility
  const toggleTypeVisibility = (type: string) => {
    const newSet = new Set(visibleTypes);
    if (newSet.has(type)) {
      // Don't allow hiding all types
      if (newSet.size > 1) {
        newSet.delete(type);
      }
    } else {
      newSet.add(type);
    }
    onVisibleTypesChange(newSet);
  };

  const showAllTypes = () => {
    onVisibleTypesChange(new Set(Object.keys(typeLabels)));
  };

  // Filter locations by visible types
  const filteredLocations = useMemo(() => {
    return locations.filter(loc => visibleTypes.has(loc.type || "custom"));
  }, [locations, visibleTypes]);

  const handleDayInputChange = (day: number, value: string) => {
    setDayInputs(prev => ({ ...prev, [day]: value }));
  };

  const handleDayInputSubmit = (day: number) => {
    const query = dayInputs[day]?.trim();
    if (query) {
      onAddLocationToDay(query, day);
      setDayInputs(prev => ({ ...prev, [day]: "" }));
      setActiveDayInput(null);
    }
  };

  const handleDayInputKeyDown = (e: React.KeyboardEvent, day: number) => {
    if (e.key === "Enter") {
      handleDayInputSubmit(day);
    } else if (e.key === "Escape") {
      setActiveDayInput(null);
      setDayInputs(prev => ({ ...prev, [day]: "" }));
    }
  };

  const handleInsertSubmit = () => {
    if (!insertSlot || !insertQuery.trim() || !onInsertLocationToDay) return;
    onInsertLocationToDay(insertQuery.trim(), insertSlot.day, insertSlot.afterId);
    setInsertSlot(null);
    setInsertQuery("");
  };

  const handleInsertKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleInsertSubmit();
    } else if (e.key === "Escape") {
      setInsertSlot(null);
      setInsertQuery("");
    }
  };

  const toggleDayCollapse = (day: number) => {
    setCollapsedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(day)) {
        newSet.delete(day);
      } else {
        newSet.add(day);
      }
      return newSet;
    });
  };

  const toggleDayVisibility = (day: number) => {
    const newSet = new Set(visibleDays);
    if (newSet.has(day)) {
      // Don't allow hiding all days
      if (newSet.size > 1) {
        newSet.delete(day);
      }
    } else {
      newSet.add(day);
    }
    onVisibleDaysChange(newSet);
  };

  const showAllDays = () => {
    onVisibleDaysChange(new Set(days));
  };

  if (locations.length === 0 && days.length <= 1) {
    return (
      <div className="flex flex-col h-full">
        {/* Day Management Header */}
        <div className="p-3 border-b border-border/50 flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Trip Days</span>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddDay}
            className="h-7 text-xs gap-1"
          >
            <Plus className="size-3" />
            Add Day
          </Button>
        </div>

        <div className="flex flex-col items-center justify-center flex-1 py-12 px-4 text-center">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <MapPin className="size-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No destinations yet</h3>
          <p className="text-sm text-muted-foreground max-w-[250px]">
            Search for places or use AI to plan your perfect trip
          </p>
        </div>
      </div>
    );
  }

  const totalDistance = routes.reduce((sum, r) => sum + r.distance, 0);
  const totalDuration = routes.reduce((sum, r) => sum + r.duration, 0);

  // Group filtered locations by day
  const locationsByDay = days.reduce((acc, day) => {
    acc[day] = filteredLocations.filter(l => (l.day || 1) === day);
    return acc;
  }, {} as Record<number, TripLocation[]>);

  // Build a route lookup map based on actual route data
  const getRouteForLocation = (locationId: string, locationIndex: number, locationDay: number) => {
    const dayLocs = locationsByDay[locationDay] || [];
    const currentLocIndexInDay = dayLocs.findIndex(l => l.id === locationId);
    
    if (currentLocIndexInDay === -1 || currentLocIndexInDay >= dayLocs.length - 1) return null;
    
    const currentLoc = dayLocs[currentLocIndexInDay];
    const nextLoc = dayLocs[currentLocIndexInDay + 1];
    
    if (!currentLoc || !nextLoc) return null;
    
    if (currentLoc.type === 'airport' || nextLoc.type === 'airport') return null;
    if (currentLoc.type === 'station' || nextLoc.type === 'station') return null;
    
    // Match by location ID first (exact), then fall back to coordinate proximity
    const matchingRoute = routes.find((r) => {
      if (r.isFlight || r.isCrossDay || r.isOvernight) return false;

      if (r.fromLocationId && r.toLocationId) {
        return r.fromLocationId === currentLoc.id && r.toLocationId === nextLoc.id;
      }

      if (!r.coordinates || r.coordinates.length < 2) return false;
      const routeStart = r.coordinates[0];
      const routeEnd = r.coordinates[r.coordinates.length - 1];
      const tolerance = 0.01;
      const startMatches = 
        Math.abs(routeStart[0] - currentLoc.coordinates.lng) < tolerance &&
        Math.abs(routeStart[1] - currentLoc.coordinates.lat) < tolerance;
      const endMatches = 
        Math.abs(routeEnd[0] - nextLoc.coordinates.lng) < tolerance &&
        Math.abs(routeEnd[1] - nextLoc.coordinates.lat) < tolerance;
      return startMatches && endMatches;
    });
    
    return matchingRoute || null;
  };

  // Get cross-day route between two days
  const getCrossDayRoute = (fromDay: number, toDay: number) => {
    return routes.find(r => r.isCrossDay && r.fromDay === fromDay && r.toDay === toDay);
  };

  const handleDragStart = (e: React.DragEvent, locationId: string) => {
    setDraggedItem(locationId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", locationId);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverDay(null);
    setDragOverItem(null);
    setDragOverPosition(null);
    dragCounter.current = 0;
  };

  const handleDragEnterDay = (day: number) => {
    dragCounter.current++;
    setDragOverDay(day);
  };

  const handleDragLeaveDay = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverDay(null);
    }
  };

  // Handle drag over an item - determine if above or below
  const handleItemDragOver = (e: React.DragEvent, targetLocationId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem || draggedItem === targetLocationId) {
      setDragOverItem(null);
      setDragOverPosition(null);
      return;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';
    
    setDragOverItem(targetLocationId);
    setDragOverPosition(position);
  };

  const handleItemDragLeave = () => {
    setDragOverItem(null);
    setDragOverPosition(null);
  };

  // Handle drop on an item - reorder within day or move between days
  const handleDropOnItem = (e: React.DragEvent, targetLocationId: string, targetDay: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const draggedLocationId = e.dataTransfer.getData("text/plain");
    
    // Calculate position directly from mouse position (more reliable than state)
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';
    
    console.log('[TripStopsList] handleDropOnItem:', { draggedLocationId, targetLocationId, targetDay, position });
    
    if (!draggedLocationId || draggedLocationId === targetLocationId) {
      console.log('[TripStopsList] Same item or no dragged item, skipping');
      resetDragState();
      return;
    }
    
    const draggedLocation = locations.find(l => l.id === draggedLocationId);
    const targetLocation = locations.find(l => l.id === targetLocationId);
    
    if (!draggedLocation || !targetLocation) {
      console.log('[TripStopsList] Location not found:', { draggedLocation, targetLocation });
      resetDragState();
      return;
    }
    
    const fromIndex = locations.findIndex(l => l.id === draggedLocationId);
    const toIndex = locations.findIndex(l => l.id === targetLocationId);
    
    console.log('[TripStopsList] Indices:', { fromIndex, toIndex, draggedDay: draggedLocation.day, targetDay });
    
    // Determine the final insertion index
    let insertIndex = toIndex;
    if (position === 'below') {
      insertIndex = toIndex + 1;
    }
    
    // If moving to a different day, update the day first
    if (draggedLocation.day !== targetDay) {
      console.log('[TripStopsList] Moving to different day');
      // Moving to a different day - update day and reorder
      const newLocations = locations.filter(l => l.id !== draggedLocationId);
      const updatedDraggedLocation = { ...draggedLocation, day: targetDay };
      
      // Find the correct insert position in the new array
      const targetIndexInNew = newLocations.findIndex(l => l.id === targetLocationId);
      const newInsertIndex = position === 'below' ? targetIndexInNew + 1 : targetIndexInNew;
      
      console.log('[TripStopsList] Cross-day reorder:', { targetIndexInNew, newInsertIndex });
      
      newLocations.splice(newInsertIndex, 0, updatedDraggedLocation);
      
      // Update order values
      const updatedLocations = newLocations.map((loc, idx) => ({
        ...loc,
        order: idx,
      }));
      
      // Call the parent handlers
      onDayChange(draggedLocationId, targetDay);
      // After day change, trigger reorder to position correctly
      setTimeout(() => {
        const newFromIndex = locations.findIndex(l => l.id === draggedLocationId);
        if (newFromIndex !== newInsertIndex) {
          onReorder(newFromIndex, newInsertIndex);
        }
      }, 10);
    } else {
      // Same day - just reorder
      console.log('[TripStopsList] Same day reorder:', { fromIndex, toIndex, insertIndex, position });
      
      // Adjust index if dragging down (since we remove first then insert)
      if (fromIndex < insertIndex) {
        insertIndex--;
      }
      
      console.log('[TripStopsList] Adjusted insertIndex:', insertIndex);
      
      if (fromIndex !== insertIndex) {
        console.log('[TripStopsList] Calling onReorder:', { fromIndex, insertIndex });
        onReorder(fromIndex, insertIndex);
      } else {
        console.log('[TripStopsList] No reorder needed (same position)');
      }
    }
    
    resetDragState();
  };

  // Reset all drag state
  const resetDragState = () => {
    setDraggedItem(null);
    setDragOverDay(null);
    setDragOverItem(null);
    setDragOverPosition(null);
    dragCounter.current = 0;
  };

  const handleDropOnDay = (e: React.DragEvent, targetDay: number) => {
    e.preventDefault();
    const locationId = e.dataTransfer.getData("text/plain");
    if (locationId && draggedItem) {
      const location = locations.find(l => l.id === locationId);
      if (location && location.day !== targetDay) {
        onDayChange(locationId, targetDay);
      }
    }
    resetDragState();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day Management Header */}
      <div className="p-3 border-b border-border/50 flex items-center justify-between flex-shrink-0">
        <span className="text-sm font-medium text-muted-foreground">
          {days.length} {days.length === 1 ? "Day" : "Days"}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddDay}
          className="h-7 text-xs gap-1"
        >
          <Plus className="size-3" />
          Add Day
        </Button>
      </div>

      {/* Trip Summary */}
      {routes.length > 0 && (
        <div className="p-3 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Route className="size-4 text-muted-foreground" />
                <span className="font-medium text-sm">{formatDistance(totalDistance)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="size-4 text-muted-foreground" />
                <span className="font-medium text-sm">{formatDuration(totalDuration)}</span>
              </div>
            </div>
            <Badge variant="secondary" className="font-normal text-xs">
              {locations.length} stops
            </Badge>
          </div>
        </div>
      )}

      {/* Day Filter */}
      {days.length > 1 && (
        <div className="p-2 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground mr-1">Days:</span>
            {days.map(day => {
              const dayColor = getDayColor(day);
              const isVisible = visibleDays.has(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleDayVisibility(day)}
                  className={`
                    px-2 py-1 rounded-md text-[10px] font-medium transition-all
                    ${isVisible 
                      ? "text-white" 
                      : "opacity-40 hover:opacity-70"
                    }
                  `}
                  style={{ 
                    backgroundColor: isVisible ? dayColor.bg : "transparent",
                    border: `1px solid ${dayColor.bg}`
                  }}
                >
                  Day {day}
                </button>
              );
            })}
            {visibleDays.size < days.length && (
              <button
                onClick={showAllDays}
                className="px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Show All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Type Filter */}
      {availableTypes.length > 1 && (
        <div className="p-2 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setShowTypeFilter(!showTypeFilter)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground mr-1 hover:text-foreground transition-colors"
            >
              <Filter className="size-3" />
              Types:
              {showTypeFilter ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
            {showTypeFilter && (
              <>
                {availableTypes.map(type => {
                  const isVisible = visibleTypes.has(type);
                  const colors = typeColors[type] || typeColors.custom;
                  return (
                    <button
                      key={type}
                      onClick={() => toggleTypeVisibility(type)}
                      className={`
                        px-2 py-1 rounded-md text-[10px] font-medium transition-all flex items-center gap-1
                        ${isVisible ? colors : "opacity-40 hover:opacity-70 bg-muted/50"}
                      `}
                    >
                      {isVisible ? <Eye className="size-2.5" /> : <EyeOff className="size-2.5" />}
                      {typeLabels[type]}
                    </button>
                  );
                })}
                {visibleTypes.size < availableTypes.length && (
                  <button
                    onClick={showAllTypes}
                    className="px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Show All
                  </button>
                )}
              </>
            )}
            {!showTypeFilter && visibleTypes.size < availableTypes.length && (
              <span className="text-[10px] text-amber-500">
                ({availableTypes.length - visibleTypes.size} hidden)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stops List by Day - Scrollable Container */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-3">
          {days.filter(day => visibleDays.has(day)).map((day, dayIdx, visibleDaysArray) => {
            const dayColor = getDayColor(day);
            const dayLocations = locationsByDay[day] || [];
            const dayFlights = getFlightsForDay(day);
            const isCollapsed = collapsedDays.has(day);
            const isDragOver = dragOverDay === day;
            const isDayDragOver = dragOverDayTarget === day;
            const isDayDragging = draggedDay === day;
            const isLastVisibleDay = dayIdx === visibleDaysArray.length - 1;
            const hasContent = dayLocations.length > 0 || dayFlights.length > 0;

            return (
              <div
                key={day}
                className={`rounded-lg border transition-all ${
                  isDragOver || isDayDragOver
                    ? "border-2 border-dashed bg-accent/30" 
                    : "border-border/50"
                } ${isDayDragging ? "opacity-50 scale-[0.98]" : ""}`}
                style={{ borderColor: isDragOver || isDayDragOver ? dayColor.bg : undefined }}
                onDragEnter={(e) => {
                  if (draggedDay !== null) {
                    handleDayDragEnter(e, day);
                  } else {
                    handleDragEnterDay(day);
                  }
                }}
                onDragLeave={(e) => {
                  if (draggedDay !== null) {
                    handleDayDragLeave(e);
                  } else {
                    handleDragLeaveDay();
                  }
                }}
                onDragOver={handleDragOver}
                onDrop={(e) => {
                  if (draggedDay !== null) {
                    handleDayDrop(e, day);
                  } else {
                    handleDropOnDay(e, day);
                  }
                }}
              >
                {/* Day Header */}
                <div
                  className="flex items-center gap-2 p-2 cursor-pointer hover:bg-accent/30 rounded-t-lg group"
                  onClick={() => toggleDayCollapse(day)}
                  draggable={onSwapDays !== undefined}
                  onDragStart={(e) => handleDayDragStart(e, day)}
                  onDragEnd={handleDayDragEnd}
                >
                  {/* Day Drag Handle */}
                  {onSwapDays && (
                    <div 
                      className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowUpDown className="size-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <button className="p-0.5">
                    {isCollapsed ? (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  <div
                    className="size-6 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: dayColor.bg }}
                  >
                    <Calendar className="size-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-sm flex-1" style={{ color: dayColor.bg }}>
                    Day {day}
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {dayLocations.length} stops
                    {dayFlights.length > 0 && ` • ${dayFlights.length} flight${dayFlights.length > 1 ? 's' : ''}`}
                  </Badge>
                  {/* Remove Day Button - now shows for all days with confirmation for non-empty days */}
                  {days.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`size-6 ${hasContent ? "text-muted-foreground/50 hover:text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasContent) {
                          if (confirm(`Remove Day ${day} and all its ${dayLocations.length} stops${dayFlights.length > 0 ? ` and ${dayFlights.length} flight(s)` : ''}?`)) {
                            onRemoveDay(day);
                          }
                        } else {
                          onRemoveDay(day);
                        }
                      }}
                      title={hasContent ? `Remove Day ${day} (has content)` : `Remove Day ${day}`}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>

                {/* Day Content */}
                {!isCollapsed && (
                  <div className="p-2 pt-0 space-y-1">
                    {/* Starting point indicator - shows where this day starts from (last location of previous day) */}
                    {(() => {
                      const sortedDaysList = [...days].sort((a, b) => a - b);
                      const currentDayIndex = sortedDaysList.indexOf(day);
                      const prevDay = currentDayIndex > 0 ? sortedDaysList[currentDayIndex - 1] : null;
                      
                      if (prevDay) {
                        const prevDayLocs = locationsByDay[prevDay] || [];
                        // Find last non-airport, non-station location of previous day
                        const prevDayNonTransport = prevDayLocs.filter(
                          l => l.type !== 'airport' && l.type !== 'station'
                        );
                        const lastPrevDayLoc = prevDayNonTransport.length > 0 
                          ? prevDayNonTransport[prevDayNonTransport.length - 1]
                          : prevDayLocs[prevDayLocs.length - 1];
                        
                        if (lastPrevDayLoc) {
                          const prevDayColor = getDayColor(prevDay);
                          return (
                            <div className="mb-2 px-2 py-1.5 bg-gradient-to-r from-slate-500/10 to-transparent rounded-lg border border-slate-500/20 border-dashed">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="size-3 text-slate-400" />
                                  <span className="text-[10px] text-slate-400">Starting from:</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div
                                    className="size-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                                    style={{ backgroundColor: prevDayColor.bg }}
                                  >
                                    {prevDay}
                                  </div>
                                  <span className="text-[10px] font-medium text-slate-300 truncate">
                                    {lastPrevDayLoc.name.split(",")[0]}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}

                    {/* Flights for this day */}
                    {dayFlights.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {dayFlights.map((flight) => (
                          <Card
                            key={flight.id}
                            className="p-2.5 bg-gradient-to-r from-sky-500/10 to-blue-600/10 border-sky-500/30 border-l-4"
                          >
                            <div className="flex items-start gap-2">
                              <div className="size-6 rounded-full bg-sky-500 flex items-center justify-center">
                                <Plane className="size-3 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm">{flight.flightNumber}</span>
                                    <span className="text-[10px] text-muted-foreground">{flight.airline}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {onFlightEdit && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6 text-sky-500 hover:text-sky-400 hover:bg-sky-500/20"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onFlightEdit(flight);
                                        }}
                                        title="Edit flight"
                                      >
                                        <Pencil className="size-3" />
                                      </Button>
                                    )}
                                    {onFlightRemove && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6 text-muted-foreground hover:text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onFlightRemove(flight.id);
                                        }}
                                        title="Remove flight"
                                      >
                                        <Trash2 className="size-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-semibold">{flight.departure.iata}</span>
                                    {flight.departure.scheduledTime && (
                                      <span className="text-[10px] text-muted-foreground">{flight.departure.scheduledTime}</span>
                                    )}
                                  </div>
                                  <ArrowRight className="size-3 text-sky-500" />
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-semibold">{flight.arrival.iata}</span>
                                    {flight.arrival.scheduledTime && (
                                      <span className="text-[10px] text-muted-foreground">{flight.arrival.scheduledTime}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {dayLocations.length === 0 && dayFlights.length === 0 ? (
                      <div className="text-center py-2 text-[10px] text-muted-foreground">
                        No stops yet - add below or drag items here
                      </div>
                    ) : dayLocations.length > 0 ? (
                      <>
                        {/* Insert before first location */}
                        {onInsertLocationToDay && (
                          insertSlot?.day === day && insertSlot?.afterId === null ? (
                            <div className="flex gap-1 mb-1">
                              <div className="relative flex-1">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                                <Input
                                  type="text"
                                  placeholder="Insert destination here..."
                                  value={insertQuery}
                                  onChange={(e) => setInsertQuery(e.target.value)}
                                  onKeyDown={handleInsertKeyDown}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (!insertQuery.trim()) {
                                        setInsertSlot(null);
                                        setInsertQuery("");
                                      }
                                    }, 200);
                                  }}
                                  autoFocus
                                  className="h-7 pl-7 pr-2 text-xs bg-background/60"
                                  disabled={isSearching}
                                />
                                {isSearching && insertSlot?.day === day && (
                                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 animate-spin" />
                                )}
                              </div>
                              <Button
                                size="sm"
                                className="h-7 px-2"
                                onClick={handleInsertSubmit}
                                disabled={!insertQuery.trim() || isSearching}
                                style={{ backgroundColor: dayColor.bg }}
                              >
                                <Plus className="size-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-1.5"
                                onClick={() => { setInsertSlot(null); setInsertQuery(""); }}
                              >
                                <X className="size-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="group/insert flex justify-center mb-0.5">
                              <button
                                onClick={() => { setInsertSlot({ day, afterId: null }); setInsertQuery(""); setActiveDayInput(null); }}
                                className="opacity-0 group-hover/insert:opacity-100 focus:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-dashed border-transparent hover:border-border/50"
                                title="Insert destination before first stop"
                              >
                                <Plus className="size-2.5" />
                                Insert here
                              </button>
                            </div>
                          )
                        )}

                        {dayLocations.map((location, dayIndex) => {
                          const routeToNext = getRouteForLocation(location.id, dayIndex, day);
                          const isHotel = location.type === "hotel";
                          const isAirport = location.type === "airport";
                          const isStation = location.type === "station";
                          const isLastInDay = dayLocations[dayLocations.length - 1]?.id === location.id;
                          const isDragging = draggedItem === location.id;
                          const displayNumber = dayIndex + 1;

                          const isDragOver = dragOverItem === location.id;
                          const showDropAbove = isDragOver && dragOverPosition === 'above';
                          const showDropBelow = isDragOver && dragOverPosition === 'below';

                          const isInsertActive = insertSlot?.day === day && insertSlot?.afterId === location.id;

                          return (
                            <div key={location.id} className="relative">
                              {/* Drop indicator - above */}
                              {showDropAbove && (
                                <div className="absolute -top-1 left-0 right-0 h-1 bg-primary rounded-full z-10 animate-pulse" />
                              )}
                              <Card
                                draggable
                                onDragStart={(e) => handleDragStart(e, location.id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleItemDragOver(e, location.id)}
                                onDragLeave={handleItemDragLeave}
                                onDrop={(e) => handleDropOnItem(e, location.id, day)}
                                className={`
                                  p-2.5 cursor-pointer transition-all duration-200
                                  hover:bg-accent/50 
                                  ${dayColor.border} border-l-4
                                  ${selectedLocationId === location.id ? "ring-2 ring-primary bg-accent/30" : ""}
                                  ${isDragging ? "opacity-50 scale-95" : ""}
                                  ${isDragOver ? "ring-2 ring-primary/50" : ""}
                                `}
                                onClick={() => onLocationSelect(location.id)}
                              >
                                <div className="flex items-start gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <GripVertical className="size-3.5 text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
                                    <div
                                      className="size-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                                      style={{ backgroundColor: dayColor.bg }}
                                    >
                                      {isHotel ? "🏨" : isAirport ? "✈️" : isStation ? "🚂" : displayNumber}
                                    </div>
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-1">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          {isHotel && <Building2 className="size-3.5 text-violet-500 flex-shrink-0" />}
                                          <p className="font-medium text-xs truncate">{location.name.split(",")[0]}</p>
                                        </div>
                                        {location.description && (
                                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                                            {location.description}
                                          </p>
                                        )}
                                        {isHotel && location.address && (
                                          <p className="text-[10px] text-violet-400 mt-0.5 line-clamp-1">
                                            📍 {location.address}
                                          </p>
                                        )}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6 text-muted-foreground hover:text-destructive flex-shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onLocationRemove(location.id);
                                        }}
                                      >
                                        <Trash2 className="size-3" />
                                      </Button>
                                    </div>

                                    <div className="flex items-center gap-1.5 mt-1.5">
                                      <Badge
                                        variant="outline"
                                        className={`text-[9px] px-1 py-0 ${typeColors[location.type || "custom"]}`}
                                      >
                                        {typeLabels[location.type || "custom"]}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </Card>
                              {/* Drop indicator - below */}
                              {showDropBelow && (
                                <div className="absolute -bottom-1 left-0 right-0 h-1 bg-primary rounded-full z-10 animate-pulse" />
                              )}

                              {/* Route info + insert button between stops */}
                              {!isLastInDay && (
                                <div className="group/between">
                                  {routeToNext && (
                                    <div className="flex items-center gap-1.5 py-1.5 px-2 ml-6">
                                      <div
                                        className="w-0.5 h-4 rounded-full"
                                        style={{ backgroundColor: dayColor.bg, opacity: 0.5 }}
                                      />
                                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <span className="flex items-center gap-0.5">
                                          <Route className="size-2.5" />
                                          {formatDistance(routeToNext.distance)}
                                        </span>
                                        <span className="flex items-center gap-0.5">
                                          <Clock className="size-2.5" />
                                          {formatDuration(routeToNext.duration)}
                                        </span>
                                      </div>
                                      {onInsertLocationToDay && !isInsertActive && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setInsertSlot({ day, afterId: location.id }); setInsertQuery(""); setActiveDayInput(null); }}
                                          className="opacity-0 group-hover/between:opacity-100 focus:opacity-100 transition-opacity ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                          title="Insert destination here"
                                        >
                                          <Plus className="size-2.5" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {!routeToNext && onInsertLocationToDay && !isInsertActive && (
                                    <div className="flex justify-center py-0.5">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setInsertSlot({ day, afterId: location.id }); setInsertQuery(""); setActiveDayInput(null); }}
                                        className="opacity-0 group-hover/between:opacity-100 focus:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-dashed border-transparent hover:border-border/50"
                                        title="Insert destination here"
                                      >
                                        <Plus className="size-2.5" />
                                        Insert here
                                      </button>
                                    </div>
                                  )}
                                  {isInsertActive && (
                                    <div className="flex gap-1 py-1 px-1">
                                      <div className="relative flex-1">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                                        <Input
                                          type="text"
                                          placeholder="Insert destination here..."
                                          value={insertQuery}
                                          onChange={(e) => setInsertQuery(e.target.value)}
                                          onKeyDown={handleInsertKeyDown}
                                          onBlur={() => {
                                            setTimeout(() => {
                                              if (!insertQuery.trim()) {
                                                setInsertSlot(null);
                                                setInsertQuery("");
                                              }
                                            }, 200);
                                          }}
                                          autoFocus
                                          className="h-7 pl-7 pr-2 text-xs bg-background/60"
                                          disabled={isSearching}
                                        />
                                        {isSearching && (
                                          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 animate-spin" />
                                        )}
                                      </div>
                                      <Button
                                        size="sm"
                                        className="h-7 px-2"
                                        onClick={handleInsertSubmit}
                                        disabled={!insertQuery.trim() || isSearching}
                                        style={{ backgroundColor: dayColor.bg }}
                                      >
                                        <Plus className="size-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-1.5"
                                        onClick={() => { setInsertSlot(null); setInsertQuery(""); }}
                                      >
                                        <X className="size-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Insert button after last location in day */}
                              {isLastInDay && onInsertLocationToDay && (
                                isInsertActive ? (
                                  <div className="flex gap-1 py-1 px-1">
                                    <div className="relative flex-1">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                                      <Input
                                        type="text"
                                        placeholder="Insert destination here..."
                                        value={insertQuery}
                                        onChange={(e) => setInsertQuery(e.target.value)}
                                        onKeyDown={handleInsertKeyDown}
                                        onBlur={() => {
                                          setTimeout(() => {
                                            if (!insertQuery.trim()) {
                                              setInsertSlot(null);
                                              setInsertQuery("");
                                            }
                                          }, 200);
                                        }}
                                        autoFocus
                                        className="h-7 pl-7 pr-2 text-xs bg-background/60"
                                        disabled={isSearching}
                                      />
                                      {isSearching && (
                                        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 animate-spin" />
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={handleInsertSubmit}
                                      disabled={!insertQuery.trim() || isSearching}
                                      style={{ backgroundColor: dayColor.bg }}
                                    >
                                      <Plus className="size-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-1.5"
                                      onClick={() => { setInsertSlot(null); setInsertQuery(""); }}
                                    >
                                      <X className="size-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="group/insertlast flex justify-center py-0.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setInsertSlot({ day, afterId: location.id }); setInsertQuery(""); setActiveDayInput(null); }}
                                      className="opacity-0 group-hover/insertlast:opacity-100 focus:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-dashed border-transparent hover:border-border/50"
                                      title="Insert destination after last stop"
                                    >
                                      <Plus className="size-2.5" />
                                      Insert here
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          );
                        })}
                      </>
                    ) : null}

                    {/* Add Location Input - At Bottom of Day */}
                    <div className="mt-2 pt-2 border-t border-border/30">
                      {activeDayInput === day ? (
                        <div className="flex gap-1">
                          <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                            <Input
                              type="text"
                              placeholder={`Add location to Day ${day}...`}
                              value={dayInputs[day] || ""}
                              onChange={(e) => handleDayInputChange(day, e.target.value)}
                              onKeyDown={(e) => handleDayInputKeyDown(e, day)}
                              onBlur={() => {
                                setTimeout(() => {
                                  if (!dayInputs[day]?.trim()) {
                                    setActiveDayInput(null);
                                  }
                                }, 200);
                              }}
                              autoFocus
                              className="h-8 pl-7 pr-2 text-xs bg-background/60"
                              disabled={isSearching}
                            />
                            {isSearching && activeDayInput === day && (
                              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 animate-spin" />
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handleDayInputSubmit(day)}
                            disabled={!dayInputs[day]?.trim() || isSearching}
                            style={{ backgroundColor: dayColor.bg }}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full h-7 text-xs text-muted-foreground hover:text-foreground justify-center gap-1.5 border border-dashed border-border/50 hover:border-border"
                          onClick={() => setActiveDayInput(day)}
                        >
                          <Plus className="size-3" />
                          Add stop to Day {day}
                        </Button>
                      )}
                    </div>

                    {/* Cross-day route connection to next day with accommodation suggestions */}
                    {(() => {
                      // Find the next day that has locations
                      const sortedDaysList = [...days].sort((a, b) => a - b);
                      const currentDayIndex = sortedDaysList.indexOf(day);
                      const nextDay = currentDayIndex < sortedDaysList.length - 1 ? sortedDaysList[currentDayIndex + 1] : null;
                      
                      if (nextDay && dayLocations.length > 0) {
                        const nextDayLocs = locationsByDay[nextDay] || [];
                        if (nextDayLocs.length > 0) {
                          const crossDayRoute = getCrossDayRoute(day, nextDay);
                          const nextDayColor = getDayColor(nextDay);
                          const accommodationKey = `${day}-${nextDay}`;
                          const suggestions = accommodationSuggestions.get(accommodationKey) || [];
                          const isLoadingAccommodation = loadingAccommodations.has(accommodationKey);
                          
                          // Find the overnight route for this day transition
                          const overnightRoute = overnightRoutes.find(
                            r => r.fromDay === day && r.toDay === nextDay
                          );
                          
                          return (
                            <div className="mt-3 pt-2 border-t border-purple-500/30 space-y-2">
                              {/* Cross-day route info */}
                              <div className="flex items-center gap-2 px-2 py-1.5 bg-purple-500/10 rounded-lg">
                                <ArrowRight className="size-3.5 text-purple-400" />
                                <div className="flex-1">
                                  <div className="text-[10px] text-purple-300">
                                    Continue to Day {nextDay}
                                  </div>
                                  {crossDayRoute ? (
                                    <div className="flex items-center gap-2 text-[10px] text-purple-400 mt-0.5">
                                      <span className="flex items-center gap-0.5">
                                        <Route className="size-2.5" />
                                        {formatDistance(crossDayRoute.distance)}
                                      </span>
                                      <span className="flex items-center gap-0.5">
                                        <Clock className="size-2.5" />
                                        {formatDuration(crossDayRoute.duration)}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-purple-400/70 mt-0.5">
                                      Route calculating...
                                    </div>
                                  )}
                                </div>
                                <div
                                  className="size-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                  style={{ backgroundColor: nextDayColor.bg }}
                                >
                                  {nextDay}
                                </div>
                              </div>

                              {/* Accommodation suggestions section */}
                              {overnightRoute && onFetchAccommodations && (
                                <div className="px-2">
                                  {suggestions.length === 0 && !isLoadingAccommodation ? (
                                    <button
                                      onClick={() => onFetchAccommodations(overnightRoute)}
                                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all text-violet-400 hover:text-violet-300"
                                    >
                                      <Hotel className="size-3.5" />
                                      <span className="text-[10px] font-medium">Find Accommodations</span>
                                      <Sparkles className="size-3" />
                                    </button>
                                  ) : isLoadingAccommodation ? (
                                    <div className="flex items-center justify-center gap-2 py-3 text-violet-400">
                                      <Loader2 className="size-4 animate-spin" />
                                      <span className="text-[10px]">Finding hotels...</span>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-1.5 text-violet-400">
                                        <Hotel className="size-3.5" />
                                        <span className="text-[10px] font-semibold">Accommodation Suggestions</span>
                                      </div>
                                      <div className="space-y-1.5">
                                        {suggestions.map((hotel, idx) => (
                                          <div
                                            key={idx}
                                            className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20"
                                          >
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="text-[11px] font-semibold text-violet-200 truncate">
                                                    {hotel.name}
                                                  </span>
                                                  <span className="text-[9px] text-amber-400 flex-shrink-0">
                                                    {hotel.priceRange}
                                                  </span>
                                                </div>
                                                <p className="text-[9px] text-violet-300/80 mt-0.5 line-clamp-2">
                                                  {hotel.description}
                                                </p>
                                                <p className="text-[8px] text-violet-400/60 mt-1 italic flex items-center gap-1">
                                                  <Star className="size-2" />
                                                  {hotel.reason}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}

                    {/* Add Day After Button - only show on last visible day */}
                    {isLastVisibleDay && onAddDayAfter && (
                      <div className="mt-2 pt-2 border-t border-border/30">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-8 text-xs gap-1.5 border-dashed"
                          onClick={() => onAddDayAfter(day)}
                        >
                          <Plus className="size-3" />
                          Add Day {day + 1}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

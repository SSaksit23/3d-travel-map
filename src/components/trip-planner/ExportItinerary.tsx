"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { Download, FileText, X, Printer, Copy, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TripLocation, RouteInfo, FlightInfo, TrainInfo } from "@/types/trip";
import { getDayColor } from "./TripStopsList";
import { calculateDistance } from "@/lib/utils";

interface ExportItineraryProps {
  locations: TripLocation[];
  routes: RouteInfo[];
  flights?: FlightInfo[];
  trains?: TrainInfo[];
  days: number[];
  isOpen: boolean;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

function formatDistance(meters: number): string {
  if (!meters || meters <= 0) return "0 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Estimate flight duration based on distance (avg 800 km/h for commercial flights)
function estimateFlightDuration(distanceKm: number): number {
  const avgSpeedKmH = 800;
  const hours = distanceKm / avgSpeedKmH;
  return hours * 3600; // Return in seconds
}

export function ExportItinerary({ 
  locations, 
  routes, 
  flights = [],
  trains = [],
  days, 
  isOpen, 
  onClose,
}: ExportItineraryProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Safety checks - memoized to prevent infinite loops
  // IMPORTANT: All hooks must be called before any conditional returns
  const safeLocations = useMemo(() => {
    return Array.isArray(locations) ? locations.filter(l => l != null) : [];
  }, [locations]);

  const safeRoutes = useMemo(() => {
    return Array.isArray(routes) ? routes : [];
  }, [routes]);

  const safeFlights = useMemo(() => {
    return Array.isArray(flights) ? flights : [];
  }, [flights]);

  const safeTrains = useMemo(() => {
    return Array.isArray(trains) ? trains : [];
  }, [trains]);

  const safeDays = useMemo(() => {
    return Array.isArray(days) && days.length > 0 ? days : [1];
  }, [days]);

  // Sort days array (memoized)
  const sortedDays = useMemo(() => {
    try {
      return [...safeDays].sort((a, b) => a - b);
    } catch (error) {
      console.error("Error sorting days:", error);
      return [1];
    }
  }, [safeDays]);

  // Group locations by day (memoized)
  const locationsByDay = useMemo(() => {
    try {
      return sortedDays.reduce((acc, day) => {
        acc[day] = safeLocations.filter(l => l && (l.day || 1) === day);
        return acc;
      }, {} as Record<number, TripLocation[]>);
    } catch (error) {
      console.error("Error grouping locations by day:", error);
      return {} as Record<number, TripLocation[]>;
    }
  }, [sortedDays, safeLocations]);

  // Helper to get the first location of the next day (memoized)
  const getFirstLocationOfNextDay = useCallback((currentDay: number) => {
    const currentIndex = sortedDays.indexOf(currentDay);
    if (currentIndex === -1 || currentIndex >= sortedDays.length - 1) return null;
    
    const nextDay = sortedDays[currentIndex + 1];
    const nextDayLocations = locationsByDay[nextDay] || [];
    return nextDayLocations.length > 0 ? nextDayLocations[0] : null;
  }, [sortedDays, locationsByDay]);

  // Get route info between two consecutive locations
  const getRouteBetween = useCallback((fromLoc: TripLocation, toLoc: TripLocation) => {
      // Safety checks
      if (!fromLoc || !toLoc || !fromLoc.id || !toLoc.id) {
        return null;
      }

      // Check if these are flight departure/arrival locations
      // Flight locations have IDs like "flight-xxx-dep" and "flight-xxx-arr"
      if (fromLoc.id.includes('-dep') && toLoc.id.includes('-arr')) {
        const fromFlightId = fromLoc.id.replace('-dep', '').replace('-arr', '');
        const toFlightId = toLoc.id.replace('-dep', '').replace('-arr', '');
        
        if (fromFlightId === toFlightId) {
          const flight = flights.find(f => f.id === fromFlightId);
          if (flight) {
            const distance = calculateDistance(flight.departure.coordinates, flight.arrival.coordinates);
            const duration = flight.duration || estimateFlightDuration(distance / 1000);
            return { distance, duration, isFlight: true, flightInfo: flight };
          }
        }
      }
      
      // For airports on same day, try to match a flight by day
      if (fromLoc.type === 'airport' && toLoc.type === 'airport' && fromLoc.day === toLoc.day) {
        const dayFlight = safeFlights.find(f => f.day === fromLoc.day);
        const distance = calculateDistance(fromLoc.coordinates, toLoc.coordinates);
        if (distance !== Infinity && distance > 0) {
          return { 
            distance, 
            duration: dayFlight?.duration || estimateFlightDuration(distance / 1000),
            isFlight: true,
            flightInfo: dayFlight || null,
          };
        }
      }
      
      // Also check if fromLoc or toLoc are airport types and match a flight for this day
      if ((fromLoc.type === 'airport' || toLoc.type === 'airport') && fromLoc.day === toLoc.day) {
        const dayFlight = safeFlights.find(f => f.day === fromLoc.day);
        if (dayFlight) {
          const distance = calculateDistance(fromLoc.coordinates, toLoc.coordinates);
          if (distance !== Infinity && distance > 0) {
            return { distance, duration: dayFlight.duration || estimateFlightDuration(distance / 1000), isFlight: true, flightInfo: dayFlight };
          }
        }
      }
      
      // Match by location ID first (exact match)
      const idMatch = safeRoutes.find(
        r => r && !r.isFlight && r.fromLocationId === fromLoc.id && r.toLocationId === toLoc.id
      );
      if (idMatch) return { ...idMatch, isFlight: false, flightInfo: null };

      // Fallback: index-based matching for older route data without IDs
      const fromIndex = safeLocations.findIndex(l => l && l.id === fromLoc.id);
      const toIndex = safeLocations.findIndex(l => l && l.id === toLoc.id);
      
      if (fromIndex >= 0 && toIndex >= 0 && toIndex === fromIndex + 1) {
        const landRoutes = safeRoutes.filter(r => r && !r.isFlight);
        let routeIndex = 0;
        for (let i = 0; i < safeLocations.length - 1; i++) {
          const loc1 = safeLocations[i];
          const loc2 = safeLocations[i + 1];
          
          if (!loc1 || !loc2 || !loc1.coordinates || !loc2.coordinates) continue;
          if (loc1.type === 'airport' || loc2.type === 'airport') continue;
          if (loc1.day !== loc2.day) continue;
          
          try {
            const dist = calculateDistance(loc1.coordinates, loc2.coordinates);
            if (dist > 1000000 || !isFinite(dist)) continue;
          } catch (e) {
            continue;
          }
          
          if (i === fromIndex && routeIndex < landRoutes.length) {
            return { ...landRoutes[routeIndex], isFlight: false, flightInfo: null };
          }
          routeIndex++;
        }
      }
      
      // Fallback: calculate direct distance (only if same day)
      if (fromLoc.day === toLoc.day && fromLoc.coordinates && toLoc.coordinates) {
        try {
          const directDistance = calculateDistance(fromLoc.coordinates, toLoc.coordinates);
          if (isFinite(directDistance) && directDistance > 0 && directDistance <= 1000000) {
            const duration = (directDistance / 1000) / 60 * 3600;
            return { distance: directDistance, duration, isFlight: false, flightInfo: null };
          }
        } catch (e) {
          // Ignore calculation errors
        }
      }
      
      return null;
  }, [safeLocations, safeRoutes, safeFlights]);

  // Calculate total stats (including cross-day routes)
  const { totalDistance, totalDuration } = useMemo(() => {
    let distance = 0;
    let duration = 0;
    
    try {
      // Calculate within-day routes
      for (let i = 0; i < safeLocations.length - 1; i++) {
        const loc1 = safeLocations[i];
        const loc2 = safeLocations[i + 1];
        if (!loc1 || !loc2) continue;
        
        const route = getRouteBetween(loc1, loc2);
        if (route) {
          distance += route.distance || 0;
          duration += route.duration || 0;
        }
      }
    
      // Add cross-day routes (last of day N to first of day N+1)
      for (let i = 0; i < sortedDays.length - 1; i++) {
        const currentDay = sortedDays[i];
        const nextDay = sortedDays[i + 1];
        
        const currentDayLocs = locationsByDay[currentDay] || [];
        const nextDayLocs = locationsByDay[nextDay] || [];
        
        if (currentDayLocs.length > 0 && nextDayLocs.length > 0) {
          const lastOfCurrentDay = currentDayLocs[currentDayLocs.length - 1];
          const firstOfNextDay = nextDayLocs[0];
          
          if (!lastOfCurrentDay || !firstOfNextDay) continue;
          
          // Only add if not already counted (same day locations are adjacent in locations array)
          const lastIdx = safeLocations.findIndex(l => l && l.id === lastOfCurrentDay.id);
          const firstIdx = safeLocations.findIndex(l => l && l.id === firstOfNextDay.id);
          
          // If they're not adjacent in the array, we need to add this cross-day route
          if (lastIdx !== -1 && firstIdx !== -1 && firstIdx !== lastIdx + 1) {
            const crossDayRoute = getRouteBetween(lastOfCurrentDay, firstOfNextDay);
            if (crossDayRoute) {
              distance += crossDayRoute.distance || 0;
              duration += crossDayRoute.duration || 0;
            }
          }
        }
      }
    } catch (error) {
      console.error("Error calculating total stats:", error);
      // Return safe defaults
    }
    
    return { totalDistance: distance, totalDuration: duration };
  }, [safeLocations, sortedDays, locationsByDay, getRouteBetween]);

  // Helper to get route to next location within the same day (memoized)
  const getRouteToNext = useCallback((location: TripLocation, dayLocations: TripLocation[], index: number) => {
    if (index >= dayLocations.length - 1) return null;
    const nextLoc = dayLocations[index + 1];
    return getRouteBetween(location, nextLoc);
  }, [getRouteBetween]);

  // Generate text content for export (memoized)
  const generateTextContent = useCallback(() => {
    try {
      let content = "═══════════════════════════════════════\n";
      content += "        VOYAGE AI TRIP ITINERARY\n";
      content += "═══════════════════════════════════════\n\n";
      content += `📊 Trip Summary\n`;
      content += `   Total Distance: ${formatDistance(totalDistance)}\n`;
      content += `   Total Duration: ${formatDuration(totalDuration)}\n`;
      content += `   Total Stops: ${safeLocations.length}\n`;
      content += `   Days: ${safeDays.length}\n`;
      if (safeFlights.length > 0) content += `   Flights: ${safeFlights.length}\n`;
      if (safeTrains.length > 0) content += `   Trains: ${safeTrains.length}\n`;
      content += "\n";

      if (safeFlights.length > 0) {
        content += `───────────────────────────────────────\n`;
        content += `✈️ FLIGHT DETAILS\n`;
        content += `───────────────────────────────────────\n\n`;
        safeFlights.forEach(flight => {
          content += `   ${flight.flightNumber} — ${flight.airline}\n`;
          content += `   ${flight.departure.iata} ${flight.departure.airport}${flight.departure.city ? ` (${flight.departure.city})` : ""}\n`;
          if (flight.departure.time) content += `      Departure: ${flight.departure.time}\n`;
          content += `   → ${flight.arrival.iata} ${flight.arrival.airport}${flight.arrival.city ? ` (${flight.arrival.city})` : ""}\n`;
          if (flight.arrival.time) content += `      Arrival: ${flight.arrival.time}\n`;
          if (flight.day) content += `      Day: ${flight.day}\n`;
          content += "\n";
        });
      }

      if (safeTrains.length > 0) {
        content += `───────────────────────────────────────\n`;
        content += `🚆 TRAIN DETAILS\n`;
        content += `───────────────────────────────────────\n\n`;
        safeTrains.forEach(train => {
          const typeLabel = train.trainType === "high-speed" ? "High-Speed" : train.trainType === "metro" ? "Metro" : "Train";
          content += `   ${train.trainNumber}${train.operator ? ` — ${train.operator}` : ""} (${typeLabel})\n`;
          content += `   ${train.departure.station}${train.departure.city ? `, ${train.departure.city}` : ""}`;
          if (train.departure.time) content += ` (${train.departure.time})`;
          content += `\n`;
          content += `   → ${train.arrival.station}${train.arrival.city ? `, ${train.arrival.city}` : ""}`;
          if (train.arrival.time) content += ` (${train.arrival.time})`;
          content += `\n`;
          if (train.day) content += `      Day: ${train.day}\n`;
          content += "\n";
        });
      }

      sortedDays.forEach(day => {
        const dayLocations = locationsByDay[day] || [];
        if (dayLocations.length === 0) return;
        
        // Calculate day stats
        let dayDistance = 0;
        let dayDuration = 0;
        dayLocations.forEach((loc, idx) => {
          if (!loc) return;
          const route = getRouteToNext(loc, dayLocations, idx);
          if (route) {
            dayDistance += route.distance || 0;
            dayDuration += route.duration || 0;
          }
        });

        const textDayFlights = safeFlights.filter(f => f.day === day);
        const textDayTrains = safeTrains.filter(t => t.day === day);

        content += `───────────────────────────────────────\n`;
        content += `📅 DAY ${day}\n`;
        content += `   Distance: ${formatDistance(dayDistance)} | Duration: ${formatDuration(dayDuration)}\n`;
        content += `───────────────────────────────────────\n\n`;

        if (textDayFlights.length > 0) {
          textDayFlights.forEach(fl => {
            content += `   ✈️ ${fl.flightNumber} — ${fl.airline}\n`;
            content += `      ${fl.departure.iata} ${fl.departure.airport}${fl.departure.city ? ` (${fl.departure.city})` : ""}${fl.departure.time ? ` ${fl.departure.time}` : ""}\n`;
            content += `      → ${fl.arrival.iata} ${fl.arrival.airport}${fl.arrival.city ? ` (${fl.arrival.city})` : ""}${fl.arrival.time ? ` ${fl.arrival.time}` : ""}\n`;
            if (fl.aircraft) content += `      Aircraft: ${fl.aircraft}\n`;
            if (fl.duration) content += `      Duration: ${formatDuration(fl.duration)}\n`;
            content += "\n";
          });
        }

        if (textDayTrains.length > 0) {
          textDayTrains.forEach(tr => {
            content += `   🚆 ${tr.trainNumber}${tr.operator ? ` — ${tr.operator}` : ""}\n`;
            content += `      ${tr.departure.station}${tr.departure.time ? ` (${tr.departure.time})` : ""}\n`;
            content += `      → ${tr.arrival.station}${tr.arrival.time ? ` (${tr.arrival.time})` : ""}\n`;
            if (tr.duration) content += `      Duration: ${formatDuration(tr.duration)}\n`;
            content += "\n";
          });
        }

        dayLocations.forEach((location, index) => {
          if (!location) return;
          
          const globalIndex = safeLocations.findIndex(l => l && l.id === location.id) + 1;
          const route = getRouteToNext(location, dayLocations, index);
          const isLast = index === dayLocations.length - 1;

          const locationName = location.name ? location.name.split(",")[0] : "Unknown Location";
          content += `   ${globalIndex > 0 ? globalIndex : ''}. ${locationName}\n`;
          if (location.description) {
            content += `      ${location.description}\n`;
          }
          if (location.address) {
            content += `      📍 ${location.address}\n`;
          }
          content += `      Type: ${location.type || "Location"}\n`;
          if (location.coordinates?.lat && location.coordinates?.lng) {
            content += `      Coordinates: ${location.coordinates.lat.toFixed(4)}, ${location.coordinates.lng.toFixed(4)}\n`;
          }

          if (route && !isLast) {
            if (route.isFlight && route.flightInfo) {
              const fl = route.flightInfo;
              content += `\n      ✈️ ${fl.flightNumber} — ${fl.airline}\n`;
              content += `         ${fl.departure.iata} ${fl.departure.airport}${fl.departure.time ? ` (${fl.departure.time})` : ""}`;
              content += ` → ${fl.arrival.iata} ${fl.arrival.airport}${fl.arrival.time ? ` (${fl.arrival.time})` : ""}\n`;
              content += `         ${formatDistance(route.distance)} • ${formatDuration(route.duration)}\n\n`;
            } else {
              const emoji = route.isFlight ? "✈️" : "↓";
              content += `\n      ${emoji} ${formatDistance(route.distance)} (${formatDuration(route.duration)})\n\n`;
            }
          } else if (isLast) {
            // Check for cross-day route to next day's first location
            const nextDayFirstLoc = getFirstLocationOfNextDay(day);
            if (nextDayFirstLoc) {
              const crossDayRoute = getRouteBetween(location, nextDayFirstLoc);
              if (crossDayRoute) {
                const emoji = crossDayRoute.isFlight ? "✈️" : "🌙";
                const currentDayIndex = sortedDays.indexOf(day);
                const nextDay = currentDayIndex >= 0 && currentDayIndex < sortedDays.length - 1 ? sortedDays[currentDayIndex + 1] : null;
                if (nextDay) {
                  content += `\n      ${emoji} To Day ${nextDay}: ${formatDistance(crossDayRoute.distance)} (${formatDuration(crossDayRoute.duration)})\n`;
                }
              }
            }
            content += "\n";
          } else {
            content += "\n";
          }
        });

        content += "\n";
      });

      content += "═══════════════════════════════════════\n";
      content += "  Generated by Voyage AI Trip Planner\n";
      content += "═══════════════════════════════════════\n";

      return content;
    } catch (error) {
      console.error("Error generating text content:", error);
      return "Error generating itinerary. Please try again.";
    }
  }, [safeLocations, sortedDays, locationsByDay, totalDistance, totalDuration, getRouteToNext, getRouteBetween, getFirstLocationOfNextDay, safeDays, safeFlights, safeTrains]);

  // Generate HTML content for printing (memoized)
  const generateHTMLContent = useCallback(() => {
    try {
      // Check if we're in a browser environment
      if (typeof document === 'undefined') {
        return "<html><body><h1>Export not available in this environment</h1></body></html>";
      }

      // Escape HTML to prevent XSS
      const escapeHtml = (text: string) => {
        if (!text) return '';
        try {
          const div = document.createElement('div');
          div.textContent = String(text);
          return div.innerHTML;
        } catch (e) {
          return String(text).replace(/[&<>"']/g, (m) => {
            const map: Record<string, string> = {
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;'
            };
            return map[m] || m;
          });
        }
      };

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Trip Itinerary - Voyage AI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #6366f1; }
    .header h1 { color: #6366f1; font-size: 28px; margin-bottom: 5px; }
    .header p { color: #666; }
    .summary { display: flex; justify-content: center; gap: 30px; margin-bottom: 30px; padding: 15px; background: #f8f9fa; border-radius: 10px; }
    .summary-item { text-align: center; }
    .summary-item .value { font-size: 24px; font-weight: bold; color: #6366f1; }
    .summary-item .label { font-size: 12px; color: #666; }
    .day { margin-bottom: 30px; page-break-inside: avoid; }
    .day-header { padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; color: white; display: flex; justify-content: space-between; align-items: center; }
    .day-header h2 { font-size: 18px; }
    .day-header .stats { font-size: 12px; opacity: 0.9; }
    .location { padding: 15px; border-left: 3px solid #ddd; margin-left: 20px; margin-bottom: 10px; }
    .location-header { display: flex; align-items: center; gap: 10px; margin-bottom: 5px; }
    .location-number { width: 28px; height: 28px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; }
    .location-name { font-weight: 600; font-size: 16px; }
    .location-type { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #f0f0f0; color: #666; }
    .location-desc { color: #666; font-size: 13px; margin: 5px 0 5px 38px; }
    .location-address { color: #8b5cf6; font-size: 12px; margin-left: 38px; }
    .route-info { margin: 10px 0 10px 38px; padding: 8px 12px; background: #f8f9fa; border-radius: 6px; font-size: 12px; color: #666; display: inline-block; }
    .route-info strong { color: #333; }
    .transport-section { margin-bottom: 30px; }
    .transport-section h2 { font-size: 18px; color: #6366f1; margin-bottom: 15px; }
    .transport-card { padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; background: #fafbfc; }
    .transport-card .flight-num { font-weight: 700; font-size: 15px; color: #333; }
    .transport-card .airline { color: #6366f1; font-size: 13px; margin-left: 8px; }
    .transport-card .leg { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px; color: #555; }
    .transport-card .leg .arrow { color: #6366f1; font-weight: bold; }
    .transport-card .meta { font-size: 11px; color: #888; margin-top: 4px; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
    @media print { body { padding: 0; } .day { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>✈️ Trip Itinerary</h1>
    <p>Generated by Voyage AI Trip Planner</p>
  </div>

  <div class="summary">
    <div class="summary-item">
      <div class="value">${escapeHtml(formatDistance(totalDistance))}</div>
      <div class="label">Total Distance</div>
    </div>
    <div class="summary-item">
      <div class="value">${escapeHtml(formatDuration(totalDuration))}</div>
      <div class="label">Total Duration</div>
    </div>
    <div class="summary-item">
      <div class="value">${safeLocations.length}</div>
      <div class="label">Stops</div>
    </div>
    <div class="summary-item">
      <div class="value">${safeDays.length}</div>
      <div class="label">Days</div>
    </div>
  </div>

  ${safeFlights.length > 0 ? `
  <div class="transport-section">
    <h2>✈️ Flight Details</h2>
    ${safeFlights.map(flight => `
      <div class="transport-card">
        <span class="flight-num">${escapeHtml(flight.flightNumber)}</span>
        <span class="airline">${escapeHtml(flight.airline)}</span>
        ${flight.day ? `<span class="meta" style="float:right">Day ${flight.day}</span>` : ""}
        <div class="leg">
          <span><strong>${escapeHtml(flight.departure.iata)}</strong> ${escapeHtml(flight.departure.airport)}${flight.departure.city ? ` (${escapeHtml(flight.departure.city)})` : ""}</span>
          ${flight.departure.time ? `<span class="meta">${escapeHtml(flight.departure.time)}</span>` : ""}
        </div>
        <div class="leg">
          <span class="arrow">→</span>
          <span><strong>${escapeHtml(flight.arrival.iata)}</strong> ${escapeHtml(flight.arrival.airport)}${flight.arrival.city ? ` (${escapeHtml(flight.arrival.city)})` : ""}</span>
          ${flight.arrival.time ? `<span class="meta">${escapeHtml(flight.arrival.time)}</span>` : ""}
        </div>
        ${flight.aircraft ? `<div class="meta">Aircraft: ${escapeHtml(flight.aircraft)}</div>` : ""}
        ${flight.duration ? `<div class="meta">Duration: ${escapeHtml(formatDuration(flight.duration))}</div>` : ""}
      </div>
    `).join("")}
  </div>` : ""}

  ${safeTrains.length > 0 ? `
  <div class="transport-section">
    <h2>🚆 Train Details</h2>
    ${safeTrains.map(train => {
      const typeLabel = train.trainType === "high-speed" ? "High-Speed" : train.trainType === "metro" ? "Metro" : "Train";
      return `
      <div class="transport-card">
        <span class="flight-num">${escapeHtml(train.trainNumber)}</span>
        ${train.operator ? `<span class="airline">${escapeHtml(train.operator)}</span>` : ""}
        <span class="meta" style="margin-left:8px">(${escapeHtml(typeLabel)})</span>
        ${train.day ? `<span class="meta" style="float:right">Day ${train.day}</span>` : ""}
        <div class="leg">
          <span>${escapeHtml(train.departure.station)}${train.departure.city ? `, ${escapeHtml(train.departure.city)}` : ""}</span>
          ${train.departure.time ? `<span class="meta">${escapeHtml(train.departure.time)}</span>` : ""}
        </div>
        <div class="leg">
          <span class="arrow">→</span>
          <span>${escapeHtml(train.arrival.station)}${train.arrival.city ? `, ${escapeHtml(train.arrival.city)}` : ""}</span>
          ${train.arrival.time ? `<span class="meta">${escapeHtml(train.arrival.time)}</span>` : ""}
        </div>
        ${train.duration ? `<div class="meta">Duration: ${escapeHtml(formatDuration(train.duration))}</div>` : ""}
      </div>`;
    }).join("")}
  </div>` : ""}

  ${sortedDays.map(day => {
    const dayLocations = locationsByDay[day] || [];
    if (dayLocations.length === 0) return '';
    
    const dayColor = getDayColor(day).bg;
    
    // Calculate day stats
    let dayDistance = 0;
    let dayDuration = 0;
    dayLocations.forEach((loc, idx) => {
      if (idx < dayLocations.length - 1) {
        const route = getRouteBetween(loc, dayLocations[idx + 1]);
        if (route) {
          dayDistance += route.distance || 0;
          dayDuration += route.duration || 0;
        }
      }
    });

    const dayFlights = safeFlights.filter(f => f.day === day);
    const dayTrains = safeTrains.filter(t => t.day === day);

    return `
    <div class="day">
      <div class="day-header" style="background: ${dayColor}">
        <h2>📅 Day ${day}</h2>
        <div class="stats">${escapeHtml(formatDistance(dayDistance))} • ${escapeHtml(formatDuration(dayDuration))}${dayFlights.length > 0 ? ` • ${dayFlights.length} flight${dayFlights.length > 1 ? 's' : ''}` : ""}${dayTrains.length > 0 ? ` • ${dayTrains.length} train${dayTrains.length > 1 ? 's' : ''}` : ""}</div>
      </div>
      ${dayFlights.length > 0 ? dayFlights.map(fl => `
        <div style="margin: 0 20px 10px; padding: 10px 14px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; font-size: 13px;">
          <div>✈️ <strong>${escapeHtml(fl.flightNumber)}</strong> — ${escapeHtml(fl.airline)}</div>
          <div style="color:#555; margin-top:3px">
            <strong>${escapeHtml(fl.departure.iata)}</strong> ${escapeHtml(fl.departure.airport)}${fl.departure.city ? ` (${escapeHtml(fl.departure.city)})` : ""}${fl.departure.time ? ` ${escapeHtml(fl.departure.time)}` : ""}
            → <strong>${escapeHtml(fl.arrival.iata)}</strong> ${escapeHtml(fl.arrival.airport)}${fl.arrival.city ? ` (${escapeHtml(fl.arrival.city)})` : ""}${fl.arrival.time ? ` ${escapeHtml(fl.arrival.time)}` : ""}
          </div>
          ${fl.aircraft || fl.duration ? `<div style="color:#888; font-size:11px; margin-top:2px">${fl.aircraft ? `Aircraft: ${escapeHtml(fl.aircraft)}` : ""}${fl.aircraft && fl.duration ? " • " : ""}${fl.duration ? `Duration: ${escapeHtml(formatDuration(fl.duration))}` : ""}</div>` : ""}
        </div>
      `).join("") : ""}
      ${dayTrains.length > 0 ? dayTrains.map(tr => `
        <div style="margin: 0 20px 10px; padding: 10px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 13px;">
          <div>🚆 <strong>${escapeHtml(tr.trainNumber)}</strong>${tr.operator ? ` — ${escapeHtml(tr.operator)}` : ""}</div>
          <div style="color:#555; margin-top:3px">
            ${escapeHtml(tr.departure.station)}${tr.departure.time ? ` (${escapeHtml(tr.departure.time)})` : ""}
            → ${escapeHtml(tr.arrival.station)}${tr.arrival.time ? ` (${escapeHtml(tr.arrival.time)})` : ""}
          </div>
        </div>
      `).join("") : ""}
      ${dayLocations.map((location, index) => {
        if (!location) return '';
        
        const globalIndex = locations.findIndex(l => l.id === location.id) + 1;
        const route = index < dayLocations.length - 1 ? getRouteBetween(location, dayLocations[index + 1]) : null;
        const isLast = index === dayLocations.length - 1;
        
        // Check for cross-day route if this is the last location
        let crossDayHtml = "";
        if (isLast) {
          const currentIndex = sortedDays.indexOf(day);
          if (currentIndex < sortedDays.length - 1) {
            const nextDay = sortedDays[currentIndex + 1];
            const nextDayLocs = locationsByDay[nextDay] || [];
            if (nextDayLocs.length > 0 && nextDayLocs[0]) {
              const crossDayRoute = getRouteBetween(location, nextDayLocs[0]);
              if (crossDayRoute) {
                crossDayHtml = `
                  <div class="route-info" style="background: linear-gradient(to right, ${dayColor}22, #6366f122); border: 1px dashed ${dayColor}">
                    🌙 To Day ${nextDay}: <strong>${escapeHtml(formatDistance(crossDayRoute.distance))}</strong> (${escapeHtml(formatDuration(crossDayRoute.duration))})
                  </div>
                `;
              }
            }
          }
        }

        const locationName = location.name ? escapeHtml(location.name.split(",")[0]) : 'Unknown Location';
        const locationDesc = location.description ? `<div class="location-desc">${escapeHtml(location.description)}</div>` : "";
        const locationAddr = location.address ? `<div class="location-address">📍 ${escapeHtml(location.address)}</div>` : "";
        
        let routeHtml = crossDayHtml;
        if (route && !isLast) {
          if (route.isFlight && route.flightInfo) {
            const fl = route.flightInfo;
            routeHtml = `
              <div class="route-info" style="background: #eef2ff; border: 1px solid #c7d2fe;">
                <div style="margin-bottom:4px">
                  ✈️ <strong>${escapeHtml(fl.flightNumber)}</strong> — ${escapeHtml(fl.airline)}
                </div>
                <div style="font-size:12px; color:#555">
                  ${escapeHtml(fl.departure.iata)} ${escapeHtml(fl.departure.airport)}${fl.departure.time ? ` (${escapeHtml(fl.departure.time)})` : ""}
                  → ${escapeHtml(fl.arrival.iata)} ${escapeHtml(fl.arrival.airport)}${fl.arrival.time ? ` (${escapeHtml(fl.arrival.time)})` : ""}
                </div>
                <div style="font-size:11px; color:#888; margin-top:2px">
                  ${escapeHtml(formatDistance(route.distance))} • ${escapeHtml(formatDuration(route.duration))}
                </div>
              </div>`;
          } else if (route.isFlight) {
            routeHtml = `
              <div class="route-info" style="background: #eef2ff; border: 1px solid #c7d2fe;">
                ✈️ Flight: <strong>${escapeHtml(formatDistance(route.distance))}</strong> (${escapeHtml(formatDuration(route.duration))})
              </div>`;
          } else {
            routeHtml = `
              <div class="route-info">
                ↓ <strong>${escapeHtml(formatDistance(route.distance))}</strong> (${escapeHtml(formatDuration(route.duration))})
              </div>`;
          }
        }

        return `
        <div class="location" style="border-left-color: ${dayColor}">
          <div class="location-header">
            <div class="location-number" style="background: ${dayColor}">${globalIndex > 0 ? globalIndex : ''}</div>
            <span class="location-name">${locationName}</span>
            <span class="location-type">${escapeHtml(location.type || "Location")}</span>
          </div>
          ${locationDesc}
          ${locationAddr}
          ${routeHtml}
        </div>
        `;
      }).join("")}
    </div>
    `;
  }).join("")}

  <div class="footer">
    Generated on ${new Date().toLocaleDateString()} by Voyage AI Trip Planner
  </div>
</body>
</html>
    `;
    } catch (error) {
      console.error("Error generating HTML content:", error);
      return "<html><body><h1>Error generating itinerary</h1></body></html>";
    }
  }, [locations, sortedDays, locationsByDay, totalDistance, totalDuration, getRouteBetween, safeFlights, safeTrains]);

  // Copy to clipboard
  const handleCopyText = useCallback(async () => {
    try {
      const content = generateTextContent();
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }, [generateTextContent]);

  // Download as text file
  const handleDownloadText = useCallback(() => {
    try {
      if (typeof document === 'undefined' || typeof URL === 'undefined') {
        console.error("Browser APIs not available");
        return;
      }
      
      const content = generateTextContent();
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trip-itinerary-${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download text file:", error);
      alert("Failed to download text file. Please check the browser console for details.");
    }
  }, [generateTextContent]);

  // Open print preview with HTML
  const handlePrint = useCallback(() => {
    try {
      if (typeof window === 'undefined') {
        console.error("Window object not available");
        return;
      }
      
      const htmlContent = generateHTMLContent();
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          try {
            printWindow.print();
          } catch (printError) {
            console.error("Failed to print:", printError);
            alert("Failed to open print dialog. Please try downloading as HTML instead.");
          }
        }, 250);
      } else {
        alert("Please allow pop-ups for this site to use the print feature.");
      }
    } catch (error) {
      console.error("Failed to open print window:", error);
      alert("Failed to open print window. Please try downloading as HTML instead.");
    }
  }, [generateHTMLContent]);

  // Download as HTML file
  const handleDownloadHTML = useCallback(() => {
    try {
      if (typeof document === 'undefined' || typeof URL === 'undefined') {
        console.error("Browser APIs not available");
        return;
      }
      
      const htmlContent = generateHTMLContent();
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trip-itinerary-${new Date().toISOString().split("T")[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download HTML file:", error);
      alert("Failed to download HTML file. Please check the browser console for details.");
    }
  }, [generateHTMLContent]);

  // Early return AFTER all hooks have been called
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center">
              <Download className="size-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">Export Itinerary</h2>
              <p className="text-xs text-muted-foreground">Download your trip plan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="p-4 bg-accent/30">
          <div className={`grid gap-2 text-center ${safeFlights.length > 0 || safeTrains.length > 0 ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <div>
              <div className="text-lg font-bold text-primary">{safeDays.length}</div>
              <div className="text-[10px] text-muted-foreground">Days</div>
            </div>
            <div>
              <div className="text-lg font-bold text-primary">{safeLocations.length}</div>
              <div className="text-[10px] text-muted-foreground">Stops</div>
            </div>
            {(safeFlights.length > 0 || safeTrains.length > 0) && (
              <div>
                <div className="text-lg font-bold text-primary">
                  {safeFlights.length > 0 ? `${safeFlights.length}✈` : ""}
                  {safeFlights.length > 0 && safeTrains.length > 0 ? " " : ""}
                  {safeTrains.length > 0 ? `${safeTrains.length}🚆` : ""}
                </div>
                <div className="text-[10px] text-muted-foreground">Transport</div>
              </div>
            )}
            <div>
              <div className="text-lg font-bold text-primary">{formatDistance(totalDistance)}</div>
              <div className="text-[10px] text-muted-foreground">Distance</div>
            </div>
            <div>
              <div className="text-lg font-bold text-primary">{formatDuration(totalDuration)}</div>
              <div className="text-[10px] text-muted-foreground">Duration</div>
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">Choose export format:</p>
          
          {/* Print / PDF */}
          <button
            onClick={handlePrint}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors text-left"
          >
            <div className="size-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Printer className="size-5 text-red-500" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Print / Save as PDF</div>
              <div className="text-xs text-muted-foreground">Beautiful formatted itinerary with day colors</div>
            </div>
          </button>

          {/* Download HTML */}
          <button
            onClick={handleDownloadHTML}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors text-left"
          >
            <div className="size-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="size-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Download HTML</div>
              <div className="text-xs text-muted-foreground">Open in browser, can print to PDF</div>
            </div>
          </button>

          {/* Download Text */}
          <button
            onClick={handleDownloadText}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors text-left"
          >
            <div className="size-10 rounded-lg bg-gray-500/10 flex items-center justify-center">
              <FileText className="size-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Download Text</div>
              <div className="text-xs text-muted-foreground">Plain text format, easy to share</div>
            </div>
          </button>

          {/* Copy to Clipboard */}
          <button
            onClick={handleCopyText}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors text-left"
          >
            <div className="size-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              {copied ? (
                <CheckCircle className="size-5 text-green-500" />
              ) : (
                <Copy className="size-5 text-violet-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">
                {copied ? "Copied!" : "Copy to Clipboard"}
              </div>
              <div className="text-xs text-muted-foreground">Paste into any app or document</div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 bg-accent/20">
          <Button variant="outline" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

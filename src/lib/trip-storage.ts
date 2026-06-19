import type { SavedTrip } from "@/types/trip";

export const SAVED_TRIPS_KEY = "voyageai_saved_trips";
export const ACTIVE_TRIP_ID_KEY = "voyageai_active_trip_id";

export function loadSavedTrips(): SavedTrip[] {
  try {
    const raw = localStorage.getItem(SAVED_TRIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedTrip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedTrips(trips: SavedTrip[]): void {
  try {
    localStorage.setItem(SAVED_TRIPS_KEY, JSON.stringify(trips));
  } catch {
    /* quota exceeded */
  }
}

export function loadActiveTripId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TRIP_ID_KEY);
  } catch {
    return null;
  }
}

export function persistActiveTripId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_TRIP_ID_KEY, id);
    else localStorage.removeItem(ACTIVE_TRIP_ID_KEY);
  } catch {
    /* ignore */
  }
}

export function upsertSavedTrip(trips: SavedTrip[], trip: SavedTrip): SavedTrip[] {
  const idx = trips.findIndex((t) => t.id === trip.id);
  if (idx >= 0) {
    const next = [...trips];
    next[idx] = trip;
    return next;
  }
  return [trip, ...trips];
}

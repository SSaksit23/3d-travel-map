import type { TripLocation } from "@/types/trip";

/** Sort stops by day, then order within each day (matches route calculation). */
export function sortLocationsByDayOrder(locs: TripLocation[]): TripLocation[] {
  return [...locs].sort((a, b) => {
    const dayA = a.day || 1;
    const dayB = b.day || 1;
    if (dayA !== dayB) return dayA - dayB;
    return (a.order || 0) - (b.order || 0);
  });
}

/** Reassign sequential order numbers within each day. */
export function normalizeLocationOrders(locs: TripLocation[]): TripLocation[] {
  const orderByDay = new Map<number, number>();
  return sortLocationsByDayOrder(locs).map((loc) => {
    const day = loc.day || 1;
    const order = orderByDay.get(day) ?? 0;
    orderByDay.set(day, order + 1);
    return { ...loc, order };
  });
}

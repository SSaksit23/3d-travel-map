/**
 * Haversine Distance Tool
 * Straight-line distance fallback when no routing API is available.
 */

import { toolRegistry } from "./registry";
import type { RouteInput, RouteOutput } from "./ors-route";

async function handler(args: RouteInput): Promise<RouteOutput> {
  const R = 6371;
  const dLat = ((args.to.lat - args.from.lat) * Math.PI) / 180;
  const dLng = ((args.to.lng - args.from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((args.from.lat * Math.PI) / 180) *
      Math.cos((args.to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const directKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const roadKm = directKm * 1.4;

  return {
    distanceKm: roadKm,
    durationMinutes: (roadKm / 60) * 60,
    pathCoordinates: [
      [args.from.lng, args.from.lat],
      [args.to.lng, args.to.lat],
    ],
  };
}

toolRegistry.register<RouteInput, RouteOutput>({
  name: "haversine",
  toolset: "routing",
  schema: {
    description: "Estimate distance using Haversine formula (straight-line fallback)",
    input: { from: "{lat,lng}", to: "{lat,lng}" },
    output: "{ distanceKm, durationMinutes, pathCoordinates }",
  },
  handler,
});

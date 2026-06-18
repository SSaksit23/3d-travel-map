/**
 * OSRM Routing Tool
 * Road routing via the public OSRM demo server (no API key needed).
 */

import { toolRegistry } from "./registry";
import type { RouteInput, RouteOutput } from "./ors-route";

async function handler(args: RouteInput): Promise<RouteOutput> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${args.from.lng},${args.from.lat};${args.to.lng},${args.to.lat}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    );

    if (!resp.ok) throw new Error(`OSRM HTTP ${resp.status}`);

    const data = await resp.json();
    const route = data.routes?.[0];
    if (!route) throw new Error("No route in OSRM response");

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
      pathCoordinates: route.geometry?.coordinates ?? [
        [args.from.lng, args.from.lat],
        [args.to.lng, args.to.lat],
      ],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

toolRegistry.register<RouteInput, RouteOutput>({
  name: "osrm_route",
  toolset: "routing",
  schema: {
    description: "Calculate a driving route via public OSRM server",
    input: { from: "{lat,lng}", to: "{lat,lng}" },
    output: "{ distanceKm, durationMinutes, pathCoordinates }",
  },
  handler,
});

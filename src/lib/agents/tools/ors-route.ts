/**
 * OpenRouteService Routing Tool
 * Road routing via the ORS API (requires OPENROUTESERVICE_API_KEY).
 */

import { toolRegistry } from "./registry";

export interface RouteInput {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  profile?: string;
}

export interface RouteOutput {
  distanceKm: number;
  durationMinutes: number;
  pathCoordinates: [number, number][];
}

async function handler(args: RouteInput): Promise<RouteOutput> {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key || key === "your_openrouteservice_api_key_here") {
    throw new Error("OPENROUTESERVICE_API_KEY not set");
  }

  const profile = args.profile ?? "driving-car";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const resp = await fetch(
      `https://api.openrouteservice.org/v2/directions/${profile}?api_key=${key}&start=${args.from.lng},${args.from.lat}&end=${args.to.lng},${args.to.lat}`,
      { signal: controller.signal }
    );

    if (resp.status === 429) {
      toolRegistry.disable("ors_route");
      setTimeout(() => toolRegistry.enable("ors_route"), 60000);
      throw new Error("Rate limited — disabled for 60s");
    }

    if (!resp.ok) throw new Error(`ORS HTTP ${resp.status}`);

    const data = await resp.json();
    const seg = data.features?.[0]?.properties?.segments?.[0];
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!seg) throw new Error("No route segment in ORS response");

    return {
      distanceKm: seg.distance / 1000,
      durationMinutes: seg.duration / 60,
      pathCoordinates: coords ?? [[args.from.lng, args.from.lat], [args.to.lng, args.to.lat]],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

toolRegistry.register<RouteInput, RouteOutput>({
  name: "ors_route",
  toolset: "routing",
  schema: {
    description: "Calculate a driving route via OpenRouteService",
    input: { from: "{lat,lng}", to: "{lat,lng}", profile: "string?" },
    output: "{ distanceKm, durationMinutes, pathCoordinates }",
  },
  handler,
  checkFn: () => {
    const key = process.env.OPENROUTESERVICE_API_KEY;
    return !!key && key !== "your_openrouteservice_api_key_here";
  },
});

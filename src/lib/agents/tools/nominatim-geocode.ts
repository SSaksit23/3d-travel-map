/**
 * Nominatim Geocoding Tool
 * Looks up GPS coordinates using OpenStreetMap's Nominatim service.
 */

import { toolRegistry } from "./registry";

export interface NominatimInput {
  query: string;
  city?: string;
  countrycodes?: string;
  acceptLanguage?: string;
}

export interface NominatimOutput {
  lat: number;
  lng: number;
  displayName: string;
  type: string;
}

async function handler(args: NominatimInput): Promise<NominatimOutput> {
  const cityHint = args.city ? `, ${args.city}` : "";
  const q = `${args.query}${cityHint}`;
  const lang = args.acceptLanguage ?? "en";
  const ccParam = args.countrycodes ? `&countrycodes=${args.countrycodes}` : "";

  const resp = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=3&accept-language=${lang}${ccParam}`,
    { headers: { "User-Agent": "TripPlannerApp/1.0" } }
  );

  if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
  const results = await resp.json();
  if (!results.length) throw new Error(`No results for "${q}"`);

  const r = results[0];
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (lat === 0 && lng === 0) throw new Error("Returned 0,0 coordinates");

  return { lat, lng, displayName: r.display_name, type: r.type };
}

toolRegistry.register<NominatimInput, NominatimOutput>({
  name: "nominatim_geocode",
  toolset: "geocoding",
  schema: {
    description: "Geocode a place name to GPS coordinates via OpenStreetMap Nominatim",
    input: { query: "string", city: "string?", acceptLanguage: "string?" },
    output: "{ lat, lng, displayName, type }",
  },
  handler,
});

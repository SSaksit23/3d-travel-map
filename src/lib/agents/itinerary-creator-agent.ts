/**
 * Itinerary Creator Agent (Pipeline Agent 2)
 * Takes raw extracted entities and structures them into a day-by-day itinerary.
 * Uses tool registry for LLM calls, skill cache for known locations.
 */

import { BaseAgent } from "./base-agent";
import { parseJsonFromLLM } from "./parse-json";
import type {
  AgentContext,
  Task,
  TaskResult,
  RawExtractionResult,
  StructuredItinerary,
  ItineraryDay,
} from "./types";

const ITINERARY_PROMPT = `You are a travel itinerary structuring expert.
Given raw extracted travel entities, organize them into a proper day-by-day itinerary.

RULES:
1. Group locations by their assigned day number
2. For each day, determine the main city (use the standard English name)
3. Order attractions logically: morning sights first, lunch, afternoon activities, dinner, evening
4. For EVERY location, provide your best-estimate GPS coordinates (lat/lng). Coordinates will be verified later, so focus on getting the correct, specific, internationally-recognized name for each place.
5. Use the well-known English name for each location. For Chinese locations, include the Chinese characters in parentheses, e.g. "Mogao Caves (莫高窟)".
6. Assign a timeSlot to each location: "morning", "afternoon", or "evening"
7. Keep the original day assignments from the input; only reorder within each day
8. NEVER use round numbers for coordinates (e.g. 102.0, 30.0). Always include precise decimal places.

RAW ENTITIES:
`;

const ITINERARY_OUTPUT_FORMAT = `

OUTPUT STRICT JSON (no markdown, no explanation):
{
  "days": [
    {
      "dayNumber": 1,
      "city": "Main City for This Day",
      "locations": [
        {
          "name": "Location Name",
          "type": "city|attraction|hotel|restaurant|airport|station|landmark",
          "coordinates": {"lat": 0.0, "lng": 0.0},
          "description": "Brief description",
          "timeSlot": "morning|afternoon|evening",
          "order": 1
        }
      ]
    }
  ],
  "tripType": "multi_city|road_trip|city_tour|day_trip",
  "estimatedDays": 3
}`;

export class ItineraryCreatorAgent extends BaseAgent {
  constructor(context: AgentContext) {
    super(
      {
        name: "ItineraryCreatorAgent",
        goal: "Structure raw entities into a well-organized day-by-day itinerary with coordinates",
        backstory: "Expert travel planner who organizes trips logically with accurate geolocation knowledge.",
        verbose: true,
      },
      context
    );
  }

  async execute(task: Task): Promise<TaskResult<StructuredItinerary>> {
    const startTime = Date.now();
    this.log("Starting itinerary creation");

    try {
      const rawData = this.getPreviousResult<RawExtractionResult>("document-retrieval");
      if (!rawData) {
        return this.error("No raw extraction data available") as TaskResult<StructuredItinerary>;
      }

      // Inject memory context and any cached geocoding hints
      const memoryBlock = this.getMemoryPromptBlock();
      const memoryPrefix = memoryBlock
        ? `\n[Agent Memory]\n${memoryBlock}\n\n`
        : "";

      const entityJson = JSON.stringify({
        locations: rawData.rawLocations,
        estimatedDays: rawData.estimatedDays,
        detectedLanguage: rawData.detectedLanguage,
      });

      const prompt = memoryPrefix + ITINERARY_PROMPT + entityJson + ITINERARY_OUTPUT_FORMAT;
      const responseText = await this.useTool<string>("openai_chat", { prompt });

      const parsed = parseJsonFromLLM(responseText) as Record<string, unknown>;

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const days: ItineraryDay[] = ((parsed.days || []) as any[]).map(
        (day: any) => ({
          dayNumber: typeof day.dayNumber === "number" ? day.dayNumber : 1,
          city: String(day.city || "Unknown"),
          locations: ((day.locations as any[]) || []).map((loc: any, idx: number) => {
            const coordObj = loc.coordinates as any;
            let lat = 0, lng = 0;
            if (coordObj && typeof coordObj.lat === "number") {
              lat = coordObj.lat;
              lng = coordObj.lng;
            }

            // Check skill cache for this location
            const cached = this.lookupCachedGeocode(String(loc.name || ""));
            if (cached) {
              lat = cached.lat;
              lng = cached.lng;
            }

            return {
              name: String(loc.name || ""),
              type: String(loc.type || "attraction"),
              coordinates: { lat, lng },
              description: loc.description ? String(loc.description) : undefined,
              timeSlot: (loc.timeSlot as "morning" | "afternoon" | "evening") || undefined,
              order: typeof loc.order === "number" ? loc.order : idx + 1,
            };
          }),
        })
      );
      /* eslint-enable @typescript-eslint/no-explicit-any */

      for (const day of days) {
        day.locations = day.locations.filter(
          (loc) => loc.coordinates.lat !== 0 || loc.coordinates.lng !== 0
        );
      }

      const itinerary: StructuredItinerary = {
        days,
        tripType: String(parsed.tripType || "day_trip"),
        estimatedDays: typeof parsed.estimatedDays === "number" ? parsed.estimatedDays : rawData.estimatedDays,
        flights: rawData.rawFlights,
        trains: rawData.rawTrains,
      };

      const totalLocations = days.reduce((sum, d) => sum + d.locations.length, 0);
      const elapsed = Date.now() - startTime;
      this.log(`Itinerary created in ${elapsed}ms`, {
        days: days.length,
        totalLocations,
        tripType: itinerary.tripType,
      });

      return this.success(itinerary, elapsed);
    } catch (error) {
      this.log("Itinerary creation failed", error);
      return this.error(`Itinerary creation failed: ${error}`) as TaskResult<StructuredItinerary>;
    }
  }
}

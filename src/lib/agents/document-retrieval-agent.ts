/**
 * Document Retrieval Agent (Pipeline Agent 1)
 * Extracts raw travel entities from documents with multi-language support.
 * Uses tool registry for LLM calls and memory for prompt context.
 */

import { BaseAgent } from "./base-agent";
import { parseJsonFromLLM } from "./parse-json";
import type {
  AgentContext,
  Task,
  TaskResult,
  RawExtractionResult,
  ExtractedTrain,
} from "./types";

const RETRIEVAL_PROMPT = `You are a travel document parser specializing in itinerary extraction.
Extract ALL travel information from this document. The document may be in Chinese, Thai, English, or mixed languages.

CRITICAL RULES:
1. Extract EVERY location, flight, train mentioned — do not skip anything
2. Translate ALL non-English names to their standard international English name (keep original in parentheses). Use the official/most-commonly-used English name, e.g. "Dunhuang (敦煌)", "Mogao Caves (莫高窟)", "Lanzhou (兰州)".
3. Detect day markers: D1, D2, Day 1, Day 2, 第一天, 第二天, วันที่ 1, วันที่ 2, etc.
4. Preserve the sequential order of locations within each day
5. Identify the country/region for each location when possible
6. For the "name" field, always use the form: "English Name (Original Name)" so it can be geocoded accurately

OUTPUT STRICT JSON (no markdown, no explanation):
{
  "rawLocations": [
    {
      "name": "English Name (原名/ชื่อเดิม)",
      "originalName": "原名/ชื่อเดิม",
      "type": "city|attraction|hotel|restaurant|airport|station|landmark",
      "day": 1,
      "order": 1,
      "description": "brief description",
      "country": "country name",
      "region": "province/state"
    }
  ],
  "rawFlights": [
    {
      "flightNumber": "XX123",
      "airline": "Airline Name",
      "departureAirport": "Full Airport Name",
      "departureCode": "XXX",
      "arrivalAirport": "Full Airport Name",
      "arrivalCode": "XXX",
      "departureTime": "HH:MM",
      "arrivalTime": "HH:MM",
      "day": 1
    }
  ],
  "rawTrains": [
    {
      "trainNumber": "G123",
      "trainType": "high-speed|normal|metro|other",
      "departureStation": "Station Name",
      "arrivalStation": "Station Name",
      "departureTime": "HH:MM",
      "arrivalTime": "HH:MM",
      "day": 1
    }
  ],
  "detectedLanguage": "Chinese|Thai|English|Mixed",
  "documentSummary": "Brief 1-sentence summary of the trip",
  "estimatedDays": 3
}

DOCUMENT TEXT:
`;

export class DocumentRetrievalAgent extends BaseAgent {
  constructor(context: AgentContext) {
    super(
      {
        name: "DocumentRetrievalAgent",
        goal: "Extract all travel entities from documents with multi-language translation",
        backstory: "Expert document analyst for travel itineraries in any language.",
        verbose: true,
      },
      context
    );
  }

  async execute(task: Task): Promise<TaskResult<RawExtractionResult>> {
    const startTime = Date.now();
    this.log("Starting document retrieval");

    try {
      const documentText = this.getSharedMemory<string>("documentText");
      const imageData = this.getSharedMemory<{ base64: string; mimeType: string }>("imageData");

      if (!documentText && !imageData) {
        return this.error("No document content available") as TaskResult<RawExtractionResult>;
      }

      // Inject memory context into prompt for agent self-improvement
      const memoryBlock = this.getMemoryPromptBlock();
      const memoryPrefix = memoryBlock
        ? `\n[Agent Memory — use these notes to improve extraction accuracy]\n${memoryBlock}\n\n`
        : "";

      let responseText: string;
      if (imageData) {
        responseText = await this.useTool<string>("openai_chat_image", {
          prompt: memoryPrefix + RETRIEVAL_PROMPT + "\n[Image document — extract all visible travel information]",
          imageBase64: imageData.base64,
          mimeType: imageData.mimeType,
        });
      } else {
        responseText = await this.useTool<string>("openai_chat", {
          prompt: memoryPrefix + RETRIEVAL_PROMPT + documentText!.substring(0, 30000),
        });
      }
      const parsed = parseJsonFromLLM(responseText) as Record<string, unknown>;

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const extraction: RawExtractionResult = {
        rawLocations: ((parsed.rawLocations || parsed.locations || []) as any[]).map(
          (loc: any, idx: number) => ({
            name: String(loc.name || ""),
            originalName: loc.originalName ? String(loc.originalName) : undefined,
            type: String(loc.type || "attraction"),
            day: typeof loc.day === "number" ? loc.day : 1,
            order: typeof loc.order === "number" ? loc.order : idx + 1,
            description: loc.description ? String(loc.description) : undefined,
            country: loc.country ? String(loc.country) : undefined,
            region: loc.region ? String(loc.region) : undefined,
          })
        ),
        rawFlights: ((parsed.rawFlights || parsed.flights || []) as any[]).map(
          (f: any) => ({
            flightNumber: String(f.flightNumber || ""),
            airline: f.airline ? String(f.airline) : undefined,
            departureAirport: f.departureAirport ? String(f.departureAirport) : undefined,
            departureCode: String(f.departureCode || "").toUpperCase(),
            arrivalAirport: f.arrivalAirport ? String(f.arrivalAirport) : undefined,
            arrivalCode: String(f.arrivalCode || "").toUpperCase(),
            departureTime: f.departureTime ? String(f.departureTime) : undefined,
            arrivalTime: f.arrivalTime ? String(f.arrivalTime) : undefined,
            day: typeof f.day === "number" ? f.day : 1,
          })
        ),
        rawTrains: ((parsed.rawTrains || parsed.trains || []) as any[]).map(
          (t: any) => ({
            trainNumber: String(t.trainNumber || ""),
            trainType: (t.trainType as ExtractedTrain["trainType"]) || "normal",
            departureStation: String(t.departureStation || ""),
            arrivalStation: String(t.arrivalStation || ""),
            departureTime: t.departureTime ? String(t.departureTime) : undefined,
            arrivalTime: t.arrivalTime ? String(t.arrivalTime) : undefined,
            day: typeof t.day === "number" ? t.day : 1,
          })
        ),
        rawDates: Array.from(
          new Set(
            ((parsed.rawLocations || parsed.locations || []) as any[]).map(
              (l: any) => (typeof l.day === "number" ? l.day : 1)
            )
          )
        ).sort((a: number, b: number) => a - b),
        detectedLanguage: String(parsed.detectedLanguage || "Unknown"),
        documentSummary: String(parsed.documentSummary || "Travel itinerary"),
        estimatedDays: typeof parsed.estimatedDays === "number" ? parsed.estimatedDays : 1,
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const elapsed = Date.now() - startTime;
      this.log(`Retrieval complete in ${elapsed}ms`, {
        locations: extraction.rawLocations.length,
        flights: extraction.rawFlights.length,
        trains: extraction.rawTrains.length,
        language: extraction.detectedLanguage,
      });

      return this.success(extraction, elapsed);
    } catch (error) {
      this.log("Document retrieval failed", error);
      return this.error(`Document retrieval failed: ${error}`) as TaskResult<RawExtractionResult>;
    }
  }
}

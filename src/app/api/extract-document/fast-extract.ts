/**
 * Fast Document Extraction
 * Single Gemini API call for quick extraction
 * Optimized for English, Chinese, and Thai documents
 */

import { parseJsonFromLLM } from "@/lib/agents/parse-json";
import { chatCompletion, chatCompletionWithImage } from "@/lib/agents/openai-client";

interface ExtractedLocation {
  name: string;
  englishName: string;
  type: "city" | "attraction" | "hotel" | "airport" | "station";
  day: number;
  coordinates?: { lat: number; lng: number };
  description?: string;
}

interface ExtractedFlight {
  flightNumber: string;
  airline: string;
  departure: { airport: string; city: string; time?: string };
  arrival: { airport: string; city: string; time?: string };
  day: number;
}

interface ExtractedTrain {
  trainNumber?: string;
  departure: { station: string; city: string; time?: string };
  arrival: { station: string; city: string; time?: string };
  day: number;
}

export interface FastExtractionResult {
  locations: ExtractedLocation[];
  flights: ExtractedFlight[];
  trains: ExtractedTrain[];
  estimatedDays: number;
  tripType: string;
  detectedLanguage: string;
}

const EXTRACTION_PROMPT = `You are a travel document parser. Extract ALL travel information from this document.

IMPORTANT RULES:
1. Extract EVERY location, flight, train mentioned
2. Detect day markers: D1, D2, Day 1, Day 2, 第一天, 第二天, วันที่ 1, วันที่ 2, etc.
3. Translate ALL non-English names to English (keep original in parentheses)
4. Include coordinates if you know them (major cities/attractions)
5. Preserve the order of locations within each day

OUTPUT STRICT JSON (no markdown, no explanation):
{
  "locations": [
    {
      "name": "English Name (原名/ชื่อเดิม)",
      "englishName": "English Name Only",
      "type": "city|attraction|hotel|airport|station",
      "day": 1,
      "coordinates": {"lat": 0.0, "lng": 0.0},
      "description": "brief description"
    }
  ],
  "flights": [
    {
      "flightNumber": "XX123",
      "airline": "Airline Name",
      "departure": {"airport": "Code", "city": "City", "time": "HH:MM"},
      "arrival": {"airport": "Code", "city": "City", "time": "HH:MM"},
      "day": 1
    }
  ],
  "trains": [
    {
      "trainNumber": "G123",
      "departure": {"station": "Station", "city": "City", "time": "HH:MM"},
      "arrival": {"station": "Station", "city": "City", "time": "HH:MM"},
      "day": 1
    }
  ],
  "estimatedDays": 3,
  "tripType": "multi_city|road_trip|city_tour|day_trip",
  "detectedLanguage": "Thai|Chinese|English|Mixed"
}

DOCUMENT TEXT:
`;

export async function fastExtract(
  text: string,
  _apiKey?: string
): Promise<FastExtractionResult> {
  const startTime = Date.now();
  console.log("[FastExtract] Starting extraction...");

  const prompt = EXTRACTION_PROMPT + text.substring(0, 30000);

  try {
    const responseText = await chatCompletion(prompt);
    
    const parsed = parseJsonFromLLM(responseText) as FastExtractionResult;
    
    const elapsed = Date.now() - startTime;
    console.log(`[FastExtract] Complete in ${elapsed}ms:`, {
      locations: parsed.locations?.length || 0,
      flights: parsed.flights?.length || 0,
      trains: parsed.trains?.length || 0,
    });

    return {
      locations: parsed.locations || [],
      flights: parsed.flights || [],
      trains: parsed.trains || [],
      estimatedDays: parsed.estimatedDays || 1,
      tripType: parsed.tripType || "day_trip",
      detectedLanguage: parsed.detectedLanguage || "Unknown",
    };
  } catch (error) {
    console.error("[FastExtract] Error:", error);
    throw error;
  }
}

/**
 * Fast image extraction using Gemini Vision
 */
export async function fastExtractFromImage(
  imageBase64: string,
  mimeType: string,
  _apiKey?: string
): Promise<FastExtractionResult> {
  const startTime = Date.now();
  console.log("[FastExtract] Starting image extraction...");

  try {
    const responseText = await chatCompletionWithImage(
      EXTRACTION_PROMPT + "\n[Image document - extract all visible travel information]",
      imageBase64,
      mimeType
    );
    
    const parsed = parseJsonFromLLM(responseText) as FastExtractionResult;
    
    const elapsed = Date.now() - startTime;
    console.log(`[FastExtract] Image extraction complete in ${elapsed}ms`);

    return {
      locations: parsed.locations || [],
      flights: parsed.flights || [],
      trains: parsed.trains || [],
      estimatedDays: parsed.estimatedDays || 1,
      tripType: parsed.tripType || "day_trip",
      detectedLanguage: parsed.detectedLanguage || "Unknown",
    };
  } catch (error) {
    console.error("[FastExtract] Image error:", error);
    throw error;
  }
}

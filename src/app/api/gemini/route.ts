"use server";

import { NextResponse } from "next/server";
import { parseJsonFromLLM } from "@/lib/agents/parse-json";
import { chatCompletion } from "@/lib/agents/openai-client";

export async function POST(request: Request) {
  try {
    const { query, context } = await request.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const prompt = `You are a helpful travel assistant. Based on the user's input, extract location information and provide travel suggestions.

User Query: "${query}"
${context ? `Current Trip Context: ${context}` : ""}

Please respond in JSON format with the following structure:
{
  "locations": [
    {
      "name": "Location name",
      "description": "Brief description of the place",
      "address": "Full street address if applicable (especially for hotels)",
      "coordinates": { "lat": number, "lng": number },
      "type": "attraction|restaurant|hotel|landmark|city|airport|station",
      "day": 1
    }
  ],
  "suggestions": ["suggestion1", "suggestion2"],
  "tripType": "road_trip|city_tour|multi_city|day_trip",
  "estimatedDays": number,
  "message": "A friendly response to the user about their trip"
}

Important:
- Extract all mentioned locations from the query
- ROUTE SEPARATORS: If the query contains "+" or "→" or "->" or "to" between location names, treat these as SEPARATE STOPS on a connected route. Return them IN ORDER as they appear, so we can draw a route connecting them.
  Example: "万仙山+挂壁公路+郭亮村" means 3 stops: Wanxian Mountain → Guabi Highway → Guoliang Village
  Example: "Paris -> Lyon -> Nice" means 3 stops on a route
- DAY ASSIGNMENT: Assign a "day" number (1, 2, 3, etc.) to each location based on logical travel planning. Group nearby locations on the same day. If the user specifies days (e.g., "3-day trip"), distribute locations accordingly.
- HOTELS: When the user mentions a hotel name or requests accommodation:
  - Set type to "hotel"
  - Provide the exact hotel name as it appears
  - Include the full street address in the "address" field
  - Use accurate coordinates for the specific hotel location
  - If a specific hotel is named, search for its real address
- If coordinates are not exact, provide approximate coordinates for the general area
- Keep descriptions concise (1-2 sentences)
- Provide 2-3 helpful suggestions for their trip
- If the user mentions a general area like "Paris", include major attractions
- For Chinese locations, provide the Chinese name followed by English translation in parentheses`;

    const text = await chatCompletion(prompt);

    try {
      const parsedResponse = parseJsonFromLLM(text);
      return NextResponse.json(parsedResponse);
    } catch {
      return NextResponse.json({ 
        error: "Failed to parse response",
        raw: text 
      }, { status: 500 });
    }
  } catch (error) {
    console.error("OpenAI API error:", error);
    return NextResponse.json(
      { error: "Failed to process request", details: String(error) },
      { status: 500 }
    );
  }
}

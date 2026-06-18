import { NextRequest, NextResponse } from 'next/server';
import { parseJsonFromLLM } from '@/lib/agents/parse-json';
import { chatCompletion } from '@/lib/agents/openai-client';

export async function POST(request: NextRequest) {
  try {
    const { lastStopName, firstStopName, distance, fromDay, toDay } = await request.json();

    if (!lastStopName || !firstStopName) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const distanceKm = Math.round(distance / 1000);

    const prompt = `
      A user is planning a multi-day trip. They are ending Day ${fromDay || 1} at "${lastStopName}" and starting Day ${toDay || 2} at "${firstStopName}". The distance between these two locations is approximately ${distanceKm} km.

      Your task is to suggest 3 suitable accommodation options (hotels, inns, resorts, etc.) for their overnight stay.

      - If the distance is short (under 20 km), suggest hotels near the first stop of the next day ("${firstStopName}").
      - If the distance is long (over 20 km), suggest hotels near the last stop of the previous day ("${lastStopName}") or a convenient point in between.
      - Consider the type of destinations (e.g., tourist areas may have more resort options, cities have more variety).

      For each suggestion, provide:
      1. Hotel Name - a real, specific hotel name that exists in the area
      2. A brief, compelling description (2 sentences max)
      3. An estimated price range (e.g., $, $$, $$$, $$$$)
      4. The reason for your suggestion (e.g., "Conveniently located for your morning start," "Offers a relaxing stay after a long day of travel").

      Respond with a JSON object in this exact format:
      {
        "accommodations": [
          {
            "name": "Hotel Name",
            "description": "Description of the hotel.",
            "priceRange": "$$",
            "reason": "Reason for suggestion."
          }
        ],
        "recommendedArea": "Name of the area where these hotels are located"
      }
    `;

    const text = await chatCompletion(prompt);

    try {
      const jsonResponse = parseJsonFromLLM(text);
      return NextResponse.json(jsonResponse);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI response', raw: text },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Hotel Search Error:', error);
    return NextResponse.json(
      { error: 'Failed to find accommodations' },
      { status: 500 }
    );
  }
}

"use server";

import { NextResponse } from "next/server";
import { parseJsonFromLLM } from "@/lib/agents/parse-json";
import { chatCompletion } from "@/lib/agents/openai-client";

interface LocationInput {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type?: string;
}

export async function POST(request: Request) {
  try {
    const { locations, day } = (await request.json()) as {
      locations: LocationInput[];
      day: number;
    };

    if (!locations || locations.length < 3) {
      return NextResponse.json(
        { error: "Need at least 3 locations to optimize" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const locList = locations
      .map(
        (l, i) =>
          `${i + 1}. id="${l.id}" name="${l.name}" lat=${l.lat.toFixed(5)} lng=${l.lng.toFixed(5)} type=${l.type || "attraction"}`
      )
      .join("\n");

    const prompt = `You are a travel route optimizer. Given these ${locations.length} locations for Day ${day} of a trip, return the optimal visiting order that minimizes total travel distance while considering:
- Geographic proximity (nearest-neighbor logic)
- Logical sightseeing flow (e.g., visit a city center before outskirts)
- If a hotel exists, place it last for the day

Locations:
${locList}

Return ONLY a JSON array of the location IDs in the optimal order. Example: ["id1", "id2", "id3"]
No explanation, no markdown, just the JSON array.`;

    const text = await chatCompletion(prompt);

    let order: string[];
    try {
      order = parseJsonFromLLM(text) as string[];
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const validIds = new Set(locations.map((l) => l.id));
    const validOrder = order.filter((id) => validIds.has(id));

    if (validOrder.length !== locations.length) {
      return NextResponse.json({ error: "AI returned incomplete order" }, { status: 500 });
    }

    return NextResponse.json({ order: validOrder, day });
  } catch (error) {
    console.error("Optimize route error:", error);
    return NextResponse.json(
      { error: "Optimization failed", details: String(error) },
      { status: 500 }
    );
  }
}

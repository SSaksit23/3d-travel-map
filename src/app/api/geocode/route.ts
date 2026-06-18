import { NextResponse } from "next/server";

// Using Nominatim (OpenStreetMap) for geocoding - free and no API key required
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Query parameter required" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
      {
        headers: {
          "User-Agent": "TripPlannerApp/1.0",
        },
      }
    );

    const data = await response.json();
    
    const results = data.map((item: {
      display_name: string;
      lat: string;
      lon: string;
      type: string;
      class: string;
    }) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
      category: item.class,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Geocoding error:", error);
    return NextResponse.json({ error: "Failed to geocode" }, { status: 500 });
  }
}

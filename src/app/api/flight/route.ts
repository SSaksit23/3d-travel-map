import { NextResponse } from "next/server";

// FlightRadar24 API integration
// Docs: https://fr24api.flightradar24.com/docs/endpoints/overview

const FR24_API_KEY = process.env.FLIGHT_RADAR;
const FR24_BASE_URL = "https://fr24api.flightradar24.com/api";

// API Ninjas for airport data (30,000+ airports)
// Docs: https://api-ninjas.com/api/airports
const API_NINJAS_KEY = process.env.API_NINJAS_KEY;
const API_NINJAS_URL = "https://api.api-ninjas.com/v1/airports";

interface AirportData {
  name: string;
  iata: string;
  icao: string;
  lat: number;
  lon: number;
  city?: string;
}

interface FlightData {
  flightNumber: string;
  airline: string;
  departure: {
    airport: string;
    iata: string;
    city: string;
    coordinates: { lat: number; lng: number };
    scheduledTime?: string;
  };
  arrival: {
    airport: string;
    iata: string;
    city: string;
    coordinates: { lat: number; lng: number };
    scheduledTime?: string;
  };
  status: string;
  aircraft?: string;
  duration?: number;
}

// Common headers for FR24 API
function getHeaders() {
  return {
    "Accept": "application/json",
    "Accept-Version": "v1",
    "Authorization": `Bearer ${FR24_API_KEY}`,
  };
}

// Cache for airport data to reduce API calls
const airportCache = new Map<string, AirportData>();

// Lookup airport from API Ninjas (30,000+ airports worldwide)
async function getAirportFromNinjas(code: string): Promise<AirportData | null> {
  if (!code || !API_NINJAS_KEY) return null;
  
  const upperCode = code.toUpperCase();
  
  // Check cache first
  const cached = airportCache.get(upperCode);
  if (cached) {
    console.log(`Airport cache hit for ${upperCode}`);
    return cached;
  }

  try {
    // Determine if IATA (3 chars) or ICAO (4 chars)
    const paramName = code.length === 3 ? "iata" : "icao";
    const url = `${API_NINJAS_URL}?${paramName}=${upperCode}`;
    
    console.log(`Looking up airport via API Ninjas: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        "X-Api-Key": API_NINJAS_KEY,
      },
    });

    if (response.ok) {
      const data = await response.json();
      
      if (data && data.length > 0) {
        const airport = data[0];
        const airportData: AirportData = {
          name: airport.name || `${upperCode} Airport`,
          iata: airport.iata || "",
          icao: airport.icao || upperCode,
          lat: airport.latitude || 0,
          lon: airport.longitude || 0,
          city: airport.city,
        };
        
        console.log(`API Ninjas found airport: ${airportData.name} (${airportData.lat}, ${airportData.lon})`);
        
        // Cache the result
        airportCache.set(upperCode, airportData);
        if (airport.iata) airportCache.set(airport.iata.toUpperCase(), airportData);
        if (airport.icao) airportCache.set(airport.icao.toUpperCase(), airportData);
        
        return airportData;
      }
    } else {
      console.log(`API Ninjas error: ${response.status}`);
    }
  } catch (err) {
    console.error(`API Ninjas lookup error for ${code}:`, err);
  }

  return null;
}

// Fallback: Built-in airport database (common airports)
const AIRPORT_FALLBACK: Record<string, AirportData> = {
  // Asia Pacific
  "BKK": { name: "Suvarnabhumi Airport", iata: "BKK", icao: "VTBS", lat: 13.6899, lon: 100.7501, city: "Bangkok" },
  "VTBS": { name: "Suvarnabhumi Airport", iata: "BKK", icao: "VTBS", lat: 13.6899, lon: 100.7501, city: "Bangkok" },
  "CAN": { name: "Guangzhou Baiyun International Airport", iata: "CAN", icao: "ZGGG", lat: 23.3924, lon: 113.2988, city: "Guangzhou" },
  "ZGGG": { name: "Guangzhou Baiyun International Airport", iata: "CAN", icao: "ZGGG", lat: 23.3924, lon: 113.2988, city: "Guangzhou" },
  "PEK": { name: "Beijing Capital International Airport", iata: "PEK", icao: "ZBAA", lat: 40.0799, lon: 116.6031, city: "Beijing" },
  "ZBAA": { name: "Beijing Capital International Airport", iata: "PEK", icao: "ZBAA", lat: 40.0799, lon: 116.6031, city: "Beijing" },
  "PVG": { name: "Shanghai Pudong International Airport", iata: "PVG", icao: "ZSPD", lat: 31.1443, lon: 121.8083, city: "Shanghai" },
  "ZSPD": { name: "Shanghai Pudong International Airport", iata: "PVG", icao: "ZSPD", lat: 31.1443, lon: 121.8083, city: "Shanghai" },
  "HKG": { name: "Hong Kong International Airport", iata: "HKG", icao: "VHHH", lat: 22.3080, lon: 113.9185, city: "Hong Kong" },
  "VHHH": { name: "Hong Kong International Airport", iata: "HKG", icao: "VHHH", lat: 22.3080, lon: 113.9185, city: "Hong Kong" },
  "SIN": { name: "Singapore Changi Airport", iata: "SIN", icao: "WSSS", lat: 1.3644, lon: 103.9915, city: "Singapore" },
  "WSSS": { name: "Singapore Changi Airport", iata: "SIN", icao: "WSSS", lat: 1.3644, lon: 103.9915, city: "Singapore" },
  "NRT": { name: "Narita International Airport", iata: "NRT", icao: "RJAA", lat: 35.7720, lon: 140.3929, city: "Tokyo" },
  "RJAA": { name: "Narita International Airport", iata: "NRT", icao: "RJAA", lat: 35.7720, lon: 140.3929, city: "Tokyo" },
  "ICN": { name: "Incheon International Airport", iata: "ICN", icao: "RKSI", lat: 37.4602, lon: 126.4407, city: "Seoul" },
  "RKSI": { name: "Incheon International Airport", iata: "ICN", icao: "RKSI", lat: 37.4602, lon: 126.4407, city: "Seoul" },
  "URC": { name: "Ürümqi Diwopu International Airport", iata: "URC", icao: "ZWWW", lat: 43.9072, lon: 87.4742, city: "Ürümqi" },
  "ZWWW": { name: "Ürümqi Diwopu International Airport", iata: "URC", icao: "ZWWW", lat: 43.9072, lon: 87.4742, city: "Ürümqi" },
  
  // Middle East & Europe
  "DXB": { name: "Dubai International Airport", iata: "DXB", icao: "OMDB", lat: 25.2528, lon: 55.3644, city: "Dubai" },
  "OMDB": { name: "Dubai International Airport", iata: "DXB", icao: "OMDB", lat: 25.2528, lon: 55.3644, city: "Dubai" },
  "LHR": { name: "London Heathrow Airport", iata: "LHR", icao: "EGLL", lat: 51.4700, lon: -0.4543, city: "London" },
  "EGLL": { name: "London Heathrow Airport", iata: "LHR", icao: "EGLL", lat: 51.4700, lon: -0.4543, city: "London" },
  "CDG": { name: "Paris Charles de Gaulle Airport", iata: "CDG", icao: "LFPG", lat: 49.0097, lon: 2.5479, city: "Paris" },
  "LFPG": { name: "Paris Charles de Gaulle Airport", iata: "CDG", icao: "LFPG", lat: 49.0097, lon: 2.5479, city: "Paris" },
  "FRA": { name: "Frankfurt Airport", iata: "FRA", icao: "EDDF", lat: 50.0379, lon: 8.5622, city: "Frankfurt" },
  "EDDF": { name: "Frankfurt Airport", iata: "FRA", icao: "EDDF", lat: 50.0379, lon: 8.5622, city: "Frankfurt" },
  
  // North America
  "JFK": { name: "John F. Kennedy International Airport", iata: "JFK", icao: "KJFK", lat: 40.6413, lon: -73.7781, city: "New York" },
  "KJFK": { name: "John F. Kennedy International Airport", iata: "JFK", icao: "KJFK", lat: 40.6413, lon: -73.7781, city: "New York" },
  "LAX": { name: "Los Angeles International Airport", iata: "LAX", icao: "KLAX", lat: 33.9416, lon: -118.4085, city: "Los Angeles" },
  "KLAX": { name: "Los Angeles International Airport", iata: "LAX", icao: "KLAX", lat: 33.9416, lon: -118.4085, city: "Los Angeles" },
  "SFO": { name: "San Francisco International Airport", iata: "SFO", icao: "KSFO", lat: 37.6213, lon: -122.3790, city: "San Francisco" },
  "KSFO": { name: "San Francisco International Airport", iata: "SFO", icao: "KSFO", lat: 37.6213, lon: -122.3790, city: "San Francisco" },
};

// Get airport data - try API Ninjas first, fallback to local database
async function getAirportData(code: string): Promise<AirportData | null> {
  if (!code) return null;
  
  const upperCode = code.toUpperCase();
  
  // Check cache first
  const cached = airportCache.get(upperCode);
  if (cached) return cached;
  
  // Try API Ninjas (30,000+ airports)
  if (API_NINJAS_KEY) {
    const ninjaResult = await getAirportFromNinjas(upperCode);
    if (ninjaResult) return ninjaResult;
  }
  
  // Fallback to local database
  const fallback = AIRPORT_FALLBACK[upperCode];
  if (fallback) {
    console.log(`Using fallback airport data for ${upperCode}`);
    airportCache.set(upperCode, fallback);
    return fallback;
  }
  
  console.log(`Airport not found: ${upperCode}`);
  return null;
}

export async function POST(request: Request) {
  try {
    const { flightNumber } = await request.json();

    if (!flightNumber) {
      return NextResponse.json(
        { error: "Flight number is required" },
        { status: 400 }
      );
    }

    // Clean flight number (remove spaces, uppercase)
    const cleanFlightNumber = flightNumber.replace(/\s+/g, "").toUpperCase();

    // Check if API key is configured
    if (!FR24_API_KEY) {
      return NextResponse.json(
        { error: "FlightRadar24 API key not configured. Please add FLIGHT_RADAR to your .env.local file." },
        { status: 500 }
      );
    }

    console.log(`Searching for flight: ${cleanFlightNumber}`);

    // Try 1: Live flight positions (for currently flying aircraft)
    try {
      const liveResponse = await fetch(
        `${FR24_BASE_URL}/live/flight-positions/full?flights=${cleanFlightNumber}`,
        { headers: getHeaders() }
      );

      if (liveResponse.ok) {
        const liveData = await liveResponse.json();
        console.log("Live flight found:", liveData.data?.length || 0, "results");

        if (liveData.data && liveData.data.length > 0) {
          const flight = liveData.data[0];
          const flightData = await mapLiveFlightData(flight, cleanFlightNumber);
          if (flightData.departure.coordinates.lat && flightData.arrival.coordinates.lat) {
            return NextResponse.json(flightData);
          }
        }
      }
    } catch (err) {
      console.error("Live flight fetch error:", err);
    }

    // Try 2: Flight summary (for scheduled/recent flights) - search last 7 days
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const dateFrom = weekAgo.toISOString().split('.')[0];
      const dateTo = tomorrow.toISOString().split('.')[0];

      console.log(`Searching flight summary from ${dateFrom} to ${dateTo}`);

      const summaryResponse = await fetch(
        `${FR24_BASE_URL}/flight-summary/light?flights=${cleanFlightNumber}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`,
        { headers: getHeaders() }
      );

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        console.log("Flight summary found:", summaryData.data?.length || 0, "results");

        if (summaryData.data && summaryData.data.length > 0) {
          const flight = summaryData.data[0];
          const flightData = await mapSummaryFlightData(flight, cleanFlightNumber);
          if (flightData.departure.coordinates.lat && flightData.arrival.coordinates.lat) {
            return NextResponse.json(flightData);
          }
        }
      } else {
        const errorText = await summaryResponse.text();
        console.log("Flight summary error:", summaryResponse.status, errorText);
      }
    } catch (err) {
      console.error("Flight summary fetch error:", err);
    }

    return NextResponse.json(
      { error: `Flight "${cleanFlightNumber}" not found or airports not available.` },
      { status: 404 }
    );

  } catch (error) {
    console.error("Flight API error:", error);
    return NextResponse.json(
      { error: "Failed to process flight request" },
      { status: 500 }
    );
  }
}

// Map live flight positions data
async function mapLiveFlightData(flight: Record<string, unknown>, flightNumber: string): Promise<FlightData> {
  const origIata = (flight.orig_iata as string) || "";
  const origIcao = (flight.orig_icao as string) || "";
  const destIata = (flight.dest_iata as string) || "";
  const destIcao = (flight.dest_icao as string) || "";

  // Look up airports (API Ninjas -> fallback)
  const [originAirport, destAirport] = await Promise.all([
    getAirportData(origIata || origIcao),
    getAirportData(destIata || destIcao),
  ]);

  console.log("Origin:", originAirport?.name || "Not found");
  console.log("Destination:", destAirport?.name || "Not found");

  return {
    flightNumber: (flight.flight as string) || flightNumber,
    airline: extractAirline(flightNumber),
    departure: {
      airport: originAirport?.name || `${origIata || origIcao} Airport`,
      iata: origIata || originAirport?.iata || "",
      city: originAirport?.city || "",
      coordinates: {
        lat: originAirport?.lat || 0,
        lng: originAirport?.lon || 0,
      },
    },
    arrival: {
      airport: destAirport?.name || `${destIata || destIcao} Airport`,
      iata: destIata || destAirport?.iata || "",
      city: destAirport?.city || "",
      coordinates: {
        lat: destAirport?.lat || 0,
        lng: destAirport?.lon || 0,
      },
    },
    status: "Live",
    aircraft: (flight.type as string) || undefined,
  };
}

// Map flight summary data
async function mapSummaryFlightData(flight: Record<string, unknown>, flightNumber: string): Promise<FlightData> {
  const origIata = (flight.orig_iata as string) || "";
  const origIcao = (flight.orig_icao as string) || "";
  const destIata = (flight.dest_iata as string) || "";
  const destIcao = (flight.dest_icao as string) || "";

  // Look up airports (API Ninjas -> fallback)
  const [originAirport, destAirport] = await Promise.all([
    getAirportData(origIata || origIcao),
    getAirportData(destIata || destIcao),
  ]);

  console.log("Origin:", originAirport?.name || "Not found");
  console.log("Destination:", destAirport?.name || "Not found");

  // Calculate duration
  let duration: number | undefined;
  const takeoff = flight.datetime_takeoff as string;
  const landed = flight.datetime_landed as string;
  
  if (takeoff && landed) {
    const depTime = new Date(takeoff).getTime();
    const arrTime = new Date(landed).getTime();
    duration = Math.round((arrTime - depTime) / 1000);
  }

  return {
    flightNumber: (flight.flight as string) || flightNumber,
    airline: extractAirline(flightNumber),
    departure: {
      airport: originAirport?.name || `${origIata || origIcao} Airport`,
      iata: origIata || originAirport?.iata || "",
      city: originAirport?.city || "",
      coordinates: {
        lat: originAirport?.lat || 0,
        lng: originAirport?.lon || 0,
      },
      scheduledTime: takeoff,
    },
    arrival: {
      airport: destAirport?.name || `${destIata || destIcao} Airport`,
      iata: destIata || destAirport?.iata || "",
      city: destAirport?.city || "",
      coordinates: {
        lat: destAirport?.lat || 0,
        lng: destAirport?.lon || 0,
      },
      scheduledTime: landed,
    },
    status: (flight.flight_ended as boolean) ? "Landed" : "In Flight",
    aircraft: (flight.type as string) || undefined,
    duration,
  };
}

// Extract airline name from flight number code
function extractAirline(flightNumber: string): string {
  const airlineCodes: Record<string, string> = {
    "CZ": "China Southern Airlines",
    "MU": "China Eastern Airlines",
    "CA": "Air China",
    "TG": "Thai Airways",
    "SQ": "Singapore Airlines",
    "CX": "Cathay Pacific",
    "JL": "Japan Airlines",
    "NH": "All Nippon Airways",
    "KE": "Korean Air",
    "OZ": "Asiana Airlines",
    "BR": "EVA Air",
    "CI": "China Airlines",
    "VN": "Vietnam Airlines",
    "QR": "Qatar Airways",
    "EK": "Emirates",
    "SU": "Aeroflot",
    "LH": "Lufthansa",
    "BA": "British Airways",
    "AF": "Air France",
    "KL": "KLM",
    "AA": "American Airlines",
    "UA": "United Airlines",
    "DL": "Delta Air Lines",
    "3U": "Sichuan Airlines",
    "HU": "Hainan Airlines",
    "ZH": "Shenzhen Airlines",
    "FM": "Shanghai Airlines",
    "MF": "Xiamen Airlines",
  };

  const code = flightNumber.substring(0, 2).toUpperCase();
  return airlineCodes[code] || `${code} Airlines`;
}

// GET endpoint to check API status
export async function GET() {
  const status = {
    flightradar24: {
      configured: !!FR24_API_KEY,
      status: "unknown",
    },
    apiNinjas: {
      configured: !!API_NINJAS_KEY,
      status: "unknown",
      airportCount: "30,000+",
    },
    fallbackAirports: Object.keys(AIRPORT_FALLBACK).length / 2,
  };

  // Test FR24 API
  if (FR24_API_KEY) {
    try {
      const testResponse = await fetch(
        `${FR24_BASE_URL}/static/airlines/AAL/light`,
        { headers: getHeaders() }
      );
      status.flightradar24.status = testResponse.ok ? "connected" : `error: ${testResponse.status}`;
    } catch {
      status.flightradar24.status = "connection failed";
    }
  }

  // Test API Ninjas
  if (API_NINJAS_KEY) {
    try {
      const testResponse = await fetch(
        `${API_NINJAS_URL}?iata=JFK`,
        { headers: { "X-Api-Key": API_NINJAS_KEY } }
      );
      status.apiNinjas.status = testResponse.ok ? "connected" : `error: ${testResponse.status}`;
    } catch {
      status.apiNinjas.status = "connection failed";
    }
  }

  return NextResponse.json(status);
}

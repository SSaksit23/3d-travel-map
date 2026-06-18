/**
 * Flight & Airport Lookup Tool
 * Resolves IATA codes to airport details via API Ninjas + local fallback DB.
 */

import { toolRegistry } from "./registry";

export interface AirportLookupInput {
  code: string;
}

export interface AirportData {
  lat: number;
  lng: number;
  name: string;
  city: string;
}

const AIRPORT_DB: Record<string, AirportData> = {
  BKK: { lat: 13.6900, lng: 100.7501, name: "Suvarnabhumi Airport", city: "Bangkok" },
  CAN: { lat: 23.3924, lng: 113.2988, name: "Guangzhou Baiyun Airport", city: "Guangzhou" },
  PEK: { lat: 40.0799, lng: 116.6031, name: "Beijing Capital Airport", city: "Beijing" },
  PVG: { lat: 31.1443, lng: 121.8083, name: "Shanghai Pudong Airport", city: "Shanghai" },
  HKG: { lat: 22.3080, lng: 113.9185, name: "Hong Kong Airport", city: "Hong Kong" },
  SIN: { lat: 1.3644, lng: 103.9915, name: "Changi Airport", city: "Singapore" },
  NRT: { lat: 35.7720, lng: 140.3929, name: "Narita Airport", city: "Tokyo" },
  ICN: { lat: 37.4602, lng: 126.4407, name: "Incheon Airport", city: "Seoul" },
  URC: { lat: 43.9072, lng: 87.4742, name: "Urumqi Diwopu Airport", city: "Urumqi" },
  XIY: { lat: 34.4471, lng: 108.7516, name: "Xi'an Xianyang Airport", city: "Xi'an" },
  CTU: { lat: 30.5785, lng: 103.9471, name: "Chengdu Shuangliu Airport", city: "Chengdu" },
  DXB: { lat: 25.2528, lng: 55.3644, name: "Dubai Airport", city: "Dubai" },
  LHR: { lat: 51.4700, lng: -0.4543, name: "Heathrow Airport", city: "London" },
  CDG: { lat: 49.0097, lng: 2.5479, name: "Charles de Gaulle Airport", city: "Paris" },
  FRA: { lat: 50.0379, lng: 8.5622, name: "Frankfurt Airport", city: "Frankfurt" },
  JFK: { lat: 40.6413, lng: -73.7781, name: "JFK Airport", city: "New York" },
  LAX: { lat: 33.9416, lng: -118.4085, name: "LAX Airport", city: "Los Angeles" },
  SFO: { lat: 37.6213, lng: -122.3790, name: "SFO Airport", city: "San Francisco" },
  KHN: { lat: 28.8626, lng: 115.9002, name: "Nanchang Changbei Airport", city: "Nanchang" },
  KMG: { lat: 24.9924, lng: 102.7432, name: "Kunming Changshui Airport", city: "Kunming" },
  SZX: { lat: 22.6393, lng: 113.8107, name: "Shenzhen Bao'an Airport", city: "Shenzhen" },
  WUH: { lat: 30.7838, lng: 114.2081, name: "Wuhan Tianhe Airport", city: "Wuhan" },
  CKG: { lat: 29.7192, lng: 106.6417, name: "Chongqing Jiangbei Airport", city: "Chongqing" },
  KSH: { lat: 39.4698, lng: 75.9930, name: "Kashgar Airport", city: "Kashgar" },
  LHW: { lat: 36.5152, lng: 103.6203, name: "Lanzhou Zhongchuan Airport", city: "Lanzhou" },
  DMK: { lat: 13.9126, lng: 100.6068, name: "Don Mueang Airport", city: "Bangkok" },
  CNX: { lat: 18.7668, lng: 98.9625, name: "Chiang Mai Airport", city: "Chiang Mai" },
  HKT: { lat: 8.1132, lng: 98.3169, name: "Phuket Airport", city: "Phuket" },
};

const AIRLINE_CODES: Record<string, string> = {
  CZ: "China Southern Airlines", MU: "China Eastern Airlines", CA: "Air China",
  TG: "Thai Airways", SQ: "Singapore Airlines", CX: "Cathay Pacific",
  JL: "Japan Airlines", NH: "All Nippon Airways", KE: "Korean Air",
  BR: "EVA Air", CI: "China Airlines", VN: "Vietnam Airlines",
  QR: "Qatar Airways", EK: "Emirates", LH: "Lufthansa",
  BA: "British Airways", AF: "Air France", AA: "American Airlines",
  UA: "United Airlines", DL: "Delta Air Lines", "3U": "Sichuan Airlines",
  HU: "Hainan Airlines", ZH: "Shenzhen Airlines", FM: "Shanghai Airlines",
};

async function airportHandler(args: AirportLookupInput): Promise<AirportData> {
  const code = args.code.toUpperCase();

  if (AIRPORT_DB[code]) return AIRPORT_DB[code];

  const apiKey = process.env.API_NINJAS_KEY;
  if (apiKey) {
    const paramName = code.length === 3 ? "iata" : "icao";
    const resp = await fetch(
      `https://api.api-ninjas.com/v1/airports?${paramName}=${code}`,
      { headers: { "X-Api-Key": apiKey } }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data?.length > 0) {
        const found: AirportData = {
          lat: data[0].latitude,
          lng: data[0].longitude,
          name: data[0].name || `${code} Airport`,
          city: data[0].city || "",
        };
        AIRPORT_DB[code] = found;
        return found;
      }
    }
  }

  throw new Error(`Airport not found: ${code}`);
}

export function getAirlineName(flightNumber: string): string {
  const code = flightNumber.substring(0, 2).toUpperCase();
  return AIRLINE_CODES[code] || `${code} Airlines`;
}

toolRegistry.register<AirportLookupInput, AirportData>({
  name: "airport_lookup",
  toolset: "flights",
  schema: {
    description: "Look up airport details by IATA/ICAO code",
    input: { code: "string" },
    output: "{ lat, lng, name, city }",
  },
  handler: airportHandler,
});

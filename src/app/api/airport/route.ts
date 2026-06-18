import { NextResponse } from "next/server";

// API Ninjas for airport data (30,000+ airports)
const API_NINJAS_KEY = process.env.API_NINJAS_KEY;
const API_NINJAS_URL = "https://api.api-ninjas.com/v1/airports";

export interface AirportInfo {
  name: string;
  iata: string;
  icao: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

// Fallback airport database for common airports when API is unavailable
const AIRPORT_FALLBACK: Record<string, AirportInfo> = {
  // Southeast Asia
  "BKK": { name: "Suvarnabhumi Airport", iata: "BKK", icao: "VTBS", city: "Bangkok", country: "TH", lat: 13.6899, lng: 100.7501 },
  "DMK": { name: "Don Mueang International Airport", iata: "DMK", icao: "VTBD", city: "Bangkok", country: "TH", lat: 13.9126, lng: 100.6067 },
  "CNX": { name: "Chiang Mai International Airport", iata: "CNX", icao: "VTCC", city: "Chiang Mai", country: "TH", lat: 18.7668, lng: 98.9628 },
  "HKT": { name: "Phuket International Airport", iata: "HKT", icao: "VTSP", city: "Phuket", country: "TH", lat: 8.1132, lng: 98.3169 },
  "SIN": { name: "Singapore Changi Airport", iata: "SIN", icao: "WSSS", city: "Singapore", country: "SG", lat: 1.3644, lng: 103.9915 },
  "KUL": { name: "Kuala Lumpur International Airport", iata: "KUL", icao: "WMKK", city: "Kuala Lumpur", country: "MY", lat: 2.7456, lng: 101.7099 },
  "SGN": { name: "Tan Son Nhat International Airport", iata: "SGN", icao: "VVTS", city: "Ho Chi Minh City", country: "VN", lat: 10.8188, lng: 106.6520 },
  "HAN": { name: "Noi Bai International Airport", iata: "HAN", icao: "VVNB", city: "Hanoi", country: "VN", lat: 21.2212, lng: 105.8072 },
  "MNL": { name: "Ninoy Aquino International Airport", iata: "MNL", icao: "RPLL", city: "Manila", country: "PH", lat: 14.5086, lng: 121.0194 },
  "CGK": { name: "Soekarno-Hatta International Airport", iata: "CGK", icao: "WIII", city: "Jakarta", country: "ID", lat: -6.1256, lng: 106.6558 },
  
  // China
  "PEK": { name: "Beijing Capital International Airport", iata: "PEK", icao: "ZBAA", city: "Beijing", country: "CN", lat: 40.0799, lng: 116.6031 },
  "PKX": { name: "Beijing Daxing International Airport", iata: "PKX", icao: "ZBAD", city: "Beijing", country: "CN", lat: 39.5098, lng: 116.4105 },
  "PVG": { name: "Shanghai Pudong International Airport", iata: "PVG", icao: "ZSPD", city: "Shanghai", country: "CN", lat: 31.1443, lng: 121.8083 },
  "SHA": { name: "Shanghai Hongqiao International Airport", iata: "SHA", icao: "ZSSS", city: "Shanghai", country: "CN", lat: 31.1979, lng: 121.3363 },
  "CAN": { name: "Guangzhou Baiyun International Airport", iata: "CAN", icao: "ZGGG", city: "Guangzhou", country: "CN", lat: 23.3924, lng: 113.2988 },
  "SZX": { name: "Shenzhen Bao'an International Airport", iata: "SZX", icao: "ZGSZ", city: "Shenzhen", country: "CN", lat: 22.6393, lng: 113.8107 },
  "HKG": { name: "Hong Kong International Airport", iata: "HKG", icao: "VHHH", city: "Hong Kong", country: "HK", lat: 22.3080, lng: 113.9185 },
  "CTU": { name: "Chengdu Shuangliu International Airport", iata: "CTU", icao: "ZUUU", city: "Chengdu", country: "CN", lat: 30.5785, lng: 103.9471 },
  "CKG": { name: "Chongqing Jiangbei International Airport", iata: "CKG", icao: "ZUCK", city: "Chongqing", country: "CN", lat: 29.7192, lng: 106.6417 },
  "XIY": { name: "Xi'an Xianyang International Airport", iata: "XIY", icao: "ZLXY", city: "Xi'an", country: "CN", lat: 34.4471, lng: 108.7516 },
  "NKG": { name: "Nanjing Lukou International Airport", iata: "NKG", icao: "ZSNJ", city: "Nanjing", country: "CN", lat: 31.7420, lng: 118.8620 },
  "HGH": { name: "Hangzhou Xiaoshan International Airport", iata: "HGH", icao: "ZSHC", city: "Hangzhou", country: "CN", lat: 30.2295, lng: 120.4344 },
  "KMG": { name: "Kunming Changshui International Airport", iata: "KMG", icao: "ZPPP", city: "Kunming", country: "CN", lat: 25.1019, lng: 102.9292 },
  "URC": { name: "Ürümqi Diwopu International Airport", iata: "URC", icao: "ZWWW", city: "Ürümqi", country: "CN", lat: 43.9072, lng: 87.4742 },
  "WUH": { name: "Wuhan Tianhe International Airport", iata: "WUH", icao: "ZHHH", city: "Wuhan", country: "CN", lat: 30.7838, lng: 114.2081 },
  "XMN": { name: "Xiamen Gaoqi International Airport", iata: "XMN", icao: "ZSAM", city: "Xiamen", country: "CN", lat: 24.5440, lng: 118.1277 },
  "TAO": { name: "Qingdao Jiaodong International Airport", iata: "TAO", icao: "ZSQD", city: "Qingdao", country: "CN", lat: 36.2661, lng: 120.3744 },
  "DLC": { name: "Dalian Zhoushuizi International Airport", iata: "DLC", icao: "ZYTL", city: "Dalian", country: "CN", lat: 38.9657, lng: 121.5386 },
  "TSN": { name: "Tianjin Binhai International Airport", iata: "TSN", icao: "ZBTJ", city: "Tianjin", country: "CN", lat: 39.1244, lng: 117.3464 },
  "SYX": { name: "Sanya Phoenix International Airport", iata: "SYX", icao: "ZJSY", city: "Sanya", country: "CN", lat: 18.3029, lng: 109.4122 },
  "HAK": { name: "Haikou Meilan International Airport", iata: "HAK", icao: "ZJHK", city: "Haikou", country: "CN", lat: 19.9349, lng: 110.4589 },
  
  // Japan & Korea
  "NRT": { name: "Narita International Airport", iata: "NRT", icao: "RJAA", city: "Tokyo", country: "JP", lat: 35.7720, lng: 140.3929 },
  "HND": { name: "Tokyo Haneda Airport", iata: "HND", icao: "RJTT", city: "Tokyo", country: "JP", lat: 35.5494, lng: 139.7798 },
  "KIX": { name: "Kansai International Airport", iata: "KIX", icao: "RJBB", city: "Osaka", country: "JP", lat: 34.4347, lng: 135.2440 },
  "ICN": { name: "Incheon International Airport", iata: "ICN", icao: "RKSI", city: "Seoul", country: "KR", lat: 37.4602, lng: 126.4407 },
  "GMP": { name: "Gimpo International Airport", iata: "GMP", icao: "RKSS", city: "Seoul", country: "KR", lat: 37.5583, lng: 126.7906 },
  
  // Taiwan
  "TPE": { name: "Taiwan Taoyuan International Airport", iata: "TPE", icao: "RCTP", city: "Taipei", country: "TW", lat: 25.0777, lng: 121.2328 },
  "TSA": { name: "Taipei Songshan Airport", iata: "TSA", icao: "RCSS", city: "Taipei", country: "TW", lat: 25.0694, lng: 121.5521 },
  
  // Middle East
  "DXB": { name: "Dubai International Airport", iata: "DXB", icao: "OMDB", city: "Dubai", country: "AE", lat: 25.2528, lng: 55.3644 },
  "DOH": { name: "Hamad International Airport", iata: "DOH", icao: "OTHH", city: "Doha", country: "QA", lat: 25.2732, lng: 51.6080 },
  "AUH": { name: "Abu Dhabi International Airport", iata: "AUH", icao: "OMAA", city: "Abu Dhabi", country: "AE", lat: 24.4330, lng: 54.6511 },
  
  // Europe
  "LHR": { name: "London Heathrow Airport", iata: "LHR", icao: "EGLL", city: "London", country: "GB", lat: 51.4700, lng: -0.4543 },
  "LGW": { name: "London Gatwick Airport", iata: "LGW", icao: "EGKK", city: "London", country: "GB", lat: 51.1537, lng: -0.1821 },
  "CDG": { name: "Paris Charles de Gaulle Airport", iata: "CDG", icao: "LFPG", city: "Paris", country: "FR", lat: 49.0097, lng: 2.5479 },
  "FRA": { name: "Frankfurt Airport", iata: "FRA", icao: "EDDF", city: "Frankfurt", country: "DE", lat: 50.0379, lng: 8.5622 },
  "AMS": { name: "Amsterdam Airport Schiphol", iata: "AMS", icao: "EHAM", city: "Amsterdam", country: "NL", lat: 52.3086, lng: 4.7639 },
  "FCO": { name: "Rome Fiumicino Airport", iata: "FCO", icao: "LIRF", city: "Rome", country: "IT", lat: 41.8003, lng: 12.2389 },
  "MAD": { name: "Madrid Barajas Airport", iata: "MAD", icao: "LEMD", city: "Madrid", country: "ES", lat: 40.4983, lng: -3.5676 },
  "BCN": { name: "Barcelona El Prat Airport", iata: "BCN", icao: "LEBL", city: "Barcelona", country: "ES", lat: 41.2971, lng: 2.0785 },
  "MUC": { name: "Munich Airport", iata: "MUC", icao: "EDDM", city: "Munich", country: "DE", lat: 48.3538, lng: 11.7861 },
  "ZRH": { name: "Zurich Airport", iata: "ZRH", icao: "LSZH", city: "Zurich", country: "CH", lat: 47.4647, lng: 8.5492 },
  "IST": { name: "Istanbul Airport", iata: "IST", icao: "LTFM", city: "Istanbul", country: "TR", lat: 41.2753, lng: 28.7519 },
  
  // North America
  "JFK": { name: "John F. Kennedy International Airport", iata: "JFK", icao: "KJFK", city: "New York", country: "US", lat: 40.6413, lng: -73.7781 },
  "LAX": { name: "Los Angeles International Airport", iata: "LAX", icao: "KLAX", city: "Los Angeles", country: "US", lat: 33.9416, lng: -118.4085 },
  "SFO": { name: "San Francisco International Airport", iata: "SFO", icao: "KSFO", city: "San Francisco", country: "US", lat: 37.6213, lng: -122.3790 },
  "ORD": { name: "O'Hare International Airport", iata: "ORD", icao: "KORD", city: "Chicago", country: "US", lat: 41.9742, lng: -87.9073 },
  "ATL": { name: "Hartsfield-Jackson Atlanta International Airport", iata: "ATL", icao: "KATL", city: "Atlanta", country: "US", lat: 33.6407, lng: -84.4277 },
  "DFW": { name: "Dallas/Fort Worth International Airport", iata: "DFW", icao: "KDFW", city: "Dallas", country: "US", lat: 32.8998, lng: -97.0403 },
  "MIA": { name: "Miami International Airport", iata: "MIA", icao: "KMIA", city: "Miami", country: "US", lat: 25.7959, lng: -80.2870 },
  "SEA": { name: "Seattle-Tacoma International Airport", iata: "SEA", icao: "KSEA", city: "Seattle", country: "US", lat: 47.4502, lng: -122.3088 },
  "YYZ": { name: "Toronto Pearson International Airport", iata: "YYZ", icao: "CYYZ", city: "Toronto", country: "CA", lat: 43.6777, lng: -79.6248 },
  "YVR": { name: "Vancouver International Airport", iata: "YVR", icao: "CYVR", city: "Vancouver", country: "CA", lat: 49.1967, lng: -123.1815 },
  
  // Australia
  "SYD": { name: "Sydney Kingsford Smith Airport", iata: "SYD", icao: "YSSY", city: "Sydney", country: "AU", lat: -33.9399, lng: 151.1753 },
  "MEL": { name: "Melbourne Airport", iata: "MEL", icao: "YMML", city: "Melbourne", country: "AU", lat: -37.6690, lng: 144.8410 },
  
  // India
  "DEL": { name: "Indira Gandhi International Airport", iata: "DEL", icao: "VIDP", city: "New Delhi", country: "IN", lat: 28.5562, lng: 77.1000 },
  "BOM": { name: "Chhatrapati Shivaji Maharaj International Airport", iata: "BOM", icao: "VABB", city: "Mumbai", country: "IN", lat: 19.0896, lng: 72.8656 },
};

// GET: Look up airport by code
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Airport code is required" },
      { status: 400 }
    );
  }

  const upperCode = code.trim().toUpperCase();
  
  // Step 1: Check fallback database first (faster, no API call needed)
  const fallback = AIRPORT_FALLBACK[upperCode];
  if (fallback) {
    console.log(`Using fallback for ${upperCode}: ${fallback.name}`);
    return NextResponse.json(fallback);
  }
  
  // Step 2: Try API Ninjas if key is configured
  if (API_NINJAS_KEY) {
    try {
      // Determine if IATA (3 chars) or ICAO (4 chars)
      const paramName = upperCode.length === 3 ? "iata" : "icao";
      const url = `${API_NINJAS_URL}?${paramName}=${upperCode}`;
      
      console.log(`Looking up airport via API: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          "X-Api-Key": API_NINJAS_KEY,
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data && data.length > 0) {
          const airport = data[0];
          const airportInfo: AirportInfo = {
            name: airport.name || `${upperCode} Airport`,
            iata: airport.iata || "",
            icao: airport.icao || upperCode,
            city: airport.city || "",
            country: airport.country || "",
            lat: airport.latitude || 0,
            lng: airport.longitude || 0,
          };

          console.log(`Found airport via API: ${airportInfo.name}`);
          return NextResponse.json(airportInfo);
        }
      } else {
        console.log(`API Ninjas error: ${response.status}`);
      }
    } catch (error) {
      console.error("API Ninjas lookup error:", error);
    }
  }
  
  // Step 3: Airport not found in fallback or API
  return NextResponse.json(
    { error: `Airport "${upperCode}" not found. Try a major airport code like BKK, NKG, or URC.` },
    { status: 404 }
  );
}

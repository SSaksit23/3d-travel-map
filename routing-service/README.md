# OSMnx Routing Service

A FastAPI microservice for accurate street network routing using [OSMnx](https://geoffboeing.com/2016/11/osmnx-python-street-networks/).

## Features

- **Accurate Routing**: Uses OpenStreetMap street network topology for real road distances
- **Multiple Modes**: Supports driving, walking, and biking networks
- **Smart Caching**: In-memory and disk caching for fast repeated queries
- **Batch Processing**: Calculate multiple routes in a single request
- **Fallback Support**: Falls back to Haversine estimation if routing fails

## Why OSMnx?

OSMnx provides more accurate distances than simple APIs because it:

1. Downloads actual street network data from OpenStreetMap
2. Models the network as a graph with nodes (intersections) and edges (streets)
3. Calculates shortest paths using real road topology
4. Considers one-way streets, turn restrictions, and road types

Reference: [OSMnx: Python for Street Networks](https://geoffboeing.com/2016/11/osmnx-python-street-networks/)

## Quick Start

### Option 1: Docker (Recommended)

```bash
# From the trip-planner directory
docker-compose up routing-service
```

### Option 2: Run Locally

```bash
# Install dependencies
cd routing-service
pip install -r requirements.txt

# Run the service
python main.py
```

The service will be available at `http://localhost:8001`

## API Endpoints

### Health Check
```
GET /health
```

### Single Route
```
POST /route
Content-Type: application/json

{
  "origin": {"lat": 13.69, "lng": 100.75},
  "destination": {"lat": 13.76, "lng": 100.50},
  "mode": "drive"
}
```

Response:
```json
{
  "distance_km": 32.5,
  "duration_minutes": 48.2,
  "mode": "drive",
  "path_coordinates": [[100.75, 13.69], ...],
  "success": true
}
```

### Batch Routes
```
POST /routes/batch
Content-Type: application/json

{
  "routes": [
    {"origin": {...}, "destination": {...}, "mode": "drive"},
    {"origin": {...}, "destination": {...}, "mode": "walk"}
  ]
}
```

### Preload Graph
```
POST /preload?lat=13.75&lng=100.50&mode=drive&radius=10000
```

Pre-loads a street network graph for faster subsequent routing.

## Modes

| Mode | Description | Avg Speed |
|------|-------------|-----------|
| `drive` | Drivable streets | 40 km/h |
| `walk` | Walkable paths | 5 km/h |
| `bike` | Bikeable paths | 15 km/h |

## Caching

The service uses two levels of caching:

1. **Memory Cache**: Fast, TTL-based (1 hour), max 50 graphs
2. **Disk Cache**: Persistent, survives restarts

Cache directories:
- `./osmnx_cache/` - OSMnx raw data cache
- `./route_cache/` - Computed graph cache

## Integration

The Trip Planner's `DistanceCalculationAgent` automatically uses this service when available.

Set the environment variable:
```
OSMNX_SERVICE_URL=http://localhost:8001
```

## Performance Tips

1. **Pre-load regions**: Use `/preload` for areas you'll query frequently
2. **Batch requests**: Use `/routes/batch` for multiple routes
3. **Persistent cache**: Mount volumes in Docker to persist cache
4. **Adjust radius**: Larger radius = slower first request, but more coverage

## License

MIT License - Based on OSMnx by Geoff Boeing

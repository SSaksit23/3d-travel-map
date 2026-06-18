# Voyage AI - AI-Powered Trip Planner

A beautiful trip planning application built with Next.js, mapcn (MapLibre), and Google Gemini AI.

![Voyage AI](https://via.placeholder.com/800x400?text=Voyage+AI+Trip+Planner)

## Features

- 🗺️ **Interactive Maps** - Beautiful map interface powered by [mapcn](https://mapcn.dev) and MapLibre
- 🤖 **AI-Powered Planning** - Use Google Gemini to generate trip itineraries from natural language
- 📍 **Multi-Stop Routes** - Add multiple destinations and see driving routes between them
- 📊 **Trip Statistics** - View total distance and estimated travel time
- 🌓 **Dark/Light Mode** - Automatic theme switching based on system preference
- 🔍 **Location Search** - Search for any location using OpenStreetMap/Nominatim

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Google Gemini API key (get one at [Google AI Studio](https://aistudio.google.com/app/apikey))

### Installation

1. Clone the repository and navigate to the project:

```bash
cd trip-planner
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the root directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

4. Start the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Basic Location Search
Type a location name in the search bar and click on a result to add it to your trip.

### AI Trip Planning
Use natural language to plan your trip:
- "Plan a 3-day trip to Paris"
- "Road trip from Los Angeles to San Francisco"
- "Best attractions in Tokyo"
- "Weekend getaway in New York City"

The AI will suggest locations, provide descriptions, and automatically add them to your map.

### Managing Your Trip
- Click on a stop in the sidebar to highlight it on the map
- Click the trash icon to remove a stop
- Routes and distances are calculated automatically between stops

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org) with App Router
- **Map Library**: [mapcn](https://mapcn.dev) (MapLibre wrapper)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com)
- **AI**: [Google Gemini](https://ai.google.dev)
- **Routing**: [OSRM](https://project-osrm.org) (Open Source Routing Machine)
- **Geocoding**: [Nominatim](https://nominatim.org) (OpenStreetMap)

## API Routes

- `POST /api/gemini` - Process natural language queries with Gemini AI
- `GET /api/geocode?q=<query>` - Geocode location names to coordinates

## Credits

- Map tiles by [CARTO](https://carto.com/basemaps)
- Routing by [OSRM](https://project-osrm.org)
- Geocoding by [OpenStreetMap/Nominatim](https://nominatim.org)
- Map components by [mapcn](https://mapcn.dev)

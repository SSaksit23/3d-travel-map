# Voyage AI 3D

A ground-up rebuild of the AI trip-planning prototype: upload a travel document
and a multi-agent AI pipeline extracts destinations, builds a day-by-day
itinerary, resolves routes and flights, and visualizes everything on an
interactive 3D globe (OpenGlobus) with a 2D map (MapLibre) fallback.

See [`../VOYAGE_AI_3D_PROJECT_PLAN.md`](../VOYAGE_AI_3D_PROJECT_PLAN.md) for the
full project plan.

## Status

Phase 0 (Setup) - foundation scaffold only. Agent core, maps, and features are
implemented in later phases.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Environment
cp .env.example .env.local
# Fill in: OPENAI_API_KEY (required), OPENROUTESERVICE_API_KEY, API_NINJAS_KEY

# 3. Run
npm run dev        # http://localhost:3000
```

## Scripts

| Script              | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the dev server                      |
| `npm run build`     | Production build (standalone output)      |
| `npm run start`     | Serve the production build                |
| `npm run lint`      | ESLint                                    |
| `npm run typecheck` | TypeScript (`tsc --noEmit`)               |
| `npm run test`      | Unit/component tests (Vitest)             |
| `npm run test:e2e`  | End-to-end tests (Playwright)             |
| `npm run format`    | Prettier                                  |

## Project structure

```
voyage-ai-3d/
├── src/
│   ├── app/                 # Next.js App Router (layout, page, api later)
│   ├── components/
│   │   ├── trip-planner/map # Map adapter + 2D/3D engines (later)
│   │   └── ui/              # shadcn primitives
│   ├── core/                # framework-free agent core (later)
│   │   ├── agents/  tools/  skills/  memory/  llm/
│   ├── lib/                 # shared utils + config loader
│   └── types/               # normalized Itinerary model (Phase 1)
├── tests/
│   ├── unit/                # Vitest
│   └── e2e/                 # Playwright
└── .github/workflows/ci.yml # lint -> typecheck -> test -> build
```

## Tech stack

Next.js (App Router) - TypeScript (strict) - Tailwind CSS - shadcn/ui -
OpenAI - MapLibre GL - OpenGlobus - Vitest - Playwright.

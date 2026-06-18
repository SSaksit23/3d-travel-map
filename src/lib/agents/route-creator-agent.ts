/**
 * Route Creator Agent (Pipeline Agent 3)
 * Calculates routes between consecutive stops using the tool registry fallback chain:
 * ORS -> OSRM -> Haversine.
 */

import { BaseAgent } from "./base-agent";
import type {
  AgentContext,
  Task,
  TaskResult,
  StructuredItinerary,
  RoutedItinerary,
  RouteSegment,
} from "./types";
import type { RouteOutput } from "./tools";

export class RouteCreatorAgent extends BaseAgent {
  constructor(context: AgentContext) {
    super(
      {
        name: "RouteCreatorAgent",
        goal: "Calculate routes and distances between all consecutive itinerary stops",
        backstory: "Route optimization specialist with access to multiple routing engines.",
        verbose: true,
      },
      context
    );
  }

  async execute(task: Task): Promise<TaskResult<RoutedItinerary>> {
    const startTime = Date.now();
    this.log("Starting route creation");

    try {
      const itinerary = this.getPreviousResult<StructuredItinerary>("itinerary-creator");
      if (!itinerary) {
        return this.error("No structured itinerary available") as TaskResult<RoutedItinerary>;
      }

      const routes: RouteSegment[] = [];
      const days = itinerary.days.sort((a, b) => a.dayNumber - b.dayNumber);

      for (const day of days) {
        const locs = day.locations.filter(
          (l) => l.coordinates.lat !== 0 && l.coordinates.lng !== 0
        );

        for (let i = 0; i < locs.length - 1; i++) {
          const from = locs[i];
          const to = locs[i + 1];

          if (this.isTransportHub(from.type) && this.isTransportHub(to.type)) {
            continue;
          }

          const segment = await this.calculateRoute(
            from.name, to.name, from.coordinates, to.coordinates, day.dayNumber
          );
          if (segment) routes.push(segment);
        }
      }

      for (let i = 0; i < days.length - 1; i++) {
        const currentDay = days[i];
        const nextDay = days[i + 1];
        const currentLocs = currentDay.locations.filter(
          (l) => l.coordinates.lat !== 0 && l.coordinates.lng !== 0
        );
        const nextLocs = nextDay.locations.filter(
          (l) => l.coordinates.lat !== 0 && l.coordinates.lng !== 0
        );

        if (currentLocs.length > 0 && nextLocs.length > 0) {
          const lastOfDay = currentLocs[currentLocs.length - 1];
          const firstOfNext = nextLocs[0];

          if (this.isTransportHub(lastOfDay.type) && this.isTransportHub(firstOfNext.type)) {
            continue;
          }

          const segment = await this.calculateRoute(
            lastOfDay.name, firstOfNext.name,
            lastOfDay.coordinates, firstOfNext.coordinates,
            currentDay.dayNumber, nextDay.dayNumber
          );
          if (segment) {
            segment.isCrossDay = true;
            segment.fromDay = currentDay.dayNumber;
            segment.toDay = nextDay.dayNumber;
            routes.push(segment);
          }
        }
      }

      const routed: RoutedItinerary = { ...itinerary, routes };

      const elapsed = Date.now() - startTime;
      this.log(`Route creation complete in ${elapsed}ms`, {
        routeCount: routes.length,
        totalDistanceKm: Math.round(routes.reduce((s, r) => s + r.distanceKm, 0)),
      });

      return this.success(routed, elapsed);
    } catch (error) {
      this.log("Route creation failed", error);
      return this.error(`Route creation failed: ${error}`) as TaskResult<RoutedItinerary>;
    }
  }

  private isTransportHub(type: string): boolean {
    return type === "airport" || type === "station";
  }

  private async calculateRoute(
    fromName: string,
    toName: string,
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    fromDay: number,
    toDay?: number
  ): Promise<RouteSegment | null> {
    try {
      const result = await this.useToolWithFallback<RouteOutput>(
        ["ors_route", "osrm_route", "haversine"],
        { from, to }
      );

      return {
        fromName,
        toName,
        fromCoordinates: from,
        toCoordinates: to,
        distanceKm: result.distanceKm,
        durationMinutes: result.durationMinutes,
        mode: "drive",
        pathCoordinates: result.pathCoordinates,
        fromDay,
        toDay,
      };
    } catch (err) {
      this.log(`Route calculation failed for ${fromName} → ${toName}: ${err}`);
      return null;
    }
  }
}

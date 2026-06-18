/**
 * Flight Connector Agent (Pipeline Agent 4)
 * Looks up real flight details and integrates them into the itinerary.
 * Uses tool registry for airport lookups.
 */

import { BaseAgent } from "./base-agent";
import { getAirlineName } from "./tools";
import type {
  AgentContext,
  Task,
  TaskResult,
  RoutedItinerary,
  FinalItinerary,
  ResolvedFlight,
  ExtractedFlight,
} from "./types";
import type { AirportData } from "./tools";

export class FlightConnectorAgent extends BaseAgent {
  constructor(context: AgentContext) {
    super(
      {
        name: "FlightConnectorAgent",
        goal: "Look up real flight details and integrate them into the itinerary",
        backstory: "Aviation data specialist with access to flight and airport databases.",
        verbose: true,
      },
      context
    );
  }

  async execute(task: Task): Promise<TaskResult<FinalItinerary>> {
    const startTime = Date.now();
    this.log("Starting flight connection");

    try {
      const routed = this.getPreviousResult<RoutedItinerary>("route-creator");
      if (!routed) {
        return this.error("No routed itinerary available") as TaskResult<FinalItinerary>;
      }

      const rawFlights = routed.flights || [];
      const resolvedFlights: ResolvedFlight[] = [];

      this.log(`Processing ${rawFlights.length} flights`);

      for (const flight of rawFlights) {
        const resolved = await this.resolveFlight(flight);
        if (resolved) {
          resolvedFlights.push(resolved);
        }
      }

      const totalLocations = routed.days.reduce((s, d) => s + d.locations.length, 0);
      const message = this.buildMessage(totalLocations, resolvedFlights.length, routed.trains.length, routed.days.length);

      const final: FinalItinerary = {
        ...routed,
        resolvedFlights,
        message,
      };

      const elapsed = Date.now() - startTime;
      this.log(`Flight connection complete in ${elapsed}ms`, {
        resolved: resolvedFlights.length,
        total: rawFlights.length,
      });

      return this.success(final, elapsed);
    } catch (error) {
      this.log("Flight connection failed", error);
      return this.error(`Flight connection failed: ${error}`) as TaskResult<FinalItinerary>;
    }
  }

  private async resolveFlight(flight: ExtractedFlight): Promise<ResolvedFlight | null> {
    const depData = await this.lookupAirport(flight.departureCode);
    const arrData = await this.lookupAirport(flight.arrivalCode);

    if (!depData && !arrData) {
      this.log(`Could not resolve any airports for ${flight.flightNumber}`);
      return null;
    }

    return {
      flightNumber: flight.flightNumber,
      airline: flight.airline || getAirlineName(flight.flightNumber),
      departure: {
        airport: depData?.name || flight.departureAirport || `${flight.departureCode} Airport`,
        iata: flight.departureCode,
        city: depData?.city || "",
        coordinates: depData
          ? { lat: depData.lat, lng: depData.lng }
          : { lat: 0, lng: 0 },
        time: flight.departureTime,
      },
      arrival: {
        airport: arrData?.name || flight.arrivalAirport || `${flight.arrivalCode} Airport`,
        iata: flight.arrivalCode,
        city: arrData?.city || "",
        coordinates: arrData
          ? { lat: arrData.lat, lng: arrData.lng }
          : { lat: 0, lng: 0 },
        time: flight.arrivalTime,
      },
      day: flight.day || 1,
      status: "Extracted",
    };
  }

  private async lookupAirport(code: string): Promise<AirportData | null> {
    if (!code) return null;
    try {
      return await this.useTool<AirportData>("airport_lookup", { code });
    } catch {
      this.log(`Airport not found: ${code.toUpperCase()}`);
      return null;
    }
  }

  private buildMessage(
    locations: number,
    flights: number,
    trains: number,
    days: number
  ): string {
    const parts: string[] = [];
    if (locations > 0) parts.push(`${locations} location(s)`);
    if (flights > 0) parts.push(`${flights} flight(s)`);
    if (trains > 0) parts.push(`${trains} train(s)`);
    if (parts.length === 0) return "No travel data found.";
    return `${days}-day itinerary with ${parts.join(", ")}`;
  }
}

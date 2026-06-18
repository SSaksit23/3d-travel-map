/**
 * Agent Pipeline Coordinator — Hermes-style orchestration.
 * Chains agents: Document Retrieval -> Itinerary Creator -> Geocode Verification -> Route Creator -> Flight Connector
 * Uses tool registry for all external API calls, skill store for caching, memory for learning.
 */

import { DocumentRetrievalAgent } from "./document-retrieval-agent";
import { ItineraryCreatorAgent } from "./itinerary-creator-agent";
import { RouteCreatorAgent } from "./route-creator-agent";
import { FlightConnectorAgent } from "./flight-connector-agent";
import { toolRegistry } from "./tools";
import type { NominatimOutput } from "./tools";
import { lookupGeocodeCache, saveGeocodeEntry } from "./skills";
import { memoryStore } from "./memory";
import type {
  AgentContext,
  Task,
  TaskResult,
  PipelineProgress,
  PipelineStage,
  RawExtractionResult,
  StructuredItinerary,
  RoutedItinerary,
  FinalItinerary,
} from "./types";

interface PipelineConfig {
  apiKeys: { gemini?: string; openai?: string; apiNinjas?: string };
  verbose?: boolean;
  onProgress?: (progress: PipelineProgress) => void;
}

interface DocumentInput {
  text?: string;
  imageData?: { base64: string; mimeType: string };
}

export class AgentCoordinator {
  private context: AgentContext;
  private verbose: boolean;
  private onProgress?: (progress: PipelineProgress) => void;
  private geocodeCorrectionLog: Array<{ name: string; oldLat: number; oldLng: number; newLat: number; newLng: number }> = [];

  constructor(config: PipelineConfig) {
    this.context = {
      previousResults: new Map(),
      sharedMemory: new Map(),
      apiKeys: config.apiKeys,
    };
    this.verbose = config.verbose ?? true;
    this.onProgress = config.onProgress;

    const toolCount = toolRegistry.getToolCount();
    this.log(`Initialized with ${toolCount} registered tools`);
  }

  private log(msg: string, data?: unknown): void {
    if (this.verbose) console.log(`[AgentCoordinator] ${msg}`, data ?? "");
  }

  private report(stage: PipelineStage, status: PipelineProgress["status"], message: string, elapsed?: number): void {
    const progress: PipelineProgress = { stage, status, message, elapsed };
    this.log(`${stage}: ${message}`);
    this.onProgress?.(progress);
  }

  async processDocument(input: DocumentInput): Promise<FinalItinerary> {
    const pipelineStart = Date.now();
    this.geocodeCorrectionLog = [];

    if (input.text) this.context.sharedMemory.set("documentText", input.text);
    if (input.imageData) this.context.sharedMemory.set("imageData", input.imageData);

    const memoryBlock = memoryStore.renderForPrompt();
    if (memoryBlock) {
      this.context.sharedMemory.set("memoryContext", memoryBlock);
    }

    const makeTask = (id: string, desc: string): Task => ({
      id,
      description: desc,
      expectedOutput: "",
      agent: id,
    });

    // --- Agent 1: Document Retrieval ---
    this.report("document-retrieval", "running", "Extracting entities from document...");
    let retrievalResult: TaskResult<RawExtractionResult>;
    try {
      const agent1 = new DocumentRetrievalAgent(this.context);
      retrievalResult = await agent1.execute(makeTask("document-retrieval", "Extract entities"));
      this.context.previousResults.set("document-retrieval", retrievalResult);
    } catch (err) {
      this.report("document-retrieval", "error", String(err));
      return this.errorOutput("Document retrieval failed: " + String(err));
    }

    if (!retrievalResult.success || !retrievalResult.data) {
      this.report("document-retrieval", "error", retrievalResult.error || "No data");
      return this.errorOutput(retrievalResult.error || "Document retrieval produced no data");
    }
    this.report("document-retrieval", "done",
      `Found ${retrievalResult.data.rawLocations.length} locations, ${retrievalResult.data.rawFlights.length} flights`,
      retrievalResult.executionTime
    );

    // --- Agent 2: Itinerary Creator ---
    this.report("itinerary-creator", "running", "Structuring day-by-day itinerary...");
    let itineraryResult: TaskResult<StructuredItinerary>;
    try {
      const agent2 = new ItineraryCreatorAgent(this.context);
      itineraryResult = await agent2.execute(makeTask("itinerary-creator", "Create itinerary"));
      this.context.previousResults.set("itinerary-creator", itineraryResult);
    } catch (err) {
      this.report("itinerary-creator", "error", String(err));
      return this.fallbackFromRetrieval(retrievalResult.data);
    }

    if (!itineraryResult.success || !itineraryResult.data) {
      this.report("itinerary-creator", "error", itineraryResult.error || "No data");
      return this.fallbackFromRetrieval(retrievalResult.data);
    }
    const totalLocs = itineraryResult.data.days.reduce((s, d) => s + d.locations.length, 0);
    this.report("itinerary-creator", "done",
      `Created ${itineraryResult.data.days.length}-day itinerary with ${totalLocs} stops`,
      itineraryResult.executionTime
    );

    // --- Geocoding Verification (via tool registry + skill cache) ---
    this.report("route-creator", "running", "Verifying coordinates with geocoding service...");
    await this.verifyCoordinates(itineraryResult.data);
    this.context.previousResults.set("itinerary-creator", { ...itineraryResult, data: itineraryResult.data });

    // --- Agent 3: Route Creator ---
    this.report("route-creator", "running", "Calculating routes between stops...");
    let routeResult: TaskResult<RoutedItinerary>;
    try {
      const agent3 = new RouteCreatorAgent(this.context);
      routeResult = await agent3.execute(makeTask("route-creator", "Calculate routes"));
      this.context.previousResults.set("route-creator", routeResult);
    } catch (err) {
      this.report("route-creator", "error", String(err));
      return this.fallbackFromItinerary(itineraryResult.data);
    }

    if (!routeResult.success || !routeResult.data) {
      this.report("route-creator", "error", routeResult.error || "No data");
      return this.fallbackFromItinerary(itineraryResult.data);
    }
    this.report("route-creator", "done",
      `Calculated ${routeResult.data.routes.length} route segments`,
      routeResult.executionTime
    );

    // --- Agent 4: Flight Connector ---
    const hasFlights = (routeResult.data.flights?.length || 0) > 0;
    if (!hasFlights) {
      this.report("flight-connector", "skipped", "No flights to resolve");
      const elapsed = Date.now() - pipelineStart;
      const result: FinalItinerary = {
        ...routeResult.data,
        resolvedFlights: [],
        message: this.buildSummary(routeResult.data, 0, elapsed),
      };
      await this.postProcess(result);
      return result;
    }

    this.report("flight-connector", "running", "Resolving flight details...");
    let flightResult: TaskResult<FinalItinerary>;
    try {
      const agent4 = new FlightConnectorAgent(this.context);
      flightResult = await agent4.execute(makeTask("flight-connector", "Connect flights"));
    } catch (err) {
      this.report("flight-connector", "error", String(err));
      const elapsed = Date.now() - pipelineStart;
      const result: FinalItinerary = {
        ...routeResult.data,
        resolvedFlights: [],
        message: this.buildSummary(routeResult.data, 0, elapsed),
      };
      await this.postProcess(result);
      return result;
    }

    if (!flightResult.success || !flightResult.data) {
      this.report("flight-connector", "error", flightResult.error || "No data");
      const elapsed = Date.now() - pipelineStart;
      const result: FinalItinerary = {
        ...routeResult.data,
        resolvedFlights: [],
        message: this.buildSummary(routeResult.data, 0, elapsed),
      };
      await this.postProcess(result);
      return result;
    }

    this.report("flight-connector", "done",
      `Resolved ${flightResult.data.resolvedFlights.length} flights`,
      flightResult.executionTime
    );

    const totalElapsed = Date.now() - pipelineStart;
    this.log(`Pipeline complete in ${totalElapsed}ms`);

    const finalResult: FinalItinerary = {
      ...flightResult.data,
      message: this.buildSummary(flightResult.data, flightResult.data.resolvedFlights.length, totalElapsed),
    };

    await this.postProcess(finalResult);
    return finalResult;
  }

  // --- Self-improvement loop (Hermes-style) ---
  private async postProcess(result: FinalItinerary): Promise<void> {
    try {
      if (this.geocodeCorrectionLog.length > 0) {
        this.log(`Self-improvement: caching ${this.geocodeCorrectionLog.length} geocoding corrections`);
      }

      const totalLocs = result.days.reduce((s, d) => s + d.locations.length, 0);
      if (totalLocs > 0) {
        const tripDesc = `Processed ${result.days.length}-day trip with ${totalLocs} stops, ${result.resolvedFlights.length} flights`;
        memoryStore.add("memory", tripDesc);
      }

      const toolList = toolRegistry.listTools();
      const unavailable = toolList.filter((t) => !t.available);
      if (unavailable.length > 0) {
        const note = `Tools unavailable during last run: ${unavailable.map((t) => t.name).join(", ")}`;
        const existing = memoryStore.getAll("memory").find((e) => e.content.startsWith("Tools unavailable"));
        if (existing) {
          memoryStore.replace("memory", existing.content, note);
        } else {
          memoryStore.add("memory", note);
        }
      }
    } catch (err) {
      this.log("Post-process self-improvement failed (non-fatal)", err);
    }
  }

  private buildSummary(data: RoutedItinerary, resolvedFlights: number, elapsed: number): string {
    const totalLocs = data.days.reduce((s, d) => s + d.locations.length, 0);
    const parts: string[] = [];
    if (totalLocs > 0) parts.push(`${totalLocs} location(s)`);
    if (resolvedFlights > 0) parts.push(`${resolvedFlights} flight(s)`);
    if (data.trains.length > 0) parts.push(`${data.trains.length} train(s)`);
    if (data.routes.length > 0) parts.push(`${data.routes.length} route(s)`);
    if (parts.length === 0) return "No travel data found.";
    return `${data.days.length}-day itinerary: ${parts.join(", ")} (${(elapsed / 1000).toFixed(1)}s)`;
  }

  private errorOutput(message: string): FinalItinerary {
    return {
      days: [],
      tripType: "unknown",
      estimatedDays: 0,
      flights: [],
      trains: [],
      routes: [],
      resolvedFlights: [],
      message: `Error: ${message}`,
    };
  }

  private fallbackFromRetrieval(raw: RawExtractionResult): FinalItinerary {
    return {
      days: [],
      tripType: "day_trip",
      estimatedDays: raw.estimatedDays,
      flights: raw.rawFlights,
      trains: raw.rawTrains,
      routes: [],
      resolvedFlights: [],
      message: `Partial extraction: ${raw.rawLocations.length} entities found (itinerary creation failed)`,
    };
  }

  private fallbackFromItinerary(itinerary: StructuredItinerary): FinalItinerary {
    return {
      ...itinerary,
      routes: [],
      resolvedFlights: [],
      message: `Itinerary created but route calculation failed`,
    };
  }

  /**
   * Detect the primary country code for the trip based on the LLM coordinates cluster.
   * Most locations should cluster in one country.
   */
  private detectCountryCodes(itinerary: StructuredItinerary): string {
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const day of itinerary.days) {
      for (const loc of day.locations) {
        if (loc.coordinates.lat !== 0 && loc.coordinates.lng !== 0) {
          lats.push(loc.coordinates.lat);
          lngs.push(loc.coordinates.lng);
        }
      }
    }
    if (lats.length === 0) return "";

    const avgLat = lats.reduce((s, v) => s + v, 0) / lats.length;
    const avgLng = lngs.reduce((s, v) => s + v, 0) / lngs.length;

    // Rough bounding-box country detection for common trip regions
    if (avgLat > 18 && avgLat < 54 && avgLng > 73 && avgLng < 135) return "cn";
    if (avgLat > 5 && avgLat < 21 && avgLng > 97 && avgLng < 106) return "th";
    if (avgLat > 24 && avgLat < 46 && avgLng > 122 && avgLng < 146) return "jp";
    if (avgLat > 33 && avgLat < 39 && avgLng > 124 && avgLng < 132) return "kr";
    if (avgLat > -11 && avgLat < 6 && avgLng > 95 && avgLng < 141) return "id";
    if (avgLat > 1 && avgLat < 8 && avgLng > 100 && avgLng < 120) return "my";
    if (avgLat > 8 && avgLat < 23 && avgLng > 102 && avgLng < 110) return "vn";
    if (avgLat > 36 && avgLat < 72 && avgLng > -10 && avgLng < 40) return "";
    if (avgLat > 24 && avgLat < 50 && avgLng > -125 && avgLng < -66) return "us";
    return "";
  }

  /**
   * Verify coordinates using tool registry (nominatim_geocode) with skill cache.
   * Checks geocode-cache skill first, only calls Nominatim for cache misses.
   * Uses country detection and sanity checks to prevent wrong-continent results.
   */
  private async verifyCoordinates(itinerary: StructuredItinerary): Promise<void> {
    let corrected = 0;
    let cacheHits = 0;
    let total = 0;

    const countrycodes = this.detectCountryCodes(itinerary);
    if (countrycodes) {
      this.log(`Detected country code: ${countrycodes}`);
    }

    // Calculate the centroid of all LLM coordinates for sanity-checking
    const allCoords = itinerary.days.flatMap((d) =>
      d.locations.filter((l) => l.coordinates.lat !== 0 && l.coordinates.lng !== 0).map((l) => l.coordinates)
    );
    const centroid = allCoords.length > 0
      ? {
          lat: allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length,
          lng: allCoords.reduce((s, c) => s + c.lng, 0) / allCoords.length,
        }
      : null;

    for (const day of itinerary.days) {
      for (const loc of day.locations) {
        total++;
        try {
          const cached = lookupGeocodeCache(loc.name);
          if (cached) {
            const drift = Math.abs(loc.coordinates.lat - cached.lat) + Math.abs(loc.coordinates.lng - cached.lng);
            if (drift > 0.01) {
              loc.coordinates = { lat: cached.lat, lng: cached.lng };
              corrected++;
            }
            cacheHits++;
            continue;
          }

          const englishName = loc.name.replace(/\(.*?\)/g, "").trim();
          const originalMatch = loc.name.match(/\(([^)]+)\)/);
          const originalName = originalMatch ? originalMatch[1] : "";

          // Build search strategies: country-constrained first, then unconstrained
          const searches = [
            { query: englishName, city: day.city, countrycodes },
            { query: englishName, countrycodes },
            ...(originalName ? [
              { query: originalName, city: day.city, countrycodes },
              { query: originalName, countrycodes },
            ] : []),
            // Fallback without country constraint
            { query: englishName, city: day.city },
            ...(originalName ? [{ query: originalName, city: day.city }] : []),
          ].filter((s) => s.query);

          let found: NominatimOutput | null = null;
          for (const search of searches) {
            try {
              const result = await toolRegistry.dispatch<NominatimOutput>("nominatim_geocode", search);

              // Sanity check: reject results that are on a different continent
              // (more than 40 degrees from the trip centroid)
              if (centroid && result) {
                const distFromCentroid = Math.abs(result.lat - centroid.lat) + Math.abs(result.lng - centroid.lng);
                if (distFromCentroid > 40) {
                  this.log(`Rejected "${loc.name}" result (${result.lat},${result.lng}) — too far from trip centroid`);
                  continue;
                }
              }

              if (result) {
                found = result;
                break;
              }
            } catch {
              // Try next search strategy
            }
            await new Promise((r) => setTimeout(r, 1100));
          }

          if (found) {
            const oldLat = loc.coordinates.lat;
            const oldLng = loc.coordinates.lng;
            const drift = Math.abs(oldLat - found.lat) + Math.abs(oldLng - found.lng);
            const isRounded = oldLat === Math.round(oldLat) && oldLng === Math.round(oldLng);
            if (drift > 0.05 || oldLat === 0 || oldLng === 0 || isRounded) {
              loc.coordinates = { lat: found.lat, lng: found.lng };
              corrected++;
              this.geocodeCorrectionLog.push({ name: loc.name, oldLat, oldLng, newLat: found.lat, newLng: found.lng });
              this.log(`Geocoded "${loc.name}": ${oldLat},${oldLng} → ${found.lat},${found.lng}`);
            }
            saveGeocodeEntry(loc.name, { lat: found.lat, lng: found.lng }, "nominatim");
          } else {
            this.log(`Geocoding failed for "${loc.name}" — keeping LLM coordinates`);
          }
        } catch {
          // Keep LLM coordinates as fallback
        }
      }
    }

    this.log(`Geocoding verification: corrected ${corrected}/${total} locations (${cacheHits} cache hits)`);
  }
}

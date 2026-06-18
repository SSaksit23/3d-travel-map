/**
 * Agent System Exports — Hermes-style architecture
 * Tool registry, skill store, memory store, and pipeline agents.
 */

// Types
export * from "./types";

// Base Agent
export { BaseAgent } from "./base-agent";

// Tool Registry (auto-discovers all tools on import)
export { toolRegistry } from "./tools";
export type { ToolEntry, ToolSchema } from "./tools";

// Skill Store
export { skillStore, lookupGeocodeCache, saveGeocodeEntry } from "./skills";

// Memory Store
export { memoryStore } from "./memory";

// Pipeline Agents
export { DocumentRetrievalAgent } from "./document-retrieval-agent";
export { ItineraryCreatorAgent } from "./itinerary-creator-agent";
export { RouteCreatorAgent } from "./route-creator-agent";
export { FlightConnectorAgent } from "./flight-connector-agent";
export { AgentCoordinator } from "./agent-coordinator";

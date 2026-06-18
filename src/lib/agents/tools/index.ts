/**
 * Tool auto-discovery — importing this module registers all tools.
 * Modeled after Hermes's discover_builtin_tools() pattern.
 */

import "./nominatim-geocode";
import "./ors-route";
import "./osrm-route";
import "./openai-chat";
import "./flight-lookup";
import "./haversine";

export { toolRegistry } from "./registry";
export type { ToolEntry, ToolSchema } from "./registry";
export type { NominatimInput, NominatimOutput } from "./nominatim-geocode";
export type { RouteInput, RouteOutput } from "./ors-route";
export type { ChatInput, ChatWithImageInput, ChatOutput } from "./openai-chat";
export type { AirportLookupInput, AirportData } from "./flight-lookup";
export { getAirlineName } from "./flight-lookup";

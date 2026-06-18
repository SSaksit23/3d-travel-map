/**
 * Hermes-style Agent Types for Trip Planner
 * Multi-agent system with tool registry, skills, and persistent memory.
 */

import type { ToolEntry } from "./tools/registry";
import type { Skill, SkillMetadata } from "./skills/skill-store";
import type { MemoryEntry } from "./memory/memory-store";

// Re-export sub-system types for convenience
export type { ToolEntry, Skill, SkillMetadata, MemoryEntry };

export interface AgentRole {
  name: string;
  goal: string;
  backstory: string;
  verbose?: boolean;
}

export interface Task {
  id: string;
  description: string;
  expectedOutput: string;
  agent: string;
  context?: Task[];
}

export interface TaskResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime?: number;
  agentName: string;
}

// Extracted entity from documents
export interface ExtractedEntity {
  name: string;
  type: "location" | "flight" | "train" | "hotel" | "restaurant" | "attraction" | "airport" | "station" | "city";
  rawText?: string;
  day?: number;
  order?: number; // Order within the day for proper sequencing
  metadata?: Record<string, unknown>;
}

// Translated entity with both original and English names
export interface TranslatedEntity extends ExtractedEntity {
  originalName: string;
  englishName: string;
  standardizedName: string; // Optimized for geocoding
  country?: string;
  region?: string;
}

// Extracted flight info
export interface ExtractedFlight {
  flightNumber: string;
  airline?: string;
  departureAirport?: string;
  departureCode: string;
  arrivalAirport?: string;
  arrivalCode: string;
  departureTime?: string;
  arrivalTime?: string;
  day?: number;
}

// Extracted train info
export interface ExtractedTrain {
  trainNumber: string;
  trainType?: "high-speed" | "normal" | "metro" | "other";
  operator?: string;
  departureStation: string;
  arrivalStation: string;
  departureTime?: string;
  arrivalTime?: string;
  day?: number;
}

// Document extraction result
export interface DocExtractionResult {
  entities: ExtractedEntity[];
  flights: ExtractedFlight[];
  trains: ExtractedTrain[];
  rawText: string;
  estimatedDays: number;
  documentType: string;
}

// Geolocation result
export interface GeolocatedEntity extends ExtractedEntity {
  coordinates?: {
    lat: number;
    lng: number;
  };
  confidence: number; // 0-1 confidence score
  source: "api" | "ai" | "fallback";
  address?: string;
  description?: string;
}

// Distance calculation result
export interface DistanceResult {
  from: string;
  to: string;
  distanceKm: number;
  durationMinutes?: number;
  mode: "driving" | "flight" | "train" | "walking";
}

// Final crew output
export interface CrewOutput {
  locations: Array<{
    name: string;
    description?: string;
    address?: string;
    coordinates: { lat: number; lng: number };
    type: string;
    day: number;
    order: number; // Global order for proper sequencing
  }>;
  flights: ExtractedFlight[];
  trains: ExtractedTrain[];
  distances: DistanceResult[];
  tripType: string;
  estimatedDays: number;
  message: string;
}

// Agent execution context (Hermes-style: tools + skills + memory)
export interface AgentContext {
  previousResults: Map<string, TaskResult>;
  sharedMemory: Map<string, unknown>;
  apiKeys: {
    gemini?: string;
    openai?: string;
    apiNinjas?: string;
  };
}

// --- Pipeline Agent Types ---

export type PipelineStage =
  | "document-retrieval"
  | "itinerary-creator"
  | "route-creator"
  | "flight-connector";

export interface PipelineProgress {
  stage: PipelineStage;
  status: "running" | "done" | "error" | "skipped";
  message: string;
  elapsed?: number;
}

export interface RawExtractionResult {
  rawLocations: Array<{
    name: string;
    originalName?: string;
    type: string;
    day: number;
    order?: number;
    description?: string;
    country?: string;
    region?: string;
  }>;
  rawFlights: ExtractedFlight[];
  rawTrains: ExtractedTrain[];
  rawDates: number[];
  detectedLanguage: string;
  documentSummary: string;
  estimatedDays: number;
}

export interface ItineraryDay {
  dayNumber: number;
  city: string;
  locations: Array<{
    name: string;
    type: string;
    coordinates: { lat: number; lng: number };
    description?: string;
    timeSlot?: "morning" | "afternoon" | "evening";
    order: number;
  }>;
}

export interface StructuredItinerary {
  days: ItineraryDay[];
  tripType: string;
  estimatedDays: number;
  flights: ExtractedFlight[];
  trains: ExtractedTrain[];
}

export interface RouteSegment {
  fromName: string;
  toName: string;
  fromCoordinates: { lat: number; lng: number };
  toCoordinates: { lat: number; lng: number };
  distanceKm: number;
  durationMinutes: number;
  mode: "drive" | "walk" | "flight" | "train";
  pathCoordinates?: [number, number][];
  isCrossDay?: boolean;
  fromDay?: number;
  toDay?: number;
}

export interface RoutedItinerary extends StructuredItinerary {
  routes: RouteSegment[];
}

export interface ResolvedFlight {
  flightNumber: string;
  airline: string;
  departure: {
    airport: string;
    iata: string;
    city: string;
    coordinates: { lat: number; lng: number };
    time?: string;
  };
  arrival: {
    airport: string;
    iata: string;
    city: string;
    coordinates: { lat: number; lng: number };
    time?: string;
  };
  day: number;
  status: string;
  duration?: number;
}

export interface FinalItinerary extends RoutedItinerary {
  resolvedFlights: ResolvedFlight[];
  message: string;
}

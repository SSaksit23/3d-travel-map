/**
 * Skill Store — Hermes-style procedural memory.
 * Skills are learned knowledge persisted to disk (server-side JSON files).
 * Agents check skills before making expensive API calls (e.g. geocode cache).
 */

import fs from "fs";
import path from "path";

export interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  hitCount: number;
}

export interface Skill<T = unknown> {
  metadata: SkillMetadata;
  data: T;
}

const SKILLS_DIR = path.join(process.cwd(), "data", "skills");

function ensureDir(): void {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

function skillPath(name: string): string {
  return path.join(SKILLS_DIR, `${name}.json`);
}

class SkillStoreImpl {
  /**
   * List all available skills (Level 0 — name + description only).
   */
  list(): SkillMetadata[] {
    ensureDir();
    try {
      const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".json"));
      return files.map((f) => {
        const raw = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
        const skill = JSON.parse(raw) as Skill;
        return skill.metadata;
      });
    } catch {
      return [];
    }
  }

  /**
   * Load full skill data (Level 1 — full content).
   */
  load<T>(name: string): Skill<T> | null {
    const p = skillPath(name);
    if (!fs.existsSync(p)) return null;
    try {
      const raw = fs.readFileSync(p, "utf-8");
      const skill = JSON.parse(raw) as Skill<T>;
      skill.metadata.hitCount++;
      fs.writeFileSync(p, JSON.stringify(skill, null, 2));
      return skill;
    } catch {
      return null;
    }
  }

  /**
   * Save or create a skill.
   */
  save<T>(name: string, category: string, description: string, data: T): void {
    ensureDir();
    const existing = this.load<T>(name);
    const now = new Date().toISOString();
    const skill: Skill<T> = {
      metadata: {
        name,
        description,
        category,
        version: existing ? existing.metadata.version + 1 : 1,
        createdAt: existing?.metadata.createdAt ?? now,
        updatedAt: now,
        hitCount: existing?.metadata.hitCount ?? 0,
      },
      data,
    };
    fs.writeFileSync(skillPath(name), JSON.stringify(skill, null, 2));
  }

  /**
   * Patch part of a skill's data (merge shallow).
   */
  patch<T extends Record<string, unknown>>(name: string, partialData: Partial<T>): boolean {
    const existing = this.load<T>(name);
    if (!existing) return false;
    const merged = { ...existing.data, ...partialData } as T;
    this.save(name, existing.metadata.category, existing.metadata.description, merged);
    return true;
  }

  /**
   * Delete a skill.
   */
  remove(name: string): boolean {
    const p = skillPath(name);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
  }
}

export const skillStore = new SkillStoreImpl();

// --- Typed accessors for built-in skill types ---

export type GeocodeCache = Record<string, { lat: number; lng: number; source: string }>;

export function getGeocodeCache(): GeocodeCache {
  const skill = skillStore.load<GeocodeCache>("geocode-cache");
  return skill?.data ?? {};
}

export function saveGeocodeEntry(
  locationName: string,
  coords: { lat: number; lng: number },
  source: string
): void {
  const cache = getGeocodeCache();
  cache[locationName.toLowerCase()] = { ...coords, source };
  skillStore.save("geocode-cache", "geocoding", "Cached geocoding results for known locations", cache);
}

export function lookupGeocodeCache(locationName: string): { lat: number; lng: number } | null {
  const cache = getGeocodeCache();
  const entry = cache[locationName.toLowerCase()];
  return entry ? { lat: entry.lat, lng: entry.lng } : null;
}

export type RouteCache = Record<string, { distanceKm: number; durationMinutes: number }>;

export function getRouteCache(): RouteCache {
  const skill = skillStore.load<RouteCache>("route-cache");
  return skill?.data ?? {};
}

export function saveRouteEntry(
  fromName: string,
  toName: string,
  distanceKm: number,
  durationMinutes: number
): void {
  const cache = getRouteCache();
  const key = `${fromName.toLowerCase()}→${toName.toLowerCase()}`;
  cache[key] = { distanceKm, durationMinutes };
  skillStore.save("route-cache", "routing", "Cached route distances between known locations", cache);
}

/**
 * Base Agent Class — Hermes-style architecture.
 * All specialized agents extend this base class.
 * Provides access to tool registry, skill store, and memory store.
 */

import type { AgentRole, Task, TaskResult, AgentContext } from "./types";
import { toolRegistry } from "./tools/registry";
import { skillStore, lookupGeocodeCache, saveGeocodeEntry } from "./skills";
import { memoryStore } from "./memory";

export abstract class BaseAgent {
  protected role: AgentRole;
  protected context: AgentContext;
  protected verbose: boolean;

  constructor(role: AgentRole, context: AgentContext) {
    this.role = role;
    this.context = context;
    this.verbose = role.verbose ?? false;
  }

  getName(): string {
    return this.role.name;
  }

  getGoal(): string {
    return this.role.goal;
  }

  protected log(message: string, data?: unknown): void {
    if (this.verbose) {
      console.log(`[${this.role.name}] ${message}`, data ?? "");
    }
  }

  abstract execute(task: Task): Promise<TaskResult>;

  protected success<T>(data: T, executionTime?: number): TaskResult<T> {
    return {
      success: true,
      data,
      executionTime,
      agentName: this.role.name,
    };
  }

  protected error(message: string): TaskResult {
    return {
      success: false,
      error: message,
      agentName: this.role.name,
    };
  }

  protected getPreviousResult<T>(taskId: string): T | undefined {
    const result = this.context.previousResults.get(taskId);
    return result?.data as T | undefined;
  }

  protected setSharedMemory(key: string, value: unknown): void {
    this.context.sharedMemory.set(key, value);
  }

  protected getSharedMemory<T>(key: string): T | undefined {
    return this.context.sharedMemory.get(key) as T | undefined;
  }

  // --- Hermes-style tool access ---

  protected get tools() {
    return toolRegistry;
  }

  protected async useTool<T = unknown>(name: string, args: unknown): Promise<T> {
    return toolRegistry.dispatch<T>(name, args);
  }

  protected async useToolWithFallback<T = unknown>(names: string[], args: unknown): Promise<T> {
    return toolRegistry.dispatchWithFallback<T>(names, args) as Promise<T>;
  }

  // --- Hermes-style skill access ---

  protected get skills() {
    return skillStore;
  }

  protected lookupCachedGeocode(name: string): { lat: number; lng: number } | null {
    return lookupGeocodeCache(name);
  }

  protected cacheGeocode(name: string, coords: { lat: number; lng: number }, source: string): void {
    saveGeocodeEntry(name, coords, source);
  }

  // --- Hermes-style memory access ---

  protected get memory() {
    return memoryStore;
  }

  protected getMemoryPromptBlock(): string {
    return memoryStore.renderForPrompt();
  }
}

/**
 * Tool Registry — Hermes-style self-registering tool system.
 * Each tool registers with a name, toolset, handler, and optional availability check.
 * Agents dispatch work through the registry instead of making direct API calls.
 */

export interface ToolSchema {
  description: string;
  input: Record<string, string>;
  output: string;
}

export interface ToolEntry<TInput = unknown, TOutput = unknown> {
  name: string;
  toolset: string;
  schema: ToolSchema;
  handler: (args: TInput) => Promise<TOutput>;
  checkFn?: () => boolean;
}

class ToolRegistryImpl {
  private tools = new Map<string, ToolEntry>();
  private toolsets = new Map<string, Set<string>>();
  private disabledTools = new Set<string>();

  register<TInput, TOutput>(entry: ToolEntry<TInput, TOutput>): void {
    this.tools.set(entry.name, entry as ToolEntry);
    if (!this.toolsets.has(entry.toolset)) {
      this.toolsets.set(entry.toolset, new Set());
    }
    this.toolsets.get(entry.toolset)!.add(entry.name);
  }

  async dispatch<TOutput = unknown>(name: string, args: unknown): Promise<TOutput> {
    const entry = this.tools.get(name);
    if (!entry) throw new Error(`Tool "${name}" not registered`);
    if (this.disabledTools.has(name)) throw new Error(`Tool "${name}" is temporarily disabled`);
    if (entry.checkFn && !entry.checkFn()) {
      throw new Error(`Tool "${name}" is not available (check failed)`);
    }
    try {
      return await entry.handler(args) as TOutput;
    } catch (err) {
      throw new Error(`Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Try dispatching through a fallback chain of tools in order.
   * Returns the first successful result, or throws if all fail.
   */
  async dispatchWithFallback<TOutput = unknown>(
    toolNames: string[],
    args: unknown
  ): Promise<TOutput & { _toolUsed?: string }> {
    const errors: string[] = [];
    for (const name of toolNames) {
      const entry = this.tools.get(name);
      if (!entry) continue;
      if (this.disabledTools.has(name)) continue;
      if (entry.checkFn && !entry.checkFn()) continue;
      try {
        const result = await entry.handler(args) as TOutput & { _toolUsed?: string };
        if (result && typeof result === "object") {
          (result as Record<string, unknown>)._toolUsed = name;
        }
        return result;
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`All tools failed: ${errors.join("; ")}`);
  }

  isAvailable(name: string): boolean {
    const entry = this.tools.get(name);
    if (!entry) return false;
    if (this.disabledTools.has(name)) return false;
    if (entry.checkFn) return entry.checkFn();
    return true;
  }

  disable(name: string): void {
    this.disabledTools.add(name);
  }

  enable(name: string): void {
    this.disabledTools.delete(name);
  }

  getToolsByToolset(toolset: string): ToolEntry[] {
    const names = this.toolsets.get(toolset);
    if (!names) return [];
    return Array.from(names).map((n) => this.tools.get(n)!).filter(Boolean);
  }

  listTools(): Array<{ name: string; toolset: string; available: boolean; description: string }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      toolset: t.toolset,
      available: this.isAvailable(t.name),
      description: t.schema.description,
    }));
  }

  getToolCount(): number {
    return this.tools.size;
  }
}

export const toolRegistry = new ToolRegistryImpl();

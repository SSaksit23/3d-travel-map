/**
 * Memory Store — Hermes-style persistent agent memory.
 * Two targets: "memory" (agent notes) and "user" (user profile).
 * Injected into LLM prompts as a frozen block at pipeline start.
 */

import fs from "fs";
import path from "path";

export interface MemoryEntry {
  content: string;
  createdAt: string;
}

export interface MemoryFile {
  entries: MemoryEntry[];
  maxEntries: number;
}

const MEMORY_DIR = path.join(process.cwd(), "data", "memory");
const TARGETS = {
  memory: { file: "memory.json", maxEntries: 50, label: "MEMORY (agent notes)" },
  user: { file: "user-profile.json", maxEntries: 20, label: "USER PROFILE" },
} as const;

type MemoryTarget = keyof typeof TARGETS;

function ensureDir(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function filePath(target: MemoryTarget): string {
  return path.join(MEMORY_DIR, TARGETS[target].file);
}

function readStore(target: MemoryTarget): MemoryFile {
  const p = filePath(target);
  if (!fs.existsSync(p)) {
    return { entries: [], maxEntries: TARGETS[target].maxEntries };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as MemoryFile;
  } catch {
    return { entries: [], maxEntries: TARGETS[target].maxEntries };
  }
}

function writeStore(target: MemoryTarget, store: MemoryFile): void {
  ensureDir();
  fs.writeFileSync(filePath(target), JSON.stringify(store, null, 2));
}

class MemoryStoreImpl {
  add(target: MemoryTarget, content: string): boolean {
    const store = readStore(target);
    if (store.entries.some((e) => e.content === content)) return false;
    if (store.entries.length >= store.maxEntries) {
      return false;
    }
    store.entries.push({ content, createdAt: new Date().toISOString() });
    writeStore(target, store);
    return true;
  }

  replace(target: MemoryTarget, oldText: string, newContent: string): boolean {
    const store = readStore(target);
    const idx = store.entries.findIndex((e) => e.content.includes(oldText));
    if (idx === -1) return false;
    store.entries[idx] = { content: newContent, createdAt: store.entries[idx].createdAt };
    writeStore(target, store);
    return true;
  }

  remove(target: MemoryTarget, text: string): boolean {
    const store = readStore(target);
    const before = store.entries.length;
    store.entries = store.entries.filter((e) => !e.content.includes(text));
    if (store.entries.length === before) return false;
    writeStore(target, store);
    return true;
  }

  getAll(target: MemoryTarget): MemoryEntry[] {
    return readStore(target).entries;
  }

  search(query: string): Array<MemoryEntry & { target: MemoryTarget }> {
    const q = query.toLowerCase();
    const results: Array<MemoryEntry & { target: MemoryTarget }> = [];
    for (const target of ["memory", "user"] as MemoryTarget[]) {
      for (const entry of readStore(target).entries) {
        if (entry.content.toLowerCase().includes(q)) {
          results.push({ ...entry, target });
        }
      }
    }
    return results;
  }

  /**
   * Render memory as a frozen prompt block (Hermes-style).
   * Injected into LLM system prompts at the start of each pipeline run.
   */
  renderForPrompt(): string {
    const blocks: string[] = [];

    for (const [target, config] of Object.entries(TARGETS) as [MemoryTarget, typeof TARGETS[MemoryTarget]][]) {
      const store = readStore(target);
      if (store.entries.length === 0) continue;
      const pct = Math.round((store.entries.length / config.maxEntries) * 100);
      blocks.push(
        `=== ${config.label} [${store.entries.length}/${config.maxEntries} entries, ${pct}%] ===`
      );
      for (const entry of store.entries) {
        blocks.push(entry.content);
      }
      blocks.push("");
    }

    return blocks.length > 0 ? blocks.join("\n") : "";
  }

  getEntryCount(target: MemoryTarget): number {
    return readStore(target).entries.length;
  }
}

export const memoryStore = new MemoryStoreImpl();

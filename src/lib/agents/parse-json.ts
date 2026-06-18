/**
 * Robustly extract and parse a JSON object or array from an LLM response string.
 * Handles markdown fences, multiple JSON blocks, and trailing garbage.
 */
export function parseJsonFromLLM(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : text;

  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Try greedy regex for objects and arrays
  for (const pattern of [/\{[\s\S]*\}/, /\[[\s\S]*\]/]) {
    const m = cleaned.match(pattern);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* continue */ }
    }
  }

  // Balanced-bracket extraction for both { } and [ ]
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = cleaned.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === open) depth++;
      if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.substring(start, i + 1));
          } catch { /* continue looking */ }
        }
      }
    }
  }

  throw new SyntaxError("No valid JSON found in LLM response");
}

/**
 * Server-side configuration loader.
 *
 * Reads environment variables and fails fast when a REQUIRED key is missing.
 * Keep this server-only: never import it from client components, and never
 * expose secrets to the client (NFR-4 in the project plan).
 *
 * `getServerConfig()` is intentionally lazy (invoked at request time, not at
 * module load) so that `next build` does not require secrets to be present.
 */

export interface ServerConfig {
  /** Required: powers all LLM extraction & enrichment. */
  openaiApiKey: string;
  /** Recommended: primary routing provider. Falls back to OSRM/Haversine. */
  openRouteServiceApiKey?: string;
  /** Optional: airport lookups. */
  apiNinjasKey?: string;
}

class MissingConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env.local and fill in the values.`,
    );
    this.name = "MissingConfigError";
  }
}

/**
 * Validate and return the server configuration.
 * Throws {@link MissingConfigError} when a required key is absent.
 */
export function getServerConfig(): ServerConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const missing: string[] = [];
  if (!openaiApiKey) missing.push("OPENAI_API_KEY");

  if (missing.length > 0) {
    throw new MissingConfigError(missing);
  }

  return {
    openaiApiKey: openaiApiKey as string,
    openRouteServiceApiKey: process.env.OPENROUTESERVICE_API_KEY || undefined,
    apiNinjasKey: process.env.API_NINJAS_KEY || undefined,
  };
}

export { MissingConfigError };

export interface Config {
  devMode: boolean;
  storage: "memory" | "postgres";
  databaseUrl?: string;
  adminToken?: string;
  publicOrigin?: string;
  pollMs: number;
  githubClientId?: string;
  githubClientSecret?: string;
  postmarkToken?: string;
}
export function readConfig(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): Config {
  const devMode = env.DRAGONFRUIT_DEV_MODE === "true";
  const storage = env.DRAGONFRUIT_STORAGE ?? "postgres";
  if (storage !== "memory" && storage !== "postgres") {
    throw new Error("DRAGONFRUIT_STORAGE must be memory or postgres");
  }
  if (storage === "memory" && !devMode) {
    throw new Error("Memory storage is available only in development mode");
  }
  if (storage === "postgres" && !env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env and start PostgreSQL.",
    );
  }
  if (
    env.DRAGONFRUIT_ADMIN_TOKEN && env.DRAGONFRUIT_ADMIN_TOKEN.length < 32
  ) {
    throw new Error(
      "Set DRAGONFRUIT_ADMIN_TOKEN to at least 32 characters outside development mode",
    );
  }
  const publicOrigin = env.DRAGONFRUIT_PUBLIC_ORIGIN || undefined;
  if (!devMode && !publicOrigin) {
    throw new Error(
      "DRAGONFRUIT_PUBLIC_ORIGIN is required outside development mode",
    );
  }
  if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin) {
    throw new Error(
      "DRAGONFRUIT_PUBLIC_ORIGIN must be an origin without a path or trailing slash",
    );
  }
  if (!devMode && publicOrigin && new URL(publicOrigin).protocol !== "https:") {
    throw new Error("Production public origin must use HTTPS");
  }
  if (!!env.GITHUB_CLIENT_ID !== !!env.GITHUB_CLIENT_SECRET) {
    throw new Error("Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET");
  }
  const pollMs = Number(env.DRAGONFRUIT_WORKER_POLL_MS ?? 1000);
  if (!Number.isInteger(pollMs) || pollMs < 100 || pollMs > 60000) {
    throw new Error("Worker poll interval must be 100–60000ms");
  }
  return {
    devMode,
    storage,
    databaseUrl: env.DATABASE_URL,
    adminToken: env.DRAGONFRUIT_ADMIN_TOKEN,
    publicOrigin,
    pollMs,
    githubClientId: env.GITHUB_CLIENT_ID || undefined,
    githubClientSecret: env.GITHUB_CLIENT_SECRET || undefined,
    postmarkToken: env.POSTMARK_SERVER_TOKEN || undefined,
  };
}

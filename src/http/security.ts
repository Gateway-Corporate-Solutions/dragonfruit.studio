import { timingSafeEqual } from "node:crypto";
import type { Config } from "../config.ts";
export function authorize(req: Request, config: Config): Response | undefined {
  const host = new URL(req.url).hostname;
  if (config.devMode) {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
      return new Response("Development mode accepts loopback hosts only", {
        status: 403,
      });
    }
    return;
  }
  let candidate = "";
  try {
    const header = req.headers.get("authorization") ?? "";
    if (header.startsWith("Basic ")) {
      const value = atob(header.slice(6));
      if (value.startsWith("operator:")) candidate = value.slice(9);
    } else if (header.startsWith("Bearer ")) candidate = header.slice(7);
  } catch { /* Treat malformed credentials as unauthorized. */ }
  const a = new TextEncoder().encode(candidate),
    b = new TextEncoder().encode(config.adminToken ?? "");
  if (!b.length || a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Operator authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="dragonfruit", charset="UTF-8"',
      },
    });
  }
}
export function sameOrigin(req: Request, config: Config): Response | undefined {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const expected = config.publicOrigin ?? new URL(req.url).origin;
  const origin = req.headers.get("origin");
  if (
    origin !== expected || req.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return Response.json({
      error: "State-changing requests require the configured Origin header",
    }, { status: 403 });
  }
}

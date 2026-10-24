import { ScopedStore } from "@/src/storage/scoped.ts";
import { App, HttpError, staticFiles } from "fresh";
import { getServices } from "@/src/services.ts";
import { handleApi } from "@/src/http/api.ts";
import { authorize, isPublicPath, sameOrigin } from "@/src/http/security.ts";
import type { State } from "@/utils.ts";

export const app = new App<State>();
app.use(async (ctx) => {
  let response: Response;
  try {
    response = await ctx.next();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(
      "Request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    response = Response.json({
      error: "Service unavailable. Check server configuration and migrations.",
    }, { status: 503 });
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Referrer-Policy",
    ctx.url.pathname.startsWith("/auth/") ? "no-referrer" : "same-origin",
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
});
app.use(async (ctx) => {
  const { config, store, auth, billing } = getServices();
  if (
    config.devMode &&
    !["localhost", "127.0.0.1", "[::1]"].includes(ctx.url.hostname)
  ) {
    return new Response("Development mode accepts loopback hosts only", {
      status: 403,
    });
  }
  ctx.state.config = config;
  ctx.state.store = store;
  ctx.state.operator = false;
  if (ctx.url.pathname === "/healthz") {
    return Response.json({ status: "ok", service: "dragonfruit" });
  }
  if (ctx.url.pathname === "/operator" && ctx.req.method === "GET") {
    const denied = authorize(ctx.req, config);
    if (denied) return denied;
    return new Response(null, {
      status: 303,
      headers: { Location: "/websites" },
    });
  }
  // Stripe authenticates this endpoint with its signed raw body, independently of sessions and CSRF.
  if (ctx.url.pathname === "/api/billing/webhook") {
    return billing.webhook(ctx.req);
  }
  const user = await auth.user(ctx.req);
  ctx.state.user = user;
  const authResponse = await auth.handle(ctx.req);
  if (authResponse) return authResponse;
  const publicPath = isPublicPath(ctx.url.pathname);
  if (!publicPath) {
    const operator =
      (!!ctx.req.headers.get("authorization") && !authorize(ctx.req, config)) ||
      (!user && config.devMode && !authorize(ctx.req, config));
    if (!user && !operator) {
      if (ctx.url.pathname.startsWith("/api/")) {
        return Response.json({ error: "Sign in to access your workspace" }, {
          status: 401,
        });
      }
      return new Response(null, {
        status: 303,
        headers: { Location: "/?auth=login", "Cache-Control": "no-store" },
      });
    }
    ctx.state.operator = !!operator;
    if (operator) ctx.state.user = undefined;
    else if (user) ctx.state.store = new ScopedStore(store, user.id);
    if (
      (ctx.url.pathname === "/settings" || ctx.url.pathname === "/api/ready") &&
      !operator
    ) return new Response("Operator access required", { status: 403 });
    const csrf = sameOrigin(ctx.req, config);
    if (csrf) return csrf;
  }
  let response: Response;
  try {
    if (
      ctx.url.pathname === "/api/billing" ||
      ctx.url.pathname.startsWith("/api/billing/")
    ) return billing.handle(ctx.req, ctx.state.user);
    response = ctx.url.pathname.startsWith("/api/")
      ? await handleApi(ctx.req, ctx.state.store)
      : await ctx.next();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(
      "Request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    response = ctx.url.pathname.startsWith("/api/")
      ? Response.json({
        error:
          "Service unavailable. Check database configuration and migrations.",
      }, { status: 503 })
      : new Response(
        "Service unavailable. Check database configuration and migrations.",
        { status: 503 },
      );
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Referrer-Policy",
    ctx.url.pathname.startsWith("/auth/") ? "no-referrer" : "same-origin",
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cache-Control", "no-store");
  return response;
});
app.use(staticFiles());
app.fsRoutes();

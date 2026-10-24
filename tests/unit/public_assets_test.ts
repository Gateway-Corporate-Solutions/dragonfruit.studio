import { equal } from "node:assert/strict";
import { isPublicPath } from "../../src/http/security.ts";

Deno.test("social embed images are public for anonymous GET and HEAD requests", () => {
  for (const method of ["GET", "HEAD"]) {
    for (
      const path of [
        "/social/home.png",
        "/social/home.svg",
        "/social/future-card.png?refresh=1",
      ]
    ) {
      const req = new Request("https://dragonfruit.studio" + path, { method });
      equal(isPublicPath(new URL(req.url).pathname), true);
      equal(req.headers.has("cookie"), false);
      equal(req.headers.has("authorization"), false);
    }
  }
});
Deno.test("public asset exception does not expose websites, projects, billing or operator routes", () => {
  for (
    const path of [
      "/websites",
      "/projects/new",
      "/projects/123",
      "/billing",
      "/settings",
      "/operator",
      "/api/projects",
      "/api/billing",
      "/social-private/home.png",
    ]
  ) {
    equal(isPublicPath(path), false, path);
  }
  equal(
    isPublicPath(
      new URL("https://dragonfruit.studio/social/../websites").pathname,
    ),
    false,
  );
});

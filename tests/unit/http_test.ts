import { equal, throws } from "node:assert/strict";
import { type Config, readConfig } from "../../src/config.ts";
import { DEFAULT_MANIFEST } from "../../src/domain/manifest.ts";
import { handleApi } from "../../src/http/api.ts";
import { authorize, sameOrigin } from "../../src/http/security.ts";
import { MemoryStore } from "../../src/storage/memory.ts";
const config: Config = {
  devMode: false,
  storage: "postgres",
  adminToken: "a".repeat(32),
  publicOrigin: "https://control.example",
  pollMs: 1000,
};

Deno.test("operator gate rejects malformed credentials and accepts scoped bootstrap credentials", () => {
  for (const authorization of ["", "Basic %%%", "Bearer wrong"]) {
    equal(
      authorize(
        new Request("https://control.example", { headers: { authorization } }),
        config,
      )?.status,
      401,
    );
  }
  equal(
    authorize(
      new Request("https://control.example", {
        headers: {
          authorization: "Basic " + btoa("operator:" + config.adminToken),
        },
      }),
      config,
    ),
    undefined,
  );
  equal(
    authorize(
      new Request("https://control.example", {
        headers: { authorization: "Bearer " + config.adminToken },
      }),
      config,
    ),
    undefined,
  );
  equal(
    authorize(new Request("http://remote.example"), {
      ...config,
      devMode: true,
    })?.status,
    403,
  );
});
Deno.test("state changes require exact origin even with valid authentication", () => {
  for (const origin of ["https://evil.example", "null", ""]) {
    equal(
      sameOrigin(
        new Request("https://control.example/api/projects", {
          method: "POST",
          headers: { origin },
        }),
        config,
      )?.status,
      403,
    );
  }
  equal(
    sameOrigin(
      new Request("https://control.example/api/projects", {
        method: "POST",
        headers: { origin: "https://control.example" },
      }),
      config,
    ),
    undefined,
  );
});
Deno.test("configuration fails closed outside explicit local demo mode", () => {
  throws(() => readConfig({ DRAGONFRUIT_STORAGE: "memory" }));
  throws(() => readConfig({ DATABASE_URL: "postgres://example" }));
  equal(
    readConfig({ DRAGONFRUIT_DEV_MODE: "true", DRAGONFRUIT_STORAGE: "memory" })
      .storage,
    "memory",
  );
});
Deno.test("project and validation API return usable records and idempotent jobs", async () => {
  const store = new MemoryStore();
  const req = new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "App",
      slug: "app",
      repositoryUrl: "https://github.com/owner/app",
      manifest: DEFAULT_MANIFEST,
    }),
  });
  const res = await handleApi(req, store);
  equal(res.status, 201);
  const { project } = await res.json();
  const queue = () =>
    handleApi(
      new Request("http://localhost/api/projects/" + project.id + "/validate", {
        method: "POST",
        headers: { "Idempotency-Key": "same-key" },
      }),
      store,
    );
  const a = await queue(), b = await queue();
  equal(a.status, 202);
  equal((await a.json()).job.id, (await b.json()).job.id);
  equal(
    (await handleApi(
      new Request("http://localhost/api/projects/not-a-uuid"),
      store,
    )).status,
    404,
  );
});
Deno.test("API rejects malformed and oversized JSON", async () => {
  const store = new MemoryStore();
  for (const body of ["{", "x".repeat(2097153)]) {
    const res = await handleApi(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      store,
    );
    equal(res.status, 400);
  }
});

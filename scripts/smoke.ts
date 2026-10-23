import { equal, match } from "node:assert/strict";
const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
const port = listener.addr.port;
listener.close();
const origin = "http://127.0.0.1:" + port;
const server = new Deno.Command(Deno.execPath(), {
  args: [
    "serve",
    "--allow-env",
    "--allow-net",
    "--allow-read",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "_fresh/server.js",
  ],
  env: {
    DRAGONFRUIT_DEV_MODE: "true",
    DRAGONFRUIT_STORAGE: "memory",
    DRAGONFRUIT_PUBLIC_ORIGIN: "",
    DRAGONFRUIT_WORKER_POLL_MS: "100",
  },
  stdout: "piped",
  stderr: "piped",
}).spawn();
const output = server.output();
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(origin + "/healthz");
      await response.text();
      if (response.ok) {
        ready = true;
        break;
      }
    } catch { /* Wait for server startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  equal(ready, true, "Production build must start");
  for (
    const path of [
      "/",
      "/websites",
      "/projects/new",
      "/jobs",
      "/settings",
      "/dragonfruit.svg",
    ]
  ) {
    const response = await fetch(origin + path);
    equal(response.status, 200, path);
    await response.arrayBuffer();
  }
  const homepage = await (await fetch(origin + "/websites")).text();
  match(homepage, /Your websites/);
  for (
    const asset of homepage.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)
  ) {
    const response = await fetch(new URL(asset[1], origin));
    equal(response.status, 200, asset[1]);
    await response.arrayBuffer();
  }
  const payload = {
    name: "Smoke app",
  };
  const crossSite = await fetch(origin + "/api/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example",
    },
    body: JSON.stringify(payload),
  });
  equal(crossSite.status, 403);
  await crossSite.text();
  const created = await fetch(origin + "/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(payload),
  });
  equal(created.status, 201);
  const { project } = await created.json();
  equal(project.repositoryUrl, null);
  equal(project.revision, 0);
  project.document.pages[0].nodes[1].children[1].text = "A saved website";
  const saved = await fetch(
    origin + "/api/projects/" + project.id + "/editor",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        revision: 0,
        document: project.document,
        manifest: project.manifest,
      }),
    },
  );
  equal(saved.status, 200);
  equal((await saved.json()).project.revision, 1);
  const detail = await fetch(origin + "/projects/" + project.id);
  equal(detail.status, 200);
  match(await detail.text(), /Smoke app/);
  const queued = await fetch(
    origin + "/api/projects/" + project.id + "/validate",
    { method: "POST", headers: { Origin: origin } },
  );
  equal(queued.status, 202);
  const { job } = await queued.json();
  let status = "";
  for (let i = 0; i < 30; i++) {
    const result = await (await fetch(origin + "/api/jobs/" + job.id)).json();
    status = result.job.status;
    if (status === "succeeded") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  equal(status, "succeeded");
  for (
    const path of [
      "/missing",
      "/projects/not-a-uuid",
      "/projects/00000000-0000-0000-0000-000000000000",
    ]
  ) {
    const response = await fetch(origin + path);
    equal(response.status, 404, path);
    await response.text();
  }
  console.log(
    "Smoke checks passed: production server, pages/assets, project registration, origin checks, validation worker, and 404s.",
  );
} finally {
  try {
    server.kill("SIGTERM");
  } catch { /* Already stopped. */ }
  const result = await output;
  if (!result.success && result.code !== 143 && result.signal !== "SIGTERM") {
    console.error(new TextDecoder().decode(result.stderr));
  }
}

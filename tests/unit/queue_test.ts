import { equal, notEqual, rejects } from "node:assert/strict";
import { DEFAULT_MANIFEST } from "../../src/domain/manifest.ts";
import { ConflictError } from "../../src/domain/models.ts";
import { MemoryStore } from "../../src/storage/memory.ts";
import { runOnce } from "../../src/worker/run.ts";
const input = {
  name: "App",
  slug: "app",
  repositoryUrl: "https://github.com/owner/app",
  manifest: DEFAULT_MANIFEST,
};

Deno.test("expired leases cannot complete reclaimed jobs", async () => {
  let now = 1000;
  const store = new MemoryStore(() => now),
    project = await store.createProject(input);
  const job = await store.enqueueValidation(project.id, "key");
  const first = await store.claim(100);
  now += 101;
  const second = await store.claim(100);
  notEqual(first!.token, second!.token);
  equal(await store.complete(job.id, first!.token, true, "stale"), false);
  equal(await store.complete(job.id, second!.token, true, "valid"), true);
  equal((await store.getJob(job.id))!.result, "valid");
});
Deno.test("cancel invalidates the active lease and cannot cancel completed work", async () => {
  const store = new MemoryStore(), project = await store.createProject(input);
  const job = await store.enqueueValidation(project.id, "key"),
    lease = await store.claim(1000);
  equal(await store.cancel(job.id), true);
  equal(await store.complete(job.id, lease!.token, true, "too late"), false);
  equal(await store.cancel(job.id), false);
});
Deno.test("enqueue deduplicates by project and snapshots its manifest", async () => {
  const store = new MemoryStore(), project = await store.createProject(input);
  const [a, b] = await Promise.all([
    store.enqueueValidation(project.id, "same"),
    store.enqueueValidation(project.id, "same"),
  ]);
  equal(a.id, b.id);
  a.manifest.http.port = 9000;
  equal((await store.getJob(a.id))!.manifest.http.port, 8000);
  await rejects(() => store.createProject(input), ConflictError);
});
Deno.test("repeated abandoned work fails after three attempts", async () => {
  let now = 1000;
  const store = new MemoryStore(() => now),
    project = await store.createProject(input);
  const job = await store.enqueueValidation(project.id, "key");
  for (let i = 0; i < 3; i++) {
    await store.claim(10);
    now += 11;
  }
  equal(await store.claim(10), undefined);
  equal((await store.getJob(job.id))!.status, "failed");
});
Deno.test("worker validates metadata without asserting deployment success", async () => {
  const store = new MemoryStore(), project = await store.createProject(input);
  const job = await store.enqueueValidation(project.id, "key");
  equal(await runOnce(store), true);
  equal((await store.getJob(job.id))!.status, "succeeded");
  equal(
    (await store.getJob(job.id))!.result!.includes("have not been checked"),
    true,
  );
  equal(await runOnce(store), false);
});

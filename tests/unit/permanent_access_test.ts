import { equal, rejects } from "node:assert/strict";
import { MemoryStore } from "../../src/storage/memory.ts";
import { ScopedStore } from "../../src/storage/scoped.ts";
import { parseProject } from "../../src/domain/manifest.ts";
import { WebsiteLockedError } from "../../src/billing/model.ts";
import { DEFAULT_MANIFEST } from "../../src/domain/manifest.ts";
import { parseWebsite } from "../../src/domain/website.ts";
import { handleApi } from "../../src/http/api.ts";

Deno.test("expired Unlimited locks excess websites and lets owners choose permanent coverage", async () => {
  const base = new MemoryStore();
  await base.billing.mutate("owner", (state) => {
    state.subscriptions = {
      plan: {
        status: "active",
        periodEnd: Math.floor(Date.now() / 1000) + 3600,
        cancelAtPeriodEnd: true,
      },
    };
  });
  const store = new ScopedStore(base, "owner");
  const first = await store.createProject(
    parseProject({ name: "First", slug: "first" }),
  );
  const second = await store.createProject(
    parseProject({ name: "Second", slug: "second" }),
  );
  await store.setPermanentProjects([first.id]);
  equal((await store.getProject(second.id))?.id, second.id);
  await base.billing.mutate("owner", (state) => {
    state.subscriptions!.plan.periodEnd = 1;
  });
  await rejects(() => store.getProject(second.id), WebsiteLockedError);
  equal(
    (await store.listProjects()).find((project) => project.id === second.id)
      ?.document,
    null,
  );
  equal(
    Object.keys(
      (await store.listProjects()).find((project) => project.id === second.id)!
        .manifest,
    ).length,
    0,
  );
  await rejects(
    () =>
      store.saveEditor(
        second.id,
        0,
        parseWebsite(second.document),
        DEFAULT_MANIFEST,
      ),
    WebsiteLockedError,
  );
  await rejects(
    () => store.enqueueValidation(second.id, "locked"),
    WebsiteLockedError,
  );
  const denied = await handleApi(
    new Request("https://studio.test/api/projects/" + second.id),
    store,
  );
  equal(denied.status, 402);
  equal((await denied.json()).code, "WEBSITE_LOCKED");
  await store.setPermanentProjects([second.id]);
  equal((await store.getProject(second.id))?.id, second.id);
  await rejects(() => store.getProject(first.id), WebsiteLockedError);
  await rejects(() => store.setPermanentProjects([first.id, second.id]));
  await rejects(() => store.setPermanentProjects([crypto.randomUUID()]));
  await base.billing.mutate("owner", (state) => {
    state.purchases = {
      slot: { paymentIntent: "paid", refunded: false, disputed: false },
    };
  });
  equal((await store.getProject(first.id))?.id, first.id);
  await base.billing.mutate("owner", (state) => {
    state.purchases!.slot.refunded = true;
  });
  await rejects(() => store.getProject(first.id), WebsiteLockedError);
  await base.billing.mutate("owner", (state) => {
    state.subscriptions!.plan.periodEnd = Math.floor(Date.now() / 1000) + 3600;
  });
  equal((await store.getProject(first.id))?.id, first.id);
  equal(
    (await store.listProjects()).filter((project) => project.locked).length,
    0,
  );
});

Deno.test("permanent selection API is owner-scoped and locked jobs do not expose manifests", async () => {
  const base = new MemoryStore();
  const store = new ScopedStore(base, "owner");
  const first = await base.createProject(
    parseProject({ name: "One" }),
    "owner",
  );
  const second = await base.createProject(parseProject({ name: "Two" }));
  const foreign = await base.createProject(
    parseProject({ name: "Foreign" }),
    "other",
  );
  const choose = (ids: string[]) =>
    handleApi(
      new Request("https://studio.test/api/projects/permanent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }),
      store,
    );
  equal((await choose([foreign.id])).status, 400);
  equal((await choose([first.id, first.id])).status, 400);
  equal((await choose([first.id])).status, 200);
  equal(await store.getProject(second.id), undefined);
  equal(await store.getProject(foreign.id), undefined);
  await base.billing.mutate("owner", (state) => {
    state.subscriptions = {
      plan: {
        status: "active",
        periodEnd: Math.floor(Date.now() / 1000) + 3600,
        cancelAtPeriodEnd: false,
      },
    };
  });
  const excess = await store.createProject(parseProject({ name: "Excess" }));
  const job = await store.enqueueValidation(excess.id, "validation");
  await base.billing.mutate("owner", (state) => {
    state.subscriptions!.plan.periodEnd = 1;
  });
  equal((await store.listJobs()).length, 0);
  await rejects(() => store.getJob(job.id), WebsiteLockedError);
  equal((await choose([excess.id])).status, 200);
  equal((await store.getJob(job.id))?.id, job.id);
  equal((await store.listJobs()).length, 1);
});

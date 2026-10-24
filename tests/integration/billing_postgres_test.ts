import { equal, rejects } from "node:assert/strict";
import { migrate } from "../../scripts/migrate.ts";
import { PostgresStore } from "../../src/storage/postgres.ts";
import { PostgresAuthStore } from "../../src/auth/store.ts";
import { DEFAULT_MANIFEST, parseProject } from "../../src/domain/manifest.ts";
import { parseWebsite } from "../../src/domain/website.ts";
import { WebsiteLimitError } from "../../src/billing/model.ts";
const url = Deno.env.get("TEST_DATABASE_URL");
Deno.test({
  name:
    "PostgreSQL billing serializes creation across connections and preserves editing after downgrade",
  ignore: !url,
  async fn() {
    await migrate(url!);
    const a = new PostgresStore(url!),
      b = new PostgresStore(url!),
      auth = new PostgresAuthStore(a.sql);
    const email = crypto.randomUUID() + "@example.com";
    const user =
      (await auth.resolveUser("email", email, email, "Billing test", true))!;
    try {
      const races = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          (i % 2 ? a : b).createProject(
            parseProject({ name: "Race " + i }),
            user.id,
          )),
      );
      equal(races.filter((r) => r.status === "fulfilled").length, 1);
      equal(await b.countProjects(user.id), 1);
      await a.billing.mutate(user.id, (state) => {
        state.purchases = {
          cs_paid: {
            paymentIntent: "pi_paid",
            refunded: false,
            disputed: false,
          },
        };
      });
      const paid = await Promise.allSettled([
        a.createProject(parseProject({ name: "Paid A" }), user.id),
        b.createProject(parseProject({ name: "Paid B" }), user.id),
      ]);
      equal(paid.filter((r) => r.status === "fulfilled").length, 1);
      await a.billing.mutate(user.id, (state) => {
        state.subscriptions = {
          sub_live: {
            status: "active",
            periodEnd: Math.floor(Date.now() / 1000) + 3600,
            cancelAtPeriodEnd: false,
          },
        };
      });
      await b.createProject(
        parseProject({ name: "Subscription site" }),
        user.id,
      );
      await b.billing.mutate(user.id, (state) => {
        state.subscriptions!.sub_live.status = "canceled";
      });
      await rejects(
        () => a.createProject(parseProject({ name: "Over capacity" }), user.id),
        WebsiteLimitError,
      );
      const existing = (await a.listProjects(user.id))[0];
      await a.saveEditor(
        existing.id,
        0,
        parseWebsite(existing.document),
        DEFAULT_MANIFEST,
        user.id,
      );
      equal((await b.getProject(existing.id))!.revision, 1);
      equal(await b.countProjects(user.id), 3);
    } finally {
      const rows = await a
        .sql`SELECT id FROM projects WHERE owner_id=${user.id}`;
      for (const p of rows) {
        await a.sql`DELETE FROM audit_events WHERE target_id=${p.id}`;
        await a.sql`DELETE FROM projects WHERE id=${p.id}`;
      }
      await a.sql`DELETE FROM auth_users WHERE id=${user.id}`;
      await a.close();
      await b.close();
    }
  },
});

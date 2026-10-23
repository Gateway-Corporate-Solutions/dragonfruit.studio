import { equal, notEqual, rejects } from "node:assert/strict";
import { migrate } from "../../scripts/migrate.ts";
import { DEFAULT_MANIFEST } from "../../src/domain/manifest.ts";
import { PostgresStore } from "../../src/storage/postgres.ts";
const url = Deno.env.get("TEST_DATABASE_URL");
Deno.test({
  name:
    "PostgreSQL: migrations, concurrent claims, fencing, cancellation, and restart persistence",
  ignore: !url,
  async fn() {
    await migrate(url!);
    await migrate(url!);
    const first = new PostgresStore(url!), second = new PostgresStore(url!);
    let projectId: string | undefined;
    try {
      const project = await first.createProject({
        name: "Integration",
        slug: "test-" + crypto.randomUUID(),
        repositoryUrl: "https://github.com/owner/test",
        manifest: DEFAULT_MANIFEST,
      });
      projectId = project.id;
      const saved = await first.saveEditor(
        project.id,
        0,
        project.document!,
        project.manifest,
      );
      equal(saved.revision, 1);
      await rejects(() =>
        second.saveEditor(project.id, 0, project.document!, project.manifest)
      );
      equal(
        (await second.getProject(project.id))!.document!.title,
        "Integration",
      );
      const [a, duplicate] = await Promise.all([
        first.enqueueValidation(project.id, "one"),
        second.enqueueValidation(project.id, "one"),
      ]);
      equal(a.id, duplicate.id);
      const b = await first.enqueueValidation(project.id, "two");
      const leases = await Promise.all([
        first.claim(30000),
        second.claim(30000),
      ]);
      equal(leases.filter(Boolean).length, 2);
      notEqual(leases[0]!.job.id, leases[1]!.job.id);
      const lease = leases.find((l) => l!.job.id === a.id)!;
      // Force expiry to exercise the real database time/claim protocol.
      await first
        .sql`UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=${a.id}`;
      equal(await first.complete(a.id, lease.token, true, "expired"), false);
      const reclaimed = await second.claim(30000);
      equal(reclaimed!.job.id, a.id);
      equal(await first.complete(a.id, lease.token, true, "stale"), false);
      equal(
        await second.complete(a.id, reclaimed!.token, true, "retained result"),
        true,
      );
      equal(await first.cancel(b.id), true);
      await second.close();
      const reopened = new PostgresStore(url!);
      try {
        equal((await reopened.getJob(a.id))!.result, "retained result");
      } finally {
        await reopened.close();
      }
    } finally {
      if (projectId) {
        await first
          .sql`DELETE FROM audit_events WHERE target_id IN (SELECT id FROM jobs WHERE project_id=${projectId}) OR target_id=${projectId}`;
        await first.sql`DELETE FROM jobs WHERE project_id=${projectId}`;
        await first.sql`DELETE FROM environments WHERE project_id=${projectId}`;
        await first.sql`DELETE FROM projects WHERE id=${projectId}`;
      }
      await first.close();
      await second.close();
    }
  },
});

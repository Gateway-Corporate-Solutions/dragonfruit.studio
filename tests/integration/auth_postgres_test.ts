import { equal } from "node:assert/strict";
import { migrate } from "../../scripts/migrate.ts";
import { PostgresStore } from "../../src/storage/postgres.ts";
import { PostgresAuthStore } from "../../src/auth/store.ts";
import { hashToken, randomToken } from "../../src/auth/service.ts";
import { ScopedStore } from "../../src/storage/scoped.ts";
import { parseProject } from "../../src/domain/manifest.ts";
const url = Deno.env.get("TEST_DATABASE_URL");
Deno.test({
  name:
    "PostgreSQL accounts: atomic proof consumption, provider convergence, durable sessions, limits and ownership",
  ignore: !url,
  async fn() {
    await migrate(url!);
    const base = new PostgresStore(url!),
      second = new PostgresStore(url!),
      auth = new PostgresAuthStore(base.sql),
      other = new PostgresAuthStore(second.sql);
    const suffix = crypto.randomUUID(),
      email = suffix + "@example.com",
      userIds: string[] = [],
      projectIds: string[] = [];
    const hash = await hashToken(randomToken()),
      binding = await hashToken(randomToken()),
      session = await hashToken(randomToken()),
      rate = "test:" + suffix;
    try {
      const users = await Promise.all([
        auth.resolveUser("email", email, email, "Email creator", true),
        other.resolveUser("github", suffix, email, "GitHub creator", true),
      ]);
      equal(users[0]!.id, users[1]!.id);
      userIds.push(users[0]!.id);
      const b = await auth.resolveUser(
        "email",
        "b-" + email,
        "b-" + email,
        "Other creator",
        true,
      );
      userIds.push(b!.id);
      await auth.putChallenge(hash, {
        kind: "email",
        binding,
        data: { email, intent: "signup" },
        expires: Date.now() + 60000,
      });
      const consumed = await Promise.all([
        auth.consumeChallenge(hash, "email", binding),
        other.consumeChallenge(hash, "email", binding),
      ]);
      equal(consumed.filter(Boolean).length, 1);
      await auth.createSession(session, users[0]!.id, Date.now() + 60000);
      equal((await other.session(session))!.id, users[0]!.id);
      await other.revokeSession(session);
      equal(await auth.session(session), undefined);
      const limits = await Promise.all([
        auth.allow(rate, 1, 60000),
        other.allow(rate, 1, 60000),
      ]);
      equal(limits.filter(Boolean).length, 1);
      const own = new ScopedStore(base, users[0]!.id),
        foreign = new ScopedStore(second, b!.id),
        project = await own.createProject(
          parseProject({ name: "Private integration " + suffix }),
        );
      projectIds.push(project.id);
      equal(project.ownerId, users[0]!.id);
      equal(await foreign.getProject(project.id), undefined);
      equal(
        (await foreign.listProjects()).some((p) => p.id === project.id),
        false,
      );
      const [audit] = await base
        .sql`SELECT actor FROM audit_events WHERE target_id=${project.id} AND action='project.created'`;
      equal(audit.actor, users[0]!.id);
    } finally {
      for (const id of projectIds) {
        await base.sql`DELETE FROM audit_events WHERE target_id=${id}`;
        await base.sql`DELETE FROM jobs WHERE project_id=${id}`;
        await base.sql`DELETE FROM environments WHERE project_id=${id}`;
        await base.sql`DELETE FROM projects WHERE id=${id}`;
      }
      for (const id of userIds) {
        await base.sql`DELETE FROM auth_users WHERE id=${id}`;
      }
      await base.sql`DELETE FROM auth_challenges WHERE token_hash=${hash}`;
      await base.sql`DELETE FROM auth_rate_limits WHERE key=${rate}`;
      await second.close();
      await base.close();
    }
  },
});

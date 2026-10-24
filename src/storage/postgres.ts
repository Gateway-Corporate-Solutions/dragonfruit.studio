import { PostgresBillingRepository } from "../billing/repository.ts";
import { summarize, WebsiteLimitError } from "../billing/model.ts";
import type { SiteDocument } from "../domain/site.ts";
import {
  parseWebsite,
  starterWebsite,
  type WebsiteDocument,
} from "../domain/website.ts";
import type { Manifest } from "../domain/manifest.ts";
import postgres from "postgres";
import type { ProjectInput } from "../domain/manifest.ts";
import {
  ConflictError,
  type Job,
  type Lease,
  NotFoundError,
  type Project,
} from "../domain/models.ts";
import type { Store } from "./store.ts";
type Row = Record<string, unknown>;
const timestamp = (v: unknown) =>
  v instanceof Date ? v.toISOString() : String(v);
function project(row: Row): Project {
  return {
    id: String(row.id),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    name: String(row.name),
    slug: String(row.slug),
    repositoryUrl: row.repository_url == null
      ? null
      : String(row.repository_url),
    document: row.document ? parseWebsite(row.document) : null,
    revision: Number(row.revision),
    manifest: row.manifest as Project["manifest"],
    createdAt: timestamp(row.created_at),
  };
}
function job(row: Row): Job {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    kind: row.kind as Job["kind"],
    status: row.status as Job["status"],
    manifest: row.manifest as Job["manifest"],
    idempotencyKey: String(row.idempotency_key),
    attempts: Number(row.attempts),
    leaseToken: row.lease_token ? String(row.lease_token) : null,
    leaseUntil: row.lease_until ? timestamp(row.lease_until) : null,
    result: row.result === null ? null : String(row.result),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}
export class PostgresStore implements Store {
  readonly durable = true;
  readonly sql;
  readonly billing;
  async countProjects(ownerId: string) {
    const [r] = await this
      .sql`SELECT count(*) AS count FROM projects WHERE owner_id=${ownerId}`;
    return Number(r.count);
  }
  constructor(url: string) {
    this.sql = postgres(url, { max: 5, connect_timeout: 5, idle_timeout: 10 });
    this.billing = new PostgresBillingRepository(this.sql);
  }
  async ping() {
    await this.sql`SELECT 1 FROM projects LIMIT 1`;
  }
  async close() {
    await this.sql.end({ timeout: 5 });
  }
  async listProjects(ownerId?: string) {
    if (ownerId) {
      return (await this
        .sql`SELECT * FROM projects WHERE owner_id=${ownerId} ORDER BY created_at DESC`)
        .map(project);
    }
    return (await this
      .sql`SELECT * FROM projects ORDER BY created_at DESC LIMIT 100`).map(
        project,
      );
  }
  async getProject(id: string) {
    const [r] = await this.sql`SELECT * FROM projects WHERE id = ${id}`;
    return r ? project(r) : undefined;
  }
  async createProject(input: ProjectInput, ownerId?: string) {
    try {
      return await this.sql.begin(async (tx) => {
        if (ownerId) {
          await tx`INSERT INTO billing_accounts(owner_id,state) VALUES(${ownerId},'{}') ON CONFLICT(owner_id) DO NOTHING`;
          const [account] =
            await tx`SELECT state FROM billing_accounts WHERE owner_id=${ownerId} FOR UPDATE`;
          const [count] =
            await tx`SELECT count(*) AS count FROM projects WHERE owner_id=${ownerId}`;
          if (!summarize(account.state, Number(count.count)).canCreate) {
            throw new WebsiteLimitError();
          }
        }
        const [r] =
          await tx`INSERT INTO projects (id,name,slug,repository_url,manifest,document,owner_id)
          VALUES (${crypto.randomUUID()},${input.name},${input.slug},${input.repositoryUrl},${
            tx.json(input.manifest as unknown as postgres.JSONValue)
          },${
            tx.json(starterWebsite(input.name) as unknown as postgres.JSONValue)
          },${ownerId ?? null}) RETURNING *`;
        await tx`INSERT INTO environments (id,project_id,name) VALUES (${crypto.randomUUID()},${r.id},'production')`;
        await tx`INSERT INTO audit_events (actor,action,target_id) VALUES (${
          ownerId ?? "operator"
        },'project.created',${r.id})`;
        return project(r);
      }) as Project;
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.code === "23505") {
        throw new ConflictError("Project slug already exists");
      }
      throw error;
    }
  }
  async saveEditor(
    id: string,
    revision: number,
    document: WebsiteDocument | SiteDocument,
    manifest: Manifest,
    actorId?: string,
  ) {
    return await this.sql.begin(async (tx) => {
      const [r] = await tx`UPDATE projects SET document=${
        tx.json(parseWebsite(document) as unknown as postgres.JSONValue)
      },
        manifest=${
        tx.json(manifest as unknown as postgres.JSONValue)
      }, revision=revision+1
        WHERE id=${id} AND revision=${revision} RETURNING *`;
      if (!r) {
        const rows = await tx`SELECT id FROM projects WHERE id=${id}`;
        if (!rows.length) throw new NotFoundError("Project not found");
        throw new ConflictError(
          "A newer draft exists. Export your changes before reloading this editor.",
        );
      }
      await tx`INSERT INTO audit_events (actor,action,target_id) VALUES (${
        actorId ?? "operator"
      },'website.saved',${id})`;
      return project(r);
    }) as Project;
  }
  async listJobs(projectId?: string, ownerId?: string) {
    if (ownerId) {
      const rows = projectId
        ? await this
          .sql`SELECT j.* FROM jobs j JOIN projects p ON p.id=j.project_id WHERE p.owner_id=${ownerId} AND j.project_id=${projectId} ORDER BY j.created_at DESC LIMIT 100`
        : await this
          .sql`SELECT j.* FROM jobs j JOIN projects p ON p.id=j.project_id WHERE p.owner_id=${ownerId} ORDER BY j.created_at DESC LIMIT 100`;
      return rows.map(job);
    }
    const rows = projectId
      ? await this
        .sql`SELECT * FROM jobs WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 100`
      : await this.sql`SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100`;
    return rows.map(job);
  }
  async getJob(id: string) {
    const [r] = await this.sql`SELECT * FROM jobs WHERE id = ${id}`;
    return r ? job(r) : undefined;
  }
  async enqueueValidation(projectId: string, key: string, actorId?: string) {
    return await this.sql.begin(async (tx) => {
      const [p] = await tx`SELECT * FROM projects WHERE id = ${projectId}`;
      if (!p) throw new NotFoundError("Project not found");
      const rows =
        await tx`INSERT INTO jobs (id,project_id,kind,manifest,idempotency_key)
        VALUES (${crypto.randomUUID()},${projectId},'project.validate',${
          tx.json(p.manifest)
        },${key})
        ON CONFLICT (project_id,idempotency_key) DO NOTHING RETURNING *`;
      const r = rows[0] ??
        (await tx`SELECT * FROM jobs WHERE project_id = ${projectId} AND idempotency_key = ${key}`)[
          0
        ];
      if (rows.length) {
        await tx`INSERT INTO audit_events (actor,action,target_id) VALUES (${
          actorId ?? "operator"
        },'validation.queued',${r.id})`;
      }
      return job(r);
    }) as Job;
  }
  async claim(leaseMs: number): Promise<Lease | undefined> {
    return await this.sql.begin(async (tx) => {
      await tx`UPDATE jobs SET status='failed', result='Worker lease expired after 3 attempts',
        lease_token=NULL,lease_until=NULL,updated_at=now()
        WHERE status='running' AND lease_until <= now() AND attempts >= 3`;
      const token = crypto.randomUUID();
      const [r] =
        await tx`UPDATE jobs SET status='running', attempts=attempts+1, lease_token=${token},
        lease_until=now() + ${leaseMs} * interval '1 millisecond', updated_at=now()
        WHERE id=(SELECT id FROM jobs WHERE attempts < 3 AND
          (status='queued' OR (status='running' AND lease_until <= now()))
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
      return r ? { job: job(r), token } : undefined;
    }) as Lease | undefined;
  }
  async complete(id: string, token: string, success: boolean, result: string) {
    const rows = await this.sql`UPDATE jobs SET status=${
      success ? "succeeded" : "failed"
    },
      result=${
      result.slice(0, 4000)
    },lease_token=NULL,lease_until=NULL,updated_at=now()
      WHERE id=${id} AND status='running' AND lease_token=${token} AND lease_until > now() RETURNING id`;
    return rows.length === 1;
  }
  async cancel(id: string, actorId?: string) {
    return await this.sql.begin(async (tx) => {
      const rows =
        await tx`UPDATE jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now()
        WHERE id=${id} AND status IN ('queued','running') RETURNING id`;
      if (rows.length) {
        await tx`INSERT INTO audit_events (actor,action,target_id) VALUES (${
          actorId ?? "operator"
        },'job.cancelled',${id})`;
      }
      return rows.length === 1;
    }) as boolean;
  }
}

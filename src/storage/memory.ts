// deno-lint-ignore-file require-await -- Implements the async Store contract without I/O.
import { MemoryBillingRepository } from "../billing/repository.ts";
import { summarize, WebsiteLimitError } from "../billing/model.ts";
import type { SiteDocument } from "../domain/site.ts";
import {
  parseWebsite,
  starterWebsite,
  type WebsiteDocument,
} from "../domain/website.ts";
import type { Manifest } from "../domain/manifest.ts";
import type { ProjectInput } from "../domain/manifest.ts";
import {
  ConflictError,
  type Job,
  type Lease,
  NotFoundError,
  type Project,
} from "../domain/models.ts";
import type { Store } from "./store.ts";

/** Explicitly ephemeral adapter for demos and conformance tests; never production. */
export class MemoryStore implements Store {
  readonly durable = false;
  readonly billing = new MemoryBillingRepository();
  async countProjects(ownerId: string) {
    return [...this.projects.values()].filter((p) => p.ownerId === ownerId)
      .length;
  }
  private projects = new Map<string, Project>();
  private jobs = new Map<string, Job>();
  constructor(private now = () => Date.now()) {}
  async ping() {}
  async close() {}
  async listProjects(ownerId?: string) {
    return structuredClone(
      [...this.projects.values()].filter((p) =>
        !ownerId || p.ownerId === ownerId
      ).reverse(),
    );
  }
  async getProject(id: string) {
    return structuredClone(this.projects.get(id));
  }
  async createProject(input: ProjectInput, ownerId?: string) {
    if (ownerId) {
      return this.billing.mutate(ownerId, async (state) => {
        if (
          !summarize(state, await this.countProjects(ownerId), this.now())
            .canCreate
        ) throw new WebsiteLimitError();
        return this.insertProject(input, ownerId);
      });
    }
    return this.insertProject(input);
  }
  private insertProject(input: ProjectInput, ownerId?: string) {
    if ([...this.projects.values()].some((p) => p.slug === input.slug)) {
      throw new ConflictError("Project slug already exists");
    }
    const p: Project = {
      ...structuredClone(input),
      id: crypto.randomUUID(),
      createdAt: new Date(this.now()).toISOString(),
      document: starterWebsite(input.name),
      revision: 0,
      ownerId: ownerId ?? null,
    };
    this.projects.set(p.id, p);
    return structuredClone(p);
  }
  async saveEditor(
    id: string,
    revision: number,
    document: WebsiteDocument | SiteDocument,
    manifest: Manifest,
  ) {
    const project = this.projects.get(id);
    if (!project) throw new NotFoundError("Project not found");
    if (project.revision !== revision) {
      throw new ConflictError(
        "A newer draft exists. Export your changes before reloading this editor.",
      );
    }
    project.document = parseWebsite(document);
    project.manifest = structuredClone(manifest);
    project.revision++;
    return structuredClone(project);
  }
  async listJobs(projectId?: string, ownerId?: string) {
    return structuredClone(
      [...this.jobs.values()].filter((j) =>
        (!projectId || j.projectId === projectId) &&
        (!ownerId || this.projects.get(j.projectId)?.ownerId === ownerId)
      ).reverse().slice(0, 100),
    );
  }
  async getJob(id: string) {
    return structuredClone(this.jobs.get(id));
  }
  async enqueueValidation(projectId: string, key: string) {
    const project = this.projects.get(projectId);
    if (!project) throw new NotFoundError("Project not found");
    const existing = [...this.jobs.values()].find((j) =>
      j.projectId === projectId && j.idempotencyKey === key
    );
    if (existing) return structuredClone(existing);
    const at = new Date(this.now()).toISOString();
    const job: Job = {
      id: crypto.randomUUID(),
      projectId,
      kind: "project.validate",
      status: "queued",
      manifest: structuredClone(project.manifest),
      idempotencyKey: key,
      attempts: 0,
      leaseToken: null,
      leaseUntil: null,
      result: null,
      createdAt: at,
      updatedAt: at,
    };
    this.jobs.set(job.id, job);
    return structuredClone(job);
  }
  async claim(leaseMs: number): Promise<Lease | undefined> {
    const now = this.now();
    for (const job of this.jobs.values()) {
      if (
        job.status !== "queued" &&
        !(job.status === "running" && Date.parse(job.leaseUntil!) <= now)
      ) continue;
      if (job.attempts >= 3) {
        job.status = "failed";
        job.result = "Worker lease expired after 3 attempts";
        job.leaseToken = null;
        job.leaseUntil = null;
        job.updatedAt = new Date(now).toISOString();
        continue;
      }
      const token = crypto.randomUUID();
      job.status = "running";
      job.attempts++;
      job.leaseToken = token;
      job.leaseUntil = new Date(now + leaseMs).toISOString();
      job.updatedAt = new Date(now).toISOString();
      return { job: structuredClone(job), token };
    }
  }
  async complete(id: string, token: string, success: boolean, result: string) {
    const job = this.jobs.get(id);
    if (
      !job || job.status !== "running" || job.leaseToken !== token ||
      Date.parse(job.leaseUntil!) <= this.now()
    ) return false;
    job.status = success ? "succeeded" : "failed";
    job.result = result.slice(0, 4000);
    job.leaseToken = null;
    job.leaseUntil = null;
    job.updatedAt = new Date(this.now()).toISOString();
    return true;
  }
  async cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job || !["queued", "running"].includes(job.status)) return false;
    job.status = "cancelled";
    job.leaseToken = null;
    job.leaseUntil = null;
    job.updatedAt = new Date(this.now()).toISOString();
    return true;
  }
}

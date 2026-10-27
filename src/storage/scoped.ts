import type { Store } from "./store.ts";
import { NotFoundError } from "../domain/models.ts";
import type { Manifest, ProjectInput } from "../domain/manifest.ts";
import type { WebsiteDocument } from "../domain/website.ts";
import type { SiteDocument } from "../domain/site.ts";
import type { Project } from "../domain/models.ts";
import {
  permanentProjectIds,
  summarize,
  WebsiteLockedError,
} from "../billing/model.ts";
import { ValidationError } from "../domain/manifest.ts";
/** Every request-side operation is restricted to its authenticated owner; workers use the base store. */
export class ScopedStore implements Store {
  readonly durable: boolean;
  constructor(private base: Store, private ownerId: string) {
    this.durable = base.durable;
  }
  get billing() {
    return this.base.billing;
  }
  countProjects() {
    return this.base.countProjects(this.ownerId);
  }
  ping() {
    return this.base.ping();
  }
  async listProjects() {
    const projects = await this.base.listProjects(this.ownerId);
    const state = await this.billing.read(this.ownerId);
    const permanent = new Set(permanentProjectIds(state, projects));
    const unlimited = summarize(state, projects.length).unlimited;
    return projects.map((project) => {
      const locked = !unlimited && !permanent.has(project.id);
      return {
        ...project,
        ...(locked
          ? {
            document: null,
            repositoryUrl: null,
            manifest: {} as Project["manifest"],
          }
          : {}),
        locked,
        permanent: permanent.has(project.id),
      };
    });
  }
  async setPermanentProjects(ids: string[]) {
    await this.billing.mutate(this.ownerId, async (state) => {
      const projects = await this.base.listProjects(this.ownerId);
      const capacity = 1 + summarize(state, projects.length).purchasedSlots;
      if (
        ids.length > capacity || new Set(ids).size !== ids.length ||
        ids.some((id) => !projects.some((project) => project.id === id))
      ) {
        throw new ValidationError([
          "Choose only your own websites, within your permanent slot capacity.",
        ]);
      }
      state.permanentProjects = ids;
    });
  }
  async getProject(id: string) {
    const p = await this.base.getProject(id);
    if (p?.ownerId !== this.ownerId) return;
    const state = await this.billing.read(this.ownerId);
    if (
      !summarize(state, 0).unlimited &&
      !permanentProjectIds(state, await this.base.listProjects(this.ownerId))
        .includes(id)
    ) throw new WebsiteLockedError();
    return p;
  }
  private async requireProject(id: string) {
    if (!await this.getProject(id)) {
      throw new NotFoundError("Project not found");
    }
  }
  createProject(input: ProjectInput) {
    return this.base.createProject(input, this.ownerId);
  }
  async saveEditor(
    id: string,
    revision: number,
    document: WebsiteDocument | SiteDocument,
    manifest: Manifest,
  ) {
    await this.requireProject(id);
    return this.base.saveEditor(id, revision, document, manifest, this.ownerId);
  }
  async listJobs(projectId?: string) {
    const allowed = new Set(
      (await this.listProjects()).filter((project) => !project.locked).map((
        project,
      ) => project.id),
    );
    return (await this.base.listJobs(projectId, this.ownerId)).filter((job) =>
      allowed.has(job.projectId)
    );
  }
  async getJob(id: string) {
    const j = await this.base.getJob(id);
    return j && await this.getProject(j.projectId) ? j : undefined;
  }
  async enqueueValidation(id: string, key: string) {
    await this.requireProject(id);
    return this.base.enqueueValidation(id, key, this.ownerId);
  }
  async cancel(id: string) {
    if (!await this.getJob(id)) throw new NotFoundError("Job not found");
    return this.base.cancel(id, this.ownerId);
  }
  claim(_leaseMs: number): ReturnType<Store["claim"]> {
    throw new Error("Worker operation is unavailable in a user request");
  }
  complete(
    _id: string,
    _token: string,
    _success: boolean,
    _result: string,
  ): Promise<boolean> {
    throw new Error("Worker operation is unavailable in a user request");
  }
  close() {
    return Promise.resolve();
  }
}

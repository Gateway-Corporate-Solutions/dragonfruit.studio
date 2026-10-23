import type { Store } from "./store.ts";
import { NotFoundError } from "../domain/models.ts";
import type { Manifest, ProjectInput } from "../domain/manifest.ts";
import type { WebsiteDocument } from "../domain/website.ts";
import type { SiteDocument } from "../domain/site.ts";
/** Every request-side operation is restricted to its authenticated owner; workers use the base store. */
export class ScopedStore implements Store {
  readonly durable: boolean;
  constructor(private base: Store, private ownerId: string) {
    this.durable = base.durable;
  }
  ping() {
    return this.base.ping();
  }
  listProjects() {
    return this.base.listProjects(this.ownerId);
  }
  async getProject(id: string) {
    const p = await this.base.getProject(id);
    return p?.ownerId === this.ownerId ? p : undefined;
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
  listJobs(projectId?: string) {
    return this.base.listJobs(projectId, this.ownerId);
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

import type { Manifest } from "../domain/manifest.ts";
import type { SiteDocument } from "../domain/site.ts";
import type { WebsiteDocument } from "../domain/website.ts";
import type { ProjectInput } from "../domain/manifest.ts";
import type { Job, Lease, Project } from "../domain/models.ts";
export interface Store {
  readonly durable: boolean;
  ping(): Promise<void>;
  listProjects(ownerId?: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(input: ProjectInput, ownerId?: string): Promise<Project>;
  saveEditor(
    id: string,
    revision: number,
    document: WebsiteDocument | SiteDocument,
    manifest: Manifest,
    actorId?: string,
  ): Promise<Project>;
  listJobs(projectId?: string, ownerId?: string): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  enqueueValidation(
    projectId: string,
    key: string,
    actorId?: string,
  ): Promise<Job>;
  claim(leaseMs: number): Promise<Lease | undefined>;
  complete(
    id: string,
    token: string,
    success: boolean,
    result: string,
  ): Promise<boolean>;
  cancel(id: string, actorId?: string): Promise<boolean>;
  close(): Promise<void>;
}

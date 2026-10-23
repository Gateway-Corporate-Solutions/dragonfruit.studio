import type { SiteDocument } from "./site.ts";
import type { WebsiteDocument } from "./website.ts";
import type { Manifest, ProjectInput } from "./manifest.ts";
export interface Project extends ProjectInput {
  id: string;
  ownerId?: string | null;
  createdAt: string;
  document: WebsiteDocument | SiteDocument | null;
  revision: number;
}
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export interface Job {
  id: string;
  projectId: string;
  kind: "project.validate";
  status: JobStatus;
  manifest: Manifest;
  idempotencyKey: string;
  attempts: number;
  leaseToken: string | null;
  leaseUntil: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Lease {
  job: Job;
  token: string;
}
export class ConflictError extends Error {}
export class NotFoundError extends Error {}

import type { Manifest } from "../domain/manifest.ts";

/** Contracts only: no backend is implemented or advertised as usable yet. */
export interface FrozenSource {
  commit: string;
  repositoryUrl: string;
  root: string;
}
export interface Artifact {
  digest: string;
  source: FrozenSource;
  denoVersion: string;
  freshVersion: string;
}
export interface BuildExecutor {
  build(
    source: FrozenSource,
    manifest: Manifest,
    signal: AbortSignal,
  ): Promise<Artifact>;
}
export interface HostAgent {
  start(
    input: {
      projectId: string;
      releaseId: string;
      artifact: Artifact;
      manifest: Manifest;
    },
  ): Promise<{ instanceId: string }>;
  inspect(
    projectId: string,
    releaseId: string,
  ): Promise<"starting" | "ready" | "unhealthy" | "stopped">;
  stop(projectId: string, releaseId: string): Promise<void>;
}
export interface SourceProvider {
  readonly provider: "github" | "gitlab" | "bitbucket";
  resolve(repositoryUrl: string, ref: string): Promise<FrozenSource>;
}
export interface InfrastructureProvider {
  readonly provider: "digitalocean" | "aws" | "hetzner";
  inspectHost(
    id: string,
  ): Promise<{ id: string; state: "starting" | "ready" | "stopped" }>;
}
// Identity and SCM authorization intentionally remain separate contracts.
export interface IdentityProvider {
  readonly provider: "github" | "email";
  beginSignIn(returnTo: string): Promise<URL>;
}

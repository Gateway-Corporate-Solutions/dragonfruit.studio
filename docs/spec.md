# dragonfruit Product Specification

**Status:** Proposed. This document expands the planning requirements in the repository README; it does not describe an implemented product or finalized API.

## 1. Product Summary

dragonfruit is a self-hosted platform for creating, building, deploying, and operating Deno/Fresh applications. Its first deliverable is a reliable deployment dashboard for trusted applications on one Linux host. Browser-based development and constrained visual authoring are later capabilities built on persistent workspaces and the deployment foundation.

Applications remain normal Deno/Fresh projects and must be exportable and independently deployable. dragonfruit manages the workflow and execution environment; it should not make application source depend on a proprietary runtime API.

## 2. Goals and Non-Goals

### Goals

- Import a Git repository or create a project from a supported Fresh template.
- Configure build, runtime, environment, and persistent storage requirements.
- Build a fixed source revision in an isolated execution environment.
- Present build progress, retained logs, runtime health, and actionable failures.
- Start and verify a candidate release before directing production traffic to it.
- Preserve the current healthy release when a build or candidate fails.
- Promote and roll back immutable artifacts, with deployment history and auditability.
- Keep workflow state recoverable across worker restarts.
- Establish a secure foundation for later browser development and visual authoring.

### Non-goals for the initial release

- Hosting unrelated public tenants.
- Multi-region scheduling or Kubernetes orchestration.
- Arbitrary framework support or unrestricted visual editing of handwritten TSX.
- Collaborative editing.
- A browser terminal before development-session isolation and authorization exist.
- Automatic reversal of application database migrations during rollback.

## 3. Users and Roles

The following roles are product-level assumptions to validate during implementation; exact role names and permissions remain open.

| User | Primary needs |
| --- | --- |
| Project developer | Import a Fresh project, configure it, inspect checks and logs, preview changes, and deploy a revision. |
| Application operator | Inspect health and history, manage domains, restart or stop an app, and roll back safely. |
| Platform administrator | Manage the host and execution policy, maintain backups, and investigate platform-level failures. |

Every project and environment operation must be authorized for the acting user. Privileged operations must be auditable. The first release may assume a trusted, private installation, but must not treat that assumption as permission to expose unrestricted host control through the dashboard.

## 4. Product Boundaries

### Hosting MVP

The MVP covers authentication, project authorization, repository/template intake, project configuration, durable build and deployment jobs, isolated builds, artifact retention, runtime supervision, ingress promotion, HTTPS, logs, health, deployment history, rollback, and backup/recovery of persistent data.

The first supported deployment target is a single Linux host. The initial application adapter targets a pinned Deno version and a tested Fresh 2 version range. Fresh 1 support requires a separate adapter or an explicit migration workflow.

### Planned integrations

The following integrations are planned and are not implemented. Their provider APIs, permission scopes, and supported workflows must be validated before delivery.

| Area | Planned integrations | Product requirement |
| --- | --- | --- |
| User authentication | GitHub and email | Users can authenticate using GitHub or an email-based method. The email method (for example, password-based or passwordless) is an open decision. |
| Source code management | GitHub, GitLab, and Bitbucket | Users can connect repositories, select a repository and revision, and resolve an immutable commit for a build. Later Git write operations require separately scoped authorization. |
| Containerization | Docker | Builds and application releases use Docker-managed containers on the initial Linux execution target, subject to the platform's isolation and resource policy. |
| Infrastructure hosting | DigitalOcean, AWS, and Hetzner | Infrastructure lifecycle operations are provided through host-provider adapters. The private MVP selects one initial provider; support for the other providers is planned expansion. |

User identity and source-control authorization are separate concerns. A GitHub login must not implicitly grant repository access, and connecting a repository must not silently change the user's authentication identity. Provider credentials are scoped, revocable, and never exposed to application builds except as narrowly scoped temporary credentials when required.

Docker is an execution mechanism, not by itself a tenant-isolation guarantee. The dashboard must not expose Docker's management socket to browser-facing code; Docker operations are mediated by the authenticated host agent. DigitalOcean, AWS, and Hetzner are infrastructure targets, distinct from managed application-hosting backends such as Deno Deploy.

### Later capabilities

- **Browser development:** persistent workspaces, revision-aware editing, diagnostics, isolated preview sessions, hot reload, commits, and source export.
- **Visual authoring:** a versioned application model for a curated set of pages, forms, data bindings, and server actions, with explicit generated-code ownership.
- **Public hosting:** only after a threat model, stronger isolation evaluation, quotas, abuse handling, and operational review are complete.

## 5. Core Concepts

| Concept | Definition |
| --- | --- |
| Project | Application identity, source location, adapter, and project-level policy. |
| Environment | A deployment target with its own configuration, secrets, domains, and active release. |
| Source revision | An immutable Git commit or editor snapshot used as build input. |
| Job | Durable unit of work, such as validation, build, deploy, or cleanup, with progress and outcome. |
| Build | Result of processing a source revision with a selected toolchain and policy. |
| Artifact | Immutable, addressable output that contains all required runtime files and is identified by a digest. |
| Release | An artifact started with a particular configuration revision in an environment. |
| Deployment | A recorded release operation and its promotion outcome. |
| Runtime instance | An observed running or stopped process/container for a release. |
| Workspace | Mutable development files, separate from immutable source revisions and production releases. |
| Persistent application data | Data provisioned to survive release replacement and restart. |

## 6. Application Contract

Projects declare or select:

- Application root directory, including repositories containing multiple applications.
- Deno and Fresh toolchain versions, plus lockfile policy.
- Install, validation, build, and start tasks.
- Internal HTTP port and readiness path.
- Build timeout and runtime resource requests.
- Environment-specific non-secret configuration and secret references.
- Persistent volumes or external data services, when required.

The proposed dragonfruit manifest is versioned independently of Deno configuration. Task names must resolve in the project. Installation and lifecycle-script approval follow adapter policy. Manifest values cannot grant host privileges or broaden the execution boundary.

The Fresh 2 adapter must account for the complete production output, including the `_fresh` output, generated server entry point, relevant assets, and runtime dependencies. It must not assume a single output file is sufficient. The precise packaging procedure is a technical decision to verify in the execution prototype.

## 7. Functional Requirements

Priority labels: **P0** is required for the first complete deployment loop; **P1** supports the private hosting MVP; **P2** belongs to later capabilities.

### Project setup and configuration

- **FR-001 (P0):** An authorized user can create a project from a supported template or import a repository.
- **FR-002 (P0):** A project can identify its application root and supported toolchain.
- **FR-003 (P0):** An authorized user can configure validated build tasks, runtime port, readiness path, and resource limits.
- **FR-004 (P1):** Configuration is versioned so each deployment can reference the exact configuration used.
- **FR-005 (P1):** Environment secrets are stored as protected references/versions; secret values are never included in artifact metadata, logs, or audit events.
- **FR-006 (P1):** Domain ownership can be verified and certificate status displayed before a custom domain is treated as active.
- **FR-028 (P1):** Users can authenticate through GitHub or the selected email sign-in mechanism, with project authorization enforced independently of identity-provider login.
- **FR-029 (P1):** Repository connections support GitHub, GitLab, and Bitbucket through provider-specific, revocable credentials scoped to the requested operations.
- **FR-030 (P1):** The source-control adapter resolves a provider revision to an immutable commit before build execution and verifies incoming webhook signatures.
- **FR-031 (P0):** Docker container lifecycle operations are mediated by the host agent; browser-facing services do not receive Docker socket access.
- **FR-032 (P1):** The infrastructure adapter supports the selected initial provider from DigitalOcean, AWS, or Hetzner; additional providers must satisfy the same lifecycle contract before being declared supported.

### Build and deployment

- **FR-007 (P0):** A deployment job freezes an exact Git commit or editor snapshot before executing project code.
- **FR-008 (P0):** Build, validation, and test commands execute in a disposable isolated environment using the selected toolchain and explicit dependency-script policy.
- **FR-009 (P0):** A successful build produces an immutable artifact with a digest and source/toolchain provenance.
- **FR-010 (P0):** A candidate release starts without replacing the currently active release.
- **FR-011 (P0):** The platform checks the configured readiness path and performs a smoke check before production promotion.
- **FR-012 (P0):** An unhealthy candidate is not promoted; the prior active release remains available.
- **FR-013 (P0):** Promotion is ordered per environment so an older deployment cannot supersede a newer promoted deployment.
- **FR-014 (P0):** Rollback selects and starts a retained artifact; it does not rebuild the source.
- **FR-015 (P1):** Authorized users can cancel queued or running jobs, and cancellation terminates the full process tree and cleans up execution resources.
- **FR-016 (P1):** Authorized users can restart or stop an application without deleting its provisioned persistent data.
- **FR-017 (P1):** The system retains successful and failed deployment records, including outcome, timestamps, source revision, artifact digest, toolchain, configuration revision, and secret-version references.

### Operations and observability

- **FR-018 (P0):** Users can inspect job state, progress, retained logs, and failure reasons after completion.
- **FR-019 (P1):** Users can distinguish job progress from observed runtime health.
- **FR-020 (P1):** The dashboard displays runtime health, resource usage, application errors, deployment history, domain verification, and certificate status.
- **FR-021 (P1):** Progress and log streams reconnect safely, enforce authorization, and use bounded buffering and retention.
- **FR-022 (P1):** Sensitive operations emit audit events identifying actor, action, target, and time without including secret values.

### Browser development and visual authoring

- **FR-023 (P2):** Workspaces support safe file operations, revision-based saves, conflict detection, and recovery.
- **FR-024 (P2):** A workspace-scoped Deno language server provides diagnostics and completion.
- **FR-025 (P2):** Development previews are isolated, authenticated, hot-reload capable, resource-limited, and subject to idle expiration.
- **FR-026 (P2):** Source revisions can be committed and exported without changing an active production release.
- **FR-027 (P2):** Visual authoring generates only supported Fresh patterns from a versioned model; handwritten extension points remain developer-owned.

## 8. State and Lifecycle Requirements

Job state and runtime state are separate dimensions.

| Entity | States |
| --- | --- |
| Job | `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| Runtime instance | `starting`, `ready`, `unhealthy`, `stopped` |
| Deployment | Proposed lifecycle: requested, candidate starting, verifying, promoted or rejected; terminal records remain queryable. |

The deployment flow is: freeze source, prepare isolated build, install dependencies under policy, validate, build, retain artifact, start candidate, verify readiness and smoke checks, promote ingress, drain the previous release, and later clean up expired resources. A failure before promotion must not disturb the active release.

Retries must be idempotent. Worker claims use expiring leases so abandoned work can be recovered. A reconciler compares desired and observed host state. Cancellation and shutdown must have defined cleanup/drain behavior. The detailed deployment state machine and timeout values are implementation design decisions.

## 9. Security and Privacy Requirements

- Project authorization applies to every API operation, log stream, and event subscription.
- Builds and runtime workloads run as unprivileged identities with CPU, memory, process-count, disk, and time limits.
- OS-level isolation is required in addition to Deno permissions because project code, dependencies, plugins, checks, and tests execute.
- Mounts, network access, and credentials are explicitly scoped. Access to platform services and cloud metadata endpoints is restricted.
- Build credentials are separated from production runtime secrets; untrusted branch builds never receive production secrets.
- The dashboard does not expose unrestricted container-management sockets or a general host shell.
- Host-agent communication is authenticated, and agent operations are narrow and release-scoped.
- Sessions are protected; state-changing requests have CSRF defenses; repository webhooks are signature-verified.
- Imported repository paths and archives are handled safely.
- Preview apps use a separate domain and cookie boundary from the dashboard.
- Secrets are encrypted with key material stored separately from the metadata database.

Public multi-tenant hosting is explicitly gated on a documented threat model and reviewed isolation design.

## 10. Data, Retention, and Recovery

PostgreSQL stores metadata and durable job state. Object storage and/or a container registry retain source snapshots and build artifacts. Runtime filesystems, workspaces, artifacts, and persistent application data have distinct lifecycles.

The platform must define retention and cleanup policies for logs, artifacts, source snapshots, cancelled jobs, and expired development sessions. Replacing a release must not delete provisioned persistent application data. Backups must cover the metadata database, persistent application data, and the material needed to restore encrypted configuration. Restore procedures require verification, not merely successful backup creation.

Rollback restores an application artifact and compatible configuration. It does not automatically reverse database migrations. Application schema changes must use explicit coordination and backward-compatible migration practices; backup and recovery procedures must be verified.

## 11. Reliability and Performance Expectations

The README does not set numeric SLOs or capacity targets. Those values must be agreed before production launch. The MVP must nevertheless satisfy these behavioral guarantees:

- Jobs survive worker restarts and recover or retry safely.
- Duplicate retries do not create duplicate active releases.
- Per-environment deployment ordering prevents stale promotion.
- Failed builds and unhealthy candidates leave the active release serving traffic.
- Rollback uses a retained artifact.
- Application data survives release replacement.
- Log and event streaming is bounded and reconnectable.
- Shutdown drains traffic and handles long-lived connections within a defined timeout.
- Host failure, worker crash, noisy workloads, and backup restoration are exercised before public hosting.

## 12. First Deployment Loop Acceptance

The first complete deployment loop is accepted when all of the following are demonstrated:

1. A Fresh application can be imported, built, and served over HTTPS.
2. A broken build leaves the active release available.
3. An unhealthy candidate never receives production traffic.
4. An older deployment cannot overwrite a newer promoted release.
5. Rollback restores a retained artifact without rebuilding it.
6. Worker restarts recover or safely retry interrupted work.
7. Logs and failure details remain available after a job completes.
8. Replacing a release preserves its provisioned persistent data.
9. Application execution cannot access platform credentials or management interfaces.

## 13. Open Product Decisions

Resolve these before or during the relevant implementation phase:

- Initial Deno and Fresh version pins and the supported Fresh 2 range.
- Authentication provider and initial role/permission model.
- Email authentication mechanism and GitHub identity-provider scopes; these are distinct from source-control authorization scopes.
- Initial source-control provider order, callback/webhook behavior, and required GitHub/GitLab/Bitbucket API scopes.
- Initial infrastructure provider among DigitalOcean, AWS, and Hetzner, plus the provider API operations in scope for MVP.
- Docker version/support policy, daemon placement, image registry choice, and hardening requirements beyond container limits.
- Exact manifest schema and validation/error UX.
- Build network policy, dependency lifecycle-script policy, and private registry credential handling.
- Artifact, log, source snapshot, and persistent-data retention periods.
- Numeric resource ceilings, timeouts, SLOs, and host capacity targets.
- Ingress implementation, domain verification procedure, and certificate operations.
- Backup frequency, encryption-key recovery, and restore objectives.
- Whether the initial private installation has one operator-managed organization or needs multiple organizations.

## 14. Source References

The repository README is the planning source for this specification. Framework and runtime behavior must be checked against the current official references listed there, especially Fresh deployment and Deno security documentation, before implementation decisions are finalized.

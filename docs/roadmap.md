# dragonfruit Project Roadmap

**Status:** Editor foundation implemented; the hosting phase gates below remain planned. There are no calendar dates because scope, host choices, and capacity have not yet been finalized.

## Active product workstream — editor first

Public homepage, GitHub/email account access, and the multi-page editor are implemented: name-only creation, a starter design, visual controls, adjacent raw CSS, revisioned drafts, expert manifest settings, standard page templates, interactive layers, guided form integrations, editable interaction JavaScript, light/dark appearance, and complete Fresh/React project ZIPs with form backends. The user does not need a repository or manifest to begin.

Next: a managed asset library, responsive authoring, and a real publish flow. The infrastructure phases below remain the backend workstream. Their phase numbers do not postpone the editor or define onboarding.

## Delivery Strategy

Develop the authoring experience alongside the isolated deployment loop. Keep arbitrary source workspaces separate from constrained visual authoring. The central release pipeline, durable job model, isolation boundary, and rollback guarantees are prerequisites for both later capabilities. Start on one Linux host for trusted applications; treat public multi-tenant hosting as a separate readiness gate, not a consequence of the private MVP.

Each phase has an exit gate. Work should advance only when its gate is demonstrated and documented. Infrastructure choices remain open until the relevant prototype or operational test validates them.

## Phase 0: Execution Prototype

**Outcome:** Prove that a fixed Fresh source revision can be built, packaged, started, verified, and routed on the initial host without involving a full dashboard workflow.

**Work items**

- [ ] Select and pin the initial Deno version and tested Fresh 2 range.
- [ ] Validate Docker as the initial container build/runtime mechanism and document daemon placement and security boundaries.
- [ ] Define the host-provider adapter contract and choose one initial target from DigitalOcean, AWS, or Hetzner.
- [ ] Define and validate the versioned application manifest and Fresh adapter contract.
- [ ] Confirm the Fresh production output and package all required server, asset, and runtime files.
- [ ] Freeze and build one source revision in an isolated disposable environment.
- [ ] Define dependency installation, lifecycle-script approval, network access, and build credential policy.
- [ ] Produce a digest-addressed immutable artifact.
- [ ] Start the artifact with declared runtime limits and configuration.
- [ ] Verify readiness and a smoke request before routing traffic through ingress.
- [ ] Exercise build failure, candidate startup failure, cleanup, and host-agent communication.

**Exit gate**

- A Fresh 2 sample starts from the produced artifact on the selected Linux host and serves an HTTPS request through ingress.
- The artifact's source revision and toolchain are recorded and can be inspected.
- A failed build or unhealthy candidate does not replace the active release.
- The execution boundary, ingress, artifact storage, and host-agent choices are documented with known limitations.

## Phase 1: Private Hosting MVP

**Depends on:** Phase 0 execution and packaging proof.

**Outcome:** An authenticated operator can deploy and operate trusted Fresh applications on a single host through the dashboard.

**Work items**

- [ ] Add authentication, project-level authorization, audit events, and metadata migrations.
- [x] Implement GitHub OAuth and Postmark passwordless email account authentication, owner-scoped websites, and durable sessions.
- [ ] Keep user identity credentials separate from GitHub/GitLab/Bitbucket source-control authorization.
- [ ] Define projects, environments, configuration revisions, source revisions, jobs, builds, artifacts, deployments, domains, hosts, and runtime instances.
- [ ] Implement durable jobs, worker leases, retries, idempotency, cancellation, and reconciliation.
- [ ] Enforce per-environment ordering so stale builds cannot promote over newer releases.
- [ ] Add repository import and immutable revision resolution for GitHub, GitLab, and Bitbucket, plus a supported Fresh template.
- [ ] Verify source-control webhooks and scope/revoke provider credentials for the supported operations.
- [ ] Provide build/runtime configuration, protected secrets, and storage declarations.
- [ ] Provide job progress, retained logs, actionable failures, health, resource usage, and deployment history.
- [ ] Implement candidate verification, HTTPS ingress, traffic promotion, draining, and artifact-based rollback.
- [ ] Add custom domain verification and certificate status.
- [ ] Separate build credentials from runtime secrets and enforce the agreed execution policy.
- [ ] Integrate the selected initial infrastructure provider through the host-provider adapter and exercise credential and host lifecycle failure handling.
- [ ] Back up metadata and persistent application data; document and test restoration of encrypted configuration.
- [ ] Exercise worker restarts, host-agent interruption, cancellation, failed promotion, and runtime unhealthy states.

**Exit gate**

Meet every first deployment loop acceptance criterion in `spec.md`, including that failed builds and unhealthy candidates preserve availability, stale deployments cannot promote, rollback reuses retained artifacts, worker restarts recover safely, logs remain available, persistent data survives release replacement, and application execution cannot reach platform credentials or management interfaces.

The MVP's supported integration matrix must state which of DigitalOcean, AWS, and Hetzner is the initial infrastructure target. Docker is the container backend. Authentication and source-control access must be independently authorized, and the MVP repository providers must resolve builds to immutable commits.

## Phase 2: Browser Development

**Depends on:** Phase 1 authorization, execution isolation, durable source snapshots, and cleanup mechanisms.

**Outcome:** Developers can edit a persistent workspace, understand diagnostics, and preview changes without modifying production releases.

**Work items**

- [ ] Implement persistent workspaces and revision-aware saves.
- [ ] Add safe file create, rename, and delete operations, conflict detection, and recovery.
- [ ] Integrate an established editor (Monaco or CodeMirror; choose during implementation).
- [ ] Run a workspace-scoped Deno language server for diagnostics and completion.
- [ ] Add isolated authenticated previews, hot reload, resource limits, and idle session cleanup.
- [ ] Add source commits, branches, and repository credential scoping as required by the workflow.
- [ ] Support source export and an explicit snapshot/deployment action.
- [ ] Keep browser terminal out of scope until session isolation, authorization, and audit behavior are reviewed.

**Exit gate**

- Edits are revisioned and recoverable, conflicts are surfaced rather than silently overwritten, and preview sessions are isolated and expire as configured.
- Workspace changes cannot mutate active production releases unless a separate deployment is requested.
- A project can be committed/exported and deployed independently of the browser editor.

## Phase 3: Public Hosting Readiness

**Depends on:** A stable private hosting MVP and a reviewed public-tenant threat model.

**Outcome:** A go/no-go decision for hosting unrelated public tenants, based on evidence about isolation, resource control, and operational response.

**Work items**

- [ ] Document tenant threat model and perform an isolation review for build and runtime execution.
- [ ] Evaluate stronger isolation mechanisms for untrusted workloads; do not treat hardened containers alone as proof of readiness.
- [ ] Enforce per-project/tenant quotas, rate limits, and cost/resource accounting.
- [ ] Add abuse detection and response procedures, operational alerts, and incident ownership.
- [ ] Test noisy-neighbor behavior, resource exhaustion, host failure, credential boundaries, and network restrictions.
- [ ] Run backup restoration and host recovery drills.
- [ ] Review public ingress, preview cookie separation, webhook handling, and denial-of-service exposure.
- [ ] Add additional hosts only when measured capacity or availability requirements justify them.
- [ ] Complete and validate the remaining DigitalOcean, AWS, and Hetzner provider adapters against the shared host lifecycle contract; retain the MVP provider's tests as conformance coverage.

**Exit gate**

- Security and operations owners approve the documented threat model and tested isolation controls.
- Quotas, abuse response, monitoring, restore procedures, and operational ownership are in place.
- Residual risks and supported workload boundaries are documented before accepting public tenants.

## Phase 4: Visual Authoring Expansion

**Depends on:** Stable Fresh adapter, versioned source/workspace model, and exportable generated applications.

**Outcome:** A constrained visual model produces maintainable Fresh code without claiming arbitrary handwritten TSX can round-trip safely.

**Work items**

- [ ] Define the versioned application model and generated-code ownership rules.
- [ ] Specify migration and compatibility behavior for model versions.
- [ ] Provide a curated component and template catalog.
- [ ] Generate supported pages, layouts, forms, validation, bindings, and server actions.
- [ ] Define developer-owned extension points for handwritten logic.
- [ ] Test edits to generated regions and report conflicts rather than silently erasing developer changes.
- [ ] Verify generated projects build, deploy, and run independently of dragonfruit.

**Exit gate**

- The model is versioned and validated, generated-code ownership is explicit, supported workflows have tests, and exported applications remain ordinary deployable Deno/Fresh projects.

## Cross-Phase Decisions and Enablers

These decisions should be made at the phase where evidence is available, rather than being treated as settled prematurely:

- Deno/Fresh versions, manifest schema, and adapter compatibility policy: Phase 0.
- Docker runtime, isolation policy, host-agent protocol, and ingress: Phase 0, then security-reviewed in Phases 1 and 3.
- Initial infrastructure provider and shared provider contract: choose in Phase 0; validate additional DigitalOcean, AWS, and Hetzner implementations as capacity and readiness permit.
- GitHub/email identity sign-in, GitHub/GitLab/Bitbucket source-control scopes, and the boundary between them: Phase 1 before exposing deployment controls.
- Authentication, authorization, secret storage, and audit model: Phase 1 before exposing deployment controls.
- Artifact/log retention, persistent storage, backup frequency, key recovery, and restore objectives: Phase 1 before production data is entrusted to the platform.
- Numeric SLOs, resource ceilings, quotas, alert thresholds, and capacity targets: establish for Phase 1 operations and revisit for public hosting.
- Workspace revision and generated-code ownership semantics: define before Phases 2 and 4 respectively.

## Risks and Mitigations

| Risk | Mitigation / decision gate |
| --- | --- |
| Fresh build output packaging is incomplete | Prove the full runtime artifact in Phase 0 against pinned versions; include server output, assets, and runtime dependencies. |
| Identity login is confused with repository authorization | Keep identity and source-control adapters/scopes separate; test GitHub login without repository access and repository access without changing identity. |
| Provider API differences leak into orchestration | Define common source-control and host-provider contracts; keep provider-specific behavior behind adapters and test conformance. |
| Docker control becomes a host-escape path | Keep Docker access behind the authenticated host agent, restrict operations, and evaluate isolation beyond containers before public hosting. |
| Cloud-provider integration expands MVP scope | Select one infrastructure provider for the private MVP; add DigitalOcean, AWS, and Hetzner support through later adapter work. |
| Builds execute hostile or accidental code | Use disposable OS-isolated executors, explicit egress and mount policy, strict limits, and scoped credentials; review before public hosting. |
| Failed deployment causes downtime | Start a candidate separately, verify readiness, make ingress promotion observable, and retain the prior artifact for rollback. |
| Retries or races promote stale/duplicate releases | Durable idempotent jobs, worker leases, and per-environment serialization/generation checks; test crash and race scenarios. |
| Runtime replacement loses application data | Separate persistent volumes/external data from replaceable release filesystems; verify backup and restore. |
| Secret leakage through logs or artifacts | Separate build and runtime credentials, redact/omit secrets from metadata and audit events, and test boundary behavior. |
| Public tenant risk exceeds container isolation | Keep public hosting gated on threat modeling, stronger isolation evaluation, quotas, abuse handling, and operational approval. |
| Visual generation conflicts with handwritten code | Constrain supported patterns and define generated ownership and developer extension points before implementation. |

## Readiness Tracking

Track completion through demonstrated evidence rather than calendar estimates. For each checklist item, record an owner, implementation link, verification method, and outstanding risks when work begins. Keep acceptance tests tied to the phase exit gates; a task marked complete without its gate evidence does not make the phase complete.

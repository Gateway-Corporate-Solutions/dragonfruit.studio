# Implementation checkpoint

## Implemented public access

- Public product homepage at `/`, with light/dark appearance and responsive signup/login modal.
- GitHub OAuth with state, PKCE, and verified primary-email lookup; identity-only scopes.
- Passwordless email sign-in via Postmark, fixed sender `info@dragonfruit.studio`, ten-minute one-use browser-bound links, and explicit confirmation.
- Durable PostgreSQL sessions, Secure/HttpOnly host cookies in production, logout, request limits, and origin enforcement.
- User-owned websites and owner-scoped drafts/API tests/jobs; separate operator access and preserved legacy unowned projects.
- Migration 003 for accounts, identities, proofs, sessions, counters, and owner IDs.

## Implemented authoring experience

- Name-only website creation, with automatic slug, manifest defaults, and starter design.
- Full editor with canvas selection, layers, content, GUI styling, and adjacent raw CSS.
- Shared style data that preserves custom declarations across visual changes.
- Add, move, delete, undo, and redo for basic elements plus links, images, forms, carousels, accordions, navbars, and navmenus.
- Guided form API editor with preview, Resend, Mailchimp, and webhook connections, field mapping, environment references, expert JSON, and non-delivery tests.
- Animation presets and actual editable interaction JavaScript, with syntax validation and restore-to-preset controls.
- Server-side form handlers in both export formats; React includes a Node server and Vite API proxy.
- Desktop/mobile canvas widths and clean preview mode.
- Explicit draft saving with revision conflict detection.
- Editable manifest under Settings.
- Standard page templates, separate page designs, page selection, nested URLs, navigation synchronization, page rename/delete, and website-level undo/redo.
- Complete Fresh or React project ZIPs, with a format toggle and generated source inspection.
- Native vector dragonfruit illustration and processed CSS source outside the public directory.
- Higher contrast light/dark appearance with a persistent sun/moon toggle immediately before Save draft.

## Preserved hosting foundation

PostgreSQL metadata, migrations, memory demo, bounded JSON API, operator gate, durable configuration-check queue, separate worker, and typed future provider/execution contracts remain.

Migration 002 makes repositories optional and adds page documents and revision counters. Run migrations when upgrading. Existing projects receive a starter view until their first design save; repository code is not visually imported.

## Scope and limits

This is a multi-page visual editor (16 pages, 80 elements per page). The version 2 website document is authoritative. Version 1 single-page drafts upgrade losslessly to Home at `/`; existing JSONB storage needs no new migration. CSS supports declarations without external URLs, selectors, or rule blocks; arbitrary HTML is excluded. Preview runs explicit per-layer expert JavaScript inside an opaque sandbox. It allows form validation and HTTPS images, but blocks fetch connections and native form delivery. Design does not run widget JavaScript.

The Code view is generated/read only and exports a complete Fresh or React project, including all pages and run instructions. A managed asset library, responsive breakpoint editing, handwritten code workspaces, additional identity-provider integrations, build execution, and hosting are not implemented.

Saving is explicit; there is no autosave. Undo history lives in the editor session. Demo drafts survive reload but disappear when the server process restarts. PostgreSQL drafts persist, but live PostgreSQL/Docker verification remains separate from local demo tests.

The publish action reports unavailability and never claims a deployment succeeded.

## Verification

All 43 unit tests, formatting, lint, type checks, the production build, and production HTTP smoke checks pass. Exported Fresh and React projects with the new layers install and build. Both run with carousel/keyboard navigation, accordion behavior, menu/Escape handling, form API responses, and direct page URLs. ZIP integrity and browser downloads are checked.

The suite includes name-only creation, CSS round-trip, unsafe content rejection, revision conflicts, legacy draft upgrades, templates, independent page content, route validation, navigation updates, export scaffolds, form validation, server credential boundaries, mocked provider payloads/errors, Mailchimp consent/double opt-in, rate limits, layer/JavaScript persistence, and the existing queue/access coverage. The production smoke script also exercises editor persistence.

Browser verification covers the creation journey, element selection, visual/CSS synchronization, draft reload, advanced manifest persistence, element insertion, source generation, page creation/selection/deletion, nested URL changes, preview navigation, both ZIP downloads, theme persistence, and phone layout. Light/dark interface text contrast was checked on dashboard, Jobs, Platform, new-project, and editor views. Jobs was checked under Vite development without public CSS warnings or failed assets. Database integration and Docker image building require the corresponding external services; they are not inferred from memory-mode success.


## Form delivery boundary

The builder's API test endpoint validates unsaved drafts without contacting third parties. Exported Fresh applications register a form endpoint in their server; React projects include a Node form backend, production static serving, and a Vite development proxy. Credential values are not authored or stored in dragonfruit. Environment variable names are exported in `.env.example`. Local provider request tests use mocks; real delivery requires configured accounts and server secrets. Provider responses are sanitized and submissions are not stored locally. Per-form rate limiting is process-local.

## Interaction ownership

Default programs implement accessible controls and reduced motion; authored JavaScript replaces a layer's default program. The editor exposes the real function body rather than a placeholder hook. GUI animation settings are preserved as options. Runtime cleanup supports React page transitions. Default markup is escaped before it is embedded in generated page source; raw HTML editing remains unsupported.

## Account verification

Unit coverage includes Postmark sender/payload, proof expiration/binding/replay, session rotation/revocation, provider failures and rate limits, GitHub state/PKCE and verified-email checks, secure cookie attributes, verified-email identity convergence, and owner-restricted project/job operations. Browser checks use mocked external provider responses against the built application. Real account activation requires configured GitHub credentials and a Postmark server token plus sender verification. No live emails were sent during verification.

The PostgreSQL integration suite now also covers concurrent identity creation, atomic challenge consumption, durable session lookup/revocation, rate counters, project ownership, and audit actors. It requires a dedicated `TEST_DATABASE_URL`; it is not inferred from memory-adapter success.

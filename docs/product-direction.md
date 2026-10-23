# Product direction

## Defining methodology

**Simple by default, expert configuration always available.**

dragonfruit is an authoring environment first. Hosting and configuration support the act of building a website; they do not define the first-run experience.

## Default journey

Public homepage → Sign up / Log in → New website → Name → Editor → Preview → Export / future Publish.

After sign-in, naming is the only required project setup step. Application defaults and a starter design are created automatically. Repositories, slugs, manifests, credentials, and runtime details do not appear in the easy creation path.

The current publish control explains that publishing is unavailable. It must not manufacture a deployment or report a preview as a published website.

## Progressive depth

| Task | Default interaction | Expert interaction |
| --- | --- | --- |
| Change text | Select element and edit content | Future source workspace |
| Style an element | GUI color, typography, layout, and spacing controls | Adjacent CSS declarations editor |
| Configure runtime | Sensible defaults | Settings → application manifest |
| Inspect/export code | Optional Code view | Choose a complete Fresh or React project ZIP |
| Form delivery | Integration cards, field mapping, local sample tests | API JSON, merge tags, and environment variable names |
| Interactivity | Animation, timing, autoplay, accordion/menu controls | Actual editable layer JavaScript with preset restore |
| Publish | Website-level action | Future build/runtime diagnostics and deployment controls |

Visual and expert styles share a single declaration map. Switching modes must preserve declarations that the GUI does not expose. Failed parsing must leave the applied design intact.

## Ownership and saving

The versioned website document owns generated source. Source export is explicitly read only inside the current editor. Explicit layer interaction JavaScript is supported; arbitrary handwritten TSX import and round-trip editing are not claimed.

A saved draft includes all page documents and manifest in one revision-guarded operation. A conflict preserves local work and asks the user to export or reload; it must not overwrite the newer draft. A draft save is distinct from publication.

Standard templates and synchronized page navigation make multi-page creation part of the default path. Names and URLs remain editable in Settings. The Code view offers Fresh/React project ZIPs. Higher contrast light/dark controls affect authoring chrome independently from website styles.

## Current boundary

The editor supports up to 16 pages, with sections, groups, headings, text, labels, links/buttons, images, forms, carousels, accordions, and navigation menus. CSS is element-scoped declarations, not a full stylesheet workspace. It includes content editing, adding/moving/deleting elements, session undo/redo, desktop/mobile previews, persistence, and source export.

A managed asset library, explicit responsive breakpoints, arbitrary TSX editing, repository synchronization, and actual hosting follow this foundation. They must retain the same simple/expert relationship.

## Backend requirements remain

Isolated execution, immutable artifacts, durable orchestration, readiness-gated promotion, and rollback are still required for real hosting. They move behind the authoring experience rather than becoming onboarding requirements.

The earlier infrastructure phase numbering in the roadmap represents the hosting workstream, not the user's product journey. Visual authoring has begun now; it is not deferred until after the entire hosting platform.


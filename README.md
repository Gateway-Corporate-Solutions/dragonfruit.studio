# dragonfruit

**Build a website visually. Go as deep as you want.**

dragonfruit is a website builder and application platform written in Deno and Fresh. Its defining methodology is:

> **Simple by default. Expert configuration always available.**

The public homepage introduces dragonfruit and offers a signup/login modal. Sign in with GitHub or an email link, then start a website by giving it a name. Enter the editor immediately. Add familiar page templates, shape each page with visual controls, switch to element CSS whenever you need precision, and open application settings when you need control over the underlying Fresh application.

## The product experience

1. **Sign in and name your website.** No repository, manifest, or framework knowledge required.
2. **Start designing.** A ready-to-edit Home page opens in the website editor.
3. **Grow your website.** Add standard page templates and switch between pages from the page list or header.
4. **Select and customize.** Click an element on the canvas or choose it from the layers panel.
5. **Go deeper when needed.** Element CSS sits next to visual controls; build/runtime configuration lives in Settings.
6. **Save and preview.** Keep a revisioned draft and check desktop or mobile layouts.
7. **Export.** Choose Fresh (Deno) or React (Vite) in Code and download a runnable project ZIP.
8. **Publish.** Hosting is the next backend milestone. The current editor supports drafts and source export; publishing is not connected yet.

The underlying manifest remains editable. It is never an onboarding prerequisite.

## Available now

| Feature | Behavior |
| --- | --- |
| Public homepage and accounts | Signup/login modal, GitHub OAuth, Postmark email links, session cookies, logout, and user-owned workspaces |
| Name-only creation | Creates a website with a starter page and sensible application defaults |
| Visual editor | Live canvas, layer selection, content editing, colors, typography, layout, and spacing |
| Element CSS | Editable declarations using the same style data as visual controls |
| Add and arrange | Sections, headings, text, buttons, links, images, forms, carousels, accordions, navbars, and navmenus |
| Form APIs | Guided Resend, Mailchimp, webhook, and preview integrations; field mapping, server environment references, expert JSON, local tests |
| Interactive behavior | Animation presets, timing, autoplay, accordion/menu options, and editable per-layer JavaScript |
| Page management | Up to 16 pages; templates, page selection, names, nested URLs, deletion, and synchronized navigation |
| Undo and redo | Undo/redo design and page-management changes during the editor session |
| Draft persistence | Save design and manifest together, with revision conflicts surfaced |
| Preview | Desktop/mobile canvas widths and a clean preview mode |
| Expert settings | Editable application manifest with validation and explicit application |
| Source access | Read-only generated source, Fresh/React format toggle, and complete runnable project ZIP |
| Appearance | Higher contrast light/dark interface with a persistent sun/moon toggle beside Save draft |
| Hosting groundwork | PostgreSQL metadata, durable configuration-check jobs, worker, adapter contracts |

**Scope:** a multi-page visual editor and control-plane foundation. Arbitrary TSX workspace editing, repository import, application builds, production hosting, additional authentication-provider integrations, and visual editing of existing external code remain planned.

## Visual and expert controls share one model

Each page element has content, a semantic tag, and CSS declarations. Visual controls edit those declarations; the CSS tab edits them directly. Custom properties and supported declarations without a visual control survive later visual changes.

- Typography uses numeric controls, unit selectors, and font-weight choices.
- Colors offer a native color picker and a value field.
- Inner and outer spacing offer independent controls for each side.
- Layout and text alignment use GUI choices.
- Responsive/custom values remain available in CSS instead of being silently replaced.
- Unapplied CSS and manifest edits must be applied or discarded before saving.
- Invalid edits show errors; stale revisions do not overwrite a newer saved draft.

The editor does not pretend arbitrary handwritten TSX can round-trip through the visual model. The generated project is exportable, and its read-only status inside the editor is explicit. Full source editing is a future workspace capability.

## Pages and project export

Use **+ Add page** in Design to start from Home, About, Services, Contact, Pricing, FAQ, Portfolio, Blog, or Blank. Each page has its own elements and styles. Page links are synchronized when adding, renaming, or deleting pages; existing element edits are preserved. Select a page in the sidebar or header, or follow its navigation link in Preview. Settings exposes its name, title, and URL. The root Home page remains at `/` and cannot be deleted. Websites support 16 pages with up to 80 elements each.

In **Code**, choose **Fresh (Deno)** or **React (Vite)** and select **Download website.zip**. The archive includes every page, navigation, styling, configuration, and a README with run/build commands. Exports use the applied in-memory design, including changes you have not saved to the draft. Apply or discard pending CSS and manifest edits before exporting.

| Export | Contents | Run after extraction |
| --- | --- | --- |
| Fresh | Fresh 2 file routes, Preact rendering, Deno/Vite configuration, styles | `deno install`, then `deno task dev` |
| React | React application, browser routing, page data, scoped styles, TypeScript/Vite configuration | `npm install`, then `npm run dev` |

Fresh requires the tested Deno 2.9.5 runtime. React requires Node.js 22.12+ and npm. Dependencies install on first use; keep the generated lockfile. Both exports run independently of dragonfruit. React exports now include a Node backend and development proxy for form submissions. Run `npm start` after building to serve both the site and its API; static-only hosting requires a separate backend and `/api` proxy. Template contact details and products are examples. Markdown article pages, product catalogs, carts, Stripe hosted checkout, and booking schedules are included; configure integrations before launch.

The sun/moon control changes the editor and dashboard appearance, remembers the choice on this browser, and initially follows system preference. Your authored website colors remain as designed. The dashboard illustration is a native vector SVG. Source CSS lives in `assets/` so Vite processes it instead of importing files from the public directory.

## Layers, form APIs, and JavaScript

Open **Design → + Add** for Link, Form, Carousel, Accordion, Image, Navbar, and Navmenu layers, alongside the original basic elements. Every layer retains the visual styling and adjacent CSS controls.

- **Link:** destination and optional new tab, with safe link attributes.
- **Image:** HTTPS URL or embedded upload, alt text, fit, width, and height.
- **Form:** editable labels, field names/types, required flags, submit label, success message, and API connection. Forms start with a local preview connection.
- **Carousel:** editable/reorderable slides, optional slide images/links, fade/slide/none, duration, interval, and autoplay with pause controls.
- **Accordion:** editable panels, animation, duration, and single/multiple open behavior.
- **Navbar/Navmenu:** editable menu links, a “Use website pages” shortcut, mobile/always collapse, and animation options. Renaming/deleting page URLs repairs matching menu links.

**API** follows a guided sequence: choose an integration, configure delivery, connect forms, and test sample data. The test endpoint validates the current unsaved design without sending or storing anything. The preview canvas also validates forms without delivery.

| Integration | Guided setup | Server environment values in the exported project |
| --- | --- | --- |
| Preview | Local validation without delivery | None |
| Resend | Email field and notification subject | API key, verified sender, recipient(s) |
| Mailchimp | Email field, consent checkbox, optional first name | API key with data-center suffix and audience ID |
| Webhook | HTTPS JSON endpoint and optional Bearer token | Webhook URL and optional token |

Variable names are configurable, with defaults such as `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_TO`, `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`, `WEBHOOK_URL`, and `WEBHOOK_TOKEN`. Their values belong only in the deployed server environment or local exported `.env`. The editor stores variable names, never credential values. Each exported archive includes `.env.example` and exact startup instructions. Configure `PUBLIC_ORIGIN` for the browser-facing origin behind a reverse proxy.

Mailchimp uses double opt-in (`pending`) and requires an affirmative consent checkbox. Provider delivery uses declared form fields only, fixed configured recipients, bounded requests, a honeypot, per-form process-local rate limits, timeouts, and sanitized public errors. Actual email/newsletter/webhook delivery happens in the exported application's backend, after credentials are configured. dragonfruit itself supplies authoring and non-delivery tests; it does not host these form endpoints yet. Submissions are not retained in a local inbox. Multi-instance deployments need a shared limiter.

**Expert · API JSON** edits the same guided configuration, including merge-tag mappings and submission limits. **Expert · Layer JSON** exposes widget/form options. Carousel, Accordion, Navbar, and Navmenu also expose **Expert · JavaScript**, containing the actual interaction function body. Apply edits, discard them, or restore the preset. Syntax errors are reported before applying/saving. Custom JavaScript stays attached to its layer across GUI changes, saves, and both exports.

JavaScript receives `element`, `options`, and `api` (`on`, `animate`, `cleanup`). Register listeners with `api.on` and teardown with `api.cleanup` so React page navigation can dispose of them. Presets support keyboard interaction, reduced-motion preferences, and menu Escape handling; carousel autoplay pauses for focus/hover and hidden tabs. Design selects layers without running widget scripts. Preview runs them in a sandbox without same-origin access or fetch connections; HTTPS images are allowed. This is deliberate author-owned code, not a general handwritten application workspace.

The shared draft includes every page and API connection in one revisioned save. Apply or discard pending CSS, JavaScript, layer/API JSON, and manifest edits before saving or exporting. Existing drafts remain compatible; no new database migration is needed. Draft API bodies are capped at 15 MiB to support embedded image uploads.

## Public homepage and account sign-in

`/` is the public dragonfruit.studio homepage. The workspace lives at `/websites`; editor URLs remain `/projects/<id>`. Signup and login open in a native modal with GitHub and email options. Email is passwordless: request a one-use link, open it in the requesting browser, and explicitly choose **Continue to dragonfruit**. Links expire after ten minutes. Opening a link does not consume it automatically, which avoids accidental consumption by email link scanners. The secret is in the URL fragment and is removed from browser history after the confirmation screen loads.

### Provider setup

1. Apply migration **003_accounts.sql** using `deno task migrate`.
2. Set `DRAGONFRUIT_PUBLIC_ORIGIN` to the browser-facing origin, with no path or trailing slash. Production requires HTTPS. Development credentials and callbacks must use the same hostname/port as the browser.
3. Register a GitHub **OAuth App**, set its callback URL to `https://dragonfruit.studio/auth/github/callback` (or your configured origin plus `/auth/github/callback`), and set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the server environment.
4. In Postmark, verify **info@dragonfruit.studio** or the **dragonfruit.studio** sending domain, ensure the `outbound` transactional message stream is available, and set `POSTMARK_SERVER_TOKEN` to the server token.
5. Restart the app and test both signup methods. Missing provider credentials produce an honest unavailable state in the modal; they never simulate a login.

Authentication email always uses **From: info@dragonfruit.studio**. Open/link tracking is disabled for sign-in emails. GitHub requests `read:user user:email`, verifies the primary email, and uses state plus PKCE. This grants identity access rather than repository authorization. GitHub access tokens are used only for the sign-in lookup and are not stored.

Accounts are keyed to verified email addresses. Email proof and a GitHub verified primary email with the same address lead to the same workspace. A linked GitHub identity is subsequently recognized by its stable GitHub ID. There are no passwords or recovery codes to store. Production sessions use host-only, Secure, HttpOnly, SameSite=Lax cookies and expire after seven days. Database records contain token hashes; logout revokes the current session. POST origin checks, one-use browser-bound challenges, and durable request limits protect the sign-in endpoints.

Each signed-in user can list, edit, export, and validate only their own websites. Project details, draft writes, API sample tests, job lists, job details, and cancellation all use the same owner scope. Platform settings remain operator-only. Existing projects keep NULL ownership and remain accessible to the operator; signup never claims them automatically.

PostgreSQL stores accounts, identities, sessions, sign-in challenges, request counters, and project ownership. This adds account access to the control plane; it does not claim completion of public hosting or tenant execution isolation. Auth provider secrets stay server-side and are separate from form integration secrets in exported websites.

## Run locally

Use **Deno 2.9.5**. Direct framework dependencies are pinned to Fresh **2.3.3** and Fresh Vite plugin **1.1.2**.

### Quick demo

```bash
deno install --frozen
deno task demo
```

Open **http://localhost:5173** for the public homepage. For the credential-free loopback demo, open **http://localhost:5173/websites**, choose **New website**, enter a name, and start editing. Configure the provider variables to test real account sign-in.

Demo drafts live in process-local memory. Saving keeps them across page reloads, but restarting the server resets them.

### Persistent development

```bash
cp .env.example .env
docker compose up -d postgres
deno install --frozen
deno task migrate
deno task dev
```

Open **http://localhost:5173**. PostgreSQL retains accounts, sessions, websites, and drafts across process restarts. In development, the explicit loopback demo workspace remains available at `/websites` without provider setup; signed-in users still receive their own workspace.

If upgrading from the earlier boilerplate, run `deno task migrate` to apply **002_website_editor.sql** and **003_accounts.sql** before starting the dashboard. Existing projects open with a starter design until a draft is saved; their repository source is not imported into the editor. Existing single-page drafts upgrade automatically to a Home page without losing their content or styles; multi-page support needs no additional SQL migration.

The separate configuration-check worker remains available:

```bash
deno task worker
```

It is not required to edit or save a website. It validates application manifests only, without fetching or running project code.

### Build and check

```bash
deno task verify
deno task smoke
# With a configured .env and migrated database:
deno task start
```

`verify` runs formatting, lint, type checking, unit tests, and the production build. `smoke` exercises the production server, project creation, editor saving, origin enforcement, configuration checks, assets, and missing pages.

`start` binds to **127.0.0.1:8000**. Configure `DRAGONFRUIT_PUBLIC_ORIGIN` to match the browser-facing origin.

For PostgreSQL integration tests, use a dedicated test database:

```bash
docker compose exec postgres createdb -U dragonfruit dragonfruit_test
TEST_DATABASE_URL=postgres://dragonfruit:dragonfruit@127.0.0.1:5432/dragonfruit_test deno task test:integration
```

CI supplies PostgreSQL. Without `TEST_DATABASE_URL`, the database test is skipped.

## Access and execution boundaries

Development mode is for loopback use only and must not be exposed through a reverse proxy. Outside development, configure:

- `DRAGONFRUIT_DEV_MODE=false`
- GitHub and/or Postmark credentials for public account access
- An optional random `DRAGONFRUIT_ADMIN_TOKEN` of at least 32 characters for operator access
- `DRAGONFRUIT_PUBLIC_ORIGIN`
- PostgreSQL through `DATABASE_URL`

Visit `/operator` to use the operator gate. The bootstrap operator uses HTTP Basic username **operator**, with the token as the password. Bearer authentication is available for API clients. State-changing requests also require a matching `Origin` header. Use HTTPS outside local development.

The operator gate is separate from GitHub/email user sessions and intentionally retains access to legacy unowned projects. GitHub identity sign-in does not authorize repository operations.

Preview content runs in a sandboxed iframe with a restrictive content policy. The supported model excludes arbitrary HTML. Expert JavaScript is deliberately available for interactive layers and executes only in Preview inside the isolated frame; exported websites run that author-owned code in their own origin. Element CSS supports declarations rather than selectors, media-rule blocks, or external resource URLs. Images support HTTPS URLs and embedded PNG/JPEG/WebP/GIF uploads up to 10 MB each. A full asset library, responsive breakpoint authoring, and richer stylesheet editing remain future extensions.

The dashboard does not execute application code or expose a Docker socket. Future builds and runtimes belong behind separate execution and host-agent boundaries.

## Architecture

| Component | Responsibility |
| --- | --- |
| Fresh dashboard and editor | Authoring, settings, preview, and control-plane UI |
| Accounts and sessions | Verified email/GitHub identities, browser-bound proofs, durable session revocation |
| Structured page document | Versioned source of truth for visual editing and source generation |
| PostgreSQL | Projects, draft revisions, environments, jobs, audit events |
| Memory adapter | Explicitly ephemeral local demo and test implementation |
| Job worker | Durable configuration validation; future deployment orchestration |
| Future build executor | Isolated builds from immutable source revisions |
| Future host agent | Narrow authenticated runtime operations |
| Future ingress | HTTPS, domain routing, candidate promotion, rollback |

The future hosting loop still requires immutable artifacts, readiness verification, ordered promotion, retained releases, and separate persistent data. A failed build must preserve the healthy active release. An application rollback must reuse a retained artifact and must not imply reversal of database migrations.

Planned integrations remain GitHub/GitLab/Bitbucket source control, Docker execution, and an initial infrastructure adapter chosen from DigitalOcean, AWS, or Hetzner.

## Source layout

| Path | Responsibility |
| --- | --- |
| `islands/PublicHome.tsx`, `islands/VerifyEmail.tsx` | Public homepage, signup/login modal, and explicit email proof confirmation |
| `src/auth/` | Postmark/GitHub authentication, token hashing, sessions, and account persistence |
| `src/storage/scoped.ts` | Owner-restricted request-side projects, drafts, and jobs |
| `islands/SiteEditor.tsx` | Website editor, history, inspector, settings, save workflow |
| `components/StyleControl.tsx` | GUI typography, length, color, and spacing controls |
| `src/domain/site.ts` | Page model, validation, CSS round-trip, isolated preview, Fresh route generation |
| `src/domain/website.ts` | Multi-page model, legacy draft upgrade, templates, paths, navigation |
| `src/domain/export.ts` | Complete Fresh/React project generation, form backends, and ZIP packaging |
| `src/domain/layers.ts`, `src/domain/markup.ts` | Validated interactive layer options and escaped semantic markup |
| `src/domain/interactions.ts` | Editable interaction programs, animation and browser lifecycle handling |
| `src/domain/forms.ts`, `src/domain/form-runtime.ts` | Integration configuration and shared form delivery implementation |
| `components/ApiEditor.tsx`, `components/LayerInspector.tsx` | Guided API setup, form fields, items, animations, and expert controls |
| `islands/ThemeToggle.tsx`, `assets/theme.css` | Persistent light/dark appearance and interface contrast |
| `src/domain/manifest.ts` | Application manifest and project defaults |
| `src/storage/` | Metadata, revision-guarded draft saves, queue adapters |
| `src/http/` | JSON API and bootstrap access boundary |
| `src/worker/` | Independent configuration-validation worker |
| `src/adapters/` | Future identity, source, execution, host, and infrastructure contracts |
| `migrations/`, `scripts/`, `tests/` | Schema, checks, and verification |
| `docs/` | Product direction, implementation status, architecture, backlog |

## Next priorities

1. Extend the editor with a managed asset library and responsive authoring.
2. Preserve the visual/expert relationship as the model grows.
3. Connect a real isolated build and publish flow behind the editor.
4. Add source workspaces and deliberate boundaries for handwritten code.
5. Establish public-tenant isolation and operational readiness before public hosting.

See [product direction](docs/product-direction.md), [implementation status](docs/implementation.md), and the [roadmap](docs/roadmap.md). The specification and design contain the detailed backend requirements.

## References

- [Fresh deployment](https://usefresh.dev/docs/deployment)
- [Fresh islands](https://usefresh.dev/docs/concepts/islands)
- [Deno security and permissions](https://docs.deno.com/runtime/fundamentals/security/)
- [Deno deployment options](https://docs.deno.com/runtime/deploy/)



## Markdown blog, commerce, and social previews

- **Shared Layouts:** Groups and Sections can be reused across pages within a website. Select a container, enter a name in **Reuse across pages**, then choose **Save to Shared Layouts**. Open the **Shared Layouts** tab next to Layers and Add to search and insert saved layouts on any page. Copies are linked: editing a container or any child updates every linked instance, and undo/redo restores all instances together. The inspector identifies linked content before the editing controls. Use **Detach for this page** for private changes. **Expert · Layout options** offers independent insertion, renaming, and removal from the menu; removal preserves placed content as independent copies. Deleting a single instance or its original page keeps the reusable layout. Nested linked layouts are deliberately prevented; insert independent copies for nesting. Up to 24 layouts are stored with the draft, and ordinary page depth and element limits still apply. Default shared headers retain automatic page navigation. Fresh and React exports contain the placed layouts, their styling, forms, interactions, and booking widgets without requiring the builder.
- **Blog:** Add a Blog page to create an index and a starter Markdown article. The index automatically shows article titles, blurbs, and links. In Settings, use **Add Markdown article** for subsequent posts; edit the article's Markdown layer in Design, and set its URL and blurb in Settings. Articles are independent pages in the existing 16-page website limit and are omitted from the top navigation. Delete and rename use the existing page controls. Existing static blog layouts can keep their design: add a Blog index layer to link the new articles.
- **Markdown:** Supports headings, paragraphs, emphasis, strikethrough, links, images, flat ordered/unordered lists, quotes, horizontal rules, inline code, and fenced code. It is a deliberately bounded subset; raw HTML displays as text and executable link schemes are rejected.
- **Commerce:** Add Shop, Product, Cart, Checkout, Calendar, or Schedule layers from the Add panel. In API → Commerce API, add products, choose USD/EUR/GBP, and select Preview or Stripe. Prices use whole minor units (1900 = 19.00); Product layers select a product by its ID. Carts persist within the browser tab and support quantity changes and removal. All layers use one shared catalog, including on different pages.
- **Payments:** Export Fresh or React, then set `PUBLIC_ORIGIN` and `STRIPE_SECRET_KEY` in the exported server's `.env`. Preview never charges. Stripe Checkout uses server-authoritative catalog prices and redirects to Stripe; browser price overrides are ignored. Start with a Stripe test key. Tax/shipping rules, inventory reservations, order storage, fulfillment automation, recurring subscriptions, refunds, and payment webhooks are outside this release. Confirm payment in Stripe before fulfillment; a `checkout=success` return URL is not payment proof. See https://docs.stripe.com/api/checkout/sessions/create.
- **Scheduling:** Enter a session name and booking link, select weekdays/weekends or specific days, choose opening hours and session length, then click **Auto-fill schedule**. Generate 1–12 weeks at once, preview the number of new sessions, and choose a timezone. Existing events are kept and overlapping times are skipped; repeated fills do not duplicate sessions. Capacity errors explain how to stay within the 100-session limit. Individual events and raw ISO dates remain under **Expert · Individual sessions**; raw Commerce JSON is also available. **Schedule** is a compact agenda grouped by date. Session rows start collapsed; expand one for its date, time range and booking link, or enable **Expand sessions by default** in the layer inspector. **Calendar** is a month grid with event-count markers, Previous/Next month and Today controls. Select a date to see its sessions; multi-day events mark each covered date. Arrow keys move between dates, with Home/End moving within a week. Selected-day details appear beside the grid in wide containers and below it in narrow containers, with scrollable details for busy days. New Calendar layers span available width and reserve at least 520px of height, including on mobile. Both layers use the same Commerce API sessions and display the visitor's timezone by default. **Expert · Booking display** lets you set an IANA display timezone; Calendar also supports Sunday/Monday week starts and always-below details. The same settings are available in Expert layer JSON as `timeZone`, `weekStartsOn` (0 or 1), `detailsPosition` (`auto` or `below`), and Schedule's `expanded` boolean. Existing layers use these defaults without needing to be recreated. The linked booking provider manages availability, reservations, conflicts, and cancellations. The website does not reserve a slot itself.
- **SEO and embeds:** Each page's Settings has its meta description/blurb, optional embed-image URL, and indexing control. Exports automatically generate branded 1200 × 630 PNG cards for every page; custom URLs override the default. Canonical, description, Open Graph, and Twitter card metadata are present in initial server HTML in both Fresh and the React Node server, and update on React navigation. Set `PUBLIC_ORIGIN` to the final HTTPS origin. Static-only React hosting needs prerendering for route-specific crawler metadata. The builder homepage also includes a branded card and metadata, using `DRAGONFRUIT_PUBLIC_ORIGIN`.

Exported commerce APIs:

| Endpoint | Behavior |
| --- | --- |
| `GET /api/commerce/catalog` | Active products and currency |
| `GET /api/commerce/schedule` | Sessions that have not ended |
| `POST /api/commerce/checkout` | `{ "items": [{ "id": "product-id", "quantity": 1 }] }`; preview total or Stripe redirect URL |

Checkout requires a same-origin JSON request, validates product IDs and quantities, bounds request size, and limits creation to 120 attempts per minute per server process. Multi-instance or higher-traffic deployments should supply a shared rate limiter. API keys remain in server environment variables and are excluded from public assets. Expert Commerce JSON is validated and included in draft revision history.

Validation for this update: 62 unit tests (including Markdown safety, article persistence/indexing, commerce validation, checkout price tampering, and export metadata), strict domain/UI type checks, lint, React export production build, and a headless browser smoke test covering article navigation/reloads, quantity changes, checkout preview, cart persistence/removal, and image/metadata routes. Full Fresh build needs access to the configured JSR/npm dependencies.

Schedule auto-fill additionally has tests for weekly generation, preserved exceptions and overlap handling, repeat-fill deduplication, DST/timezone conversion, invalid patterns, and the session cap.


## Page groups

In the editor's Pages panel, choose **+ Add group**, enter a name, and create it. Select a page and use its **Group** selector to move it into a group or back to Ungrouped. Click the caret/name to expand or collapse the group; keyboard Enter/Space also works. Expanded groups include **Manage group** for renaming or removing the group. Removing a group keeps all its pages and moves them to Ungrouped. New template pages created while viewing a grouped page join that group. Groups and memberships save with the draft and participate in Undo/Redo. Groups organize the editor; page URLs and published navigation remain as designed.

Page-group validation, round-trip/export preservation, and safe removal have unit coverage. Browser checks cover creation, assignment, caret collapse, keyboard expansion, rename, and removal while preserving the pages.


## Readable Fresh / React export compiler

Exports now pass through `src/domain/codegen.ts`: visual page model → controlled semantic markup → element/text intermediate tree → JSX page components. The compiler preserves text/attribute escaping, translates DOM attribute names to JSX (`className`, `htmlFor`, `tabIndex`, etc.), emits named components for top-level sections, and lifts interaction options into editable constants. Page content no longer ships as serialized HTML or `dangerouslySetInnerHTML`.

Fresh emits readable page modules under `routes/`, plus a JSX metadata component and page-scoped rules in `assets/styles.css`. React emits one module per page under `src/pages/`, imports them into `src/App.tsx`, and puts page rules in `src/site.css`. Shared runtime hooks and form/commerce endpoints stay intact. Uploaded images are extracted into deduplicated `static/media/` or `public/media/` files before source generation. The Code tab previews the same page component emitted by export. Source and runtime edits made after export are independent of the saved builder draft.

Validation includes export-compiler and media-extraction tests, strict generated React type checks and production build, rendered markup parity for Fresh/Preact and React pages, plus browser checks for article navigation, metadata, carts, checkout preview, forms, carousel, accordion, and mobile menu behavior. Full Fresh Vite compilation still requires external JSR/npm dependency access.


## Account plans and Stripe billing

The first website is free forever, with editing and unlimited source exports. Accounts can purchase permanent additional website slots for **$9.99 each**, or subscribe for **$24.99/month** to create unlimited websites while active. Existing websites stay editable and exportable when a subscription ends; new creation requires available free or purchased capacity. See [docs/billing.md](docs/billing.md) for environment variables, migration 004, the required Stripe Prices and signed webhook, Customer Portal setup, and testing. These builder-account payments are separate from commerce checkout in exported user websites.


## Web fonts in the visual editor

Select a text element (or a Group/Section to set an inherited font), then use **Style → Font family**. The picker includes grouped choices and a live sample:

- Sans serif: Inter, DM Sans, Nunito.
- Serif: Lora, Playfair Display, Merriweather.
- Display: Oswald, Bebas Neue.
- Monospace: Space Mono, Fira Code.
- Handwritten and script: Caveat, Dancing Script.

All 12 families are bundled from Google Fonts' public WOFF2 distributions under SIL OFL 1.1. Original licenses, distribution URLs and font files are retained in `assets/fonts/`. No external font service is contacted while editing or viewing an exported site. The preview embeds only the selected fonts and permits data fonts in its CSP. Exports include only used families, deduplicated across pages, with local WOFF2 files in `static/fonts/` (Fresh) or `public/fonts/` (React), plus `FONT-LICENSES.md` and the full original licenses under `licenses/fonts/`. The React production server serves WOFF2 with `font/woff2`.

Choose **Inherit from parent** to remove an element's explicit font family. System sans, serif and monospace stacks are also available. **Expert · Font stack** and the existing CSS tab edit the same `font-family` property; naming a bundled font anywhere in a custom stack automatically includes its files. Other custom family names keep normal browser fallback behavior. Shared layout font changes propagate like other styles. Normal-face weights and Unicode coverage follow each bundled upstream font; italic text can be synthesized by browsers when no italic face is provided.

To refresh the asset catalog from upstream, run `python3 scripts/build-font-catalog.py`, then `deno fmt src/domain/font-catalog.ts src/domain/font-assets.ts`. This optional maintenance step requires internet access; building, editing, and exporting do not download fonts.

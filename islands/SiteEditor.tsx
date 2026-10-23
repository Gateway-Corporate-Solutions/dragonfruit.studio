import { newConnection } from "@/src/domain/forms.ts";
import ApiEditor from "@/components/ApiEditor.tsx";
import LayerInspector from "@/components/LayerInspector.tsx";
import { parseLayer } from "@/src/domain/layers.ts";
import ThemeToggle from "@/islands/ThemeToggle.tsx";
import PageDialog from "@/components/PageDialog.tsx";
import {
  addPage,
  deletePage,
  type PageTemplate,
  parseWebsite,
  routeFilename,
  starterWebsite,
  updatePageDetails,
  type WebsiteDocument,
} from "@/src/domain/website.ts";
import {
  type ExportFormat,
  projectSourceFiles,
  reactAppSource,
  sourceZip,
} from "@/src/domain/export.ts";
import { DEPLOY_FILES } from "@/src/domain/deploy-assets.ts";
import { BoxSpacing, StyleControl } from "@/components/StyleControl.tsx";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Project } from "@/src/domain/models.ts";
import { type Manifest, parseManifest } from "@/src/domain/manifest.ts";
import {
  allNodes,
  changeNode,
  type ElementTag,
  formatStyles,
  freshSource,
  parseStyles,
  previewHtml,
  removeNode,
  type SiteDocument,
  type SiteNode,
} from "@/src/domain/site.ts";

const friendly: Record<ElementTag, string> = {
  section: "Section",
  div: "Group",
  h1: "Heading",
  h2: "Heading",
  p: "Text",
  a: "Button / link",
  span: "Label",
  img: "Image",
  form: "Form",
  carousel: "Carousel",
  accordion: "Accordion",
  nav: "Navbar",
  navmenu: "Navmenu",
};
const styleFields = [
  ["color", "Text color"],
  ["background", "Background"],
  ["font-size", "Font size"],
  ["font-weight", "Font weight"],
  ["line-height", "Line height"],
  ["letter-spacing", "Letter spacing"],
  ["border-radius", "Corner radius"],
  ["max-width", "Max width"],
  ["gap", "Gap"],
] as const;
type Mode = "design" | "preview" | "code" | "api" | "settings";
export default function SiteEditor(
  { project, ephemeral }: { project: Project; ephemeral: boolean },
) {
  const initial = parseWebsite(
    project.document ?? starterWebsite(project.name),
  );
  const [history, setHistory] = useState<WebsiteDocument[]>([initial]),
    [position, setPosition] = useState(0);
  const website = history[position];
  const [activePage, setActivePage] = useState(
    initial.pages.find((p) => p.path === "/")!.id,
  );
  const site = website.pages.find((p) => p.id === activePage) ??
    website.pages[0];
  const [showPages, setShowPages] = useState(false);
  const [layerPending, setLayerPending] = useState(false),
    [apiPending, setApiPending] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("fresh");
  const [pageName, setPageName] = useState(site.name),
    [pagePath, setPagePath] = useState(site.path),
    [pageError, setPageError] = useState("");
  const [manifest, setManifest] = useState<Manifest>(project.manifest);
  const [revision, setRevision] = useState(project.revision);
  const [saved, setSaved] = useState(
    JSON.stringify({ document: initial, manifest: project.manifest }),
  );
  const [selected, setSelected] = useState<string | null>("hero-title");
  const nodes = allNodes(site), node = nodes.find((n) => n.id === selected);
  const [mode, setMode] = useState<Mode>("design"),
    [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [inspector, setInspector] = useState<"visual" | "css">("visual");
  const [leftTab, setLeftTab] = useState<"layers" | "add">("layers");
  const [cssDraft, setCssDraft] = useState(formatStyles(node?.styles ?? {})),
    [cssError, setCssError] = useState("");
  const [manifestDraft, setManifestDraft] = useState(
      JSON.stringify(manifest, null, 2),
    ),
    [manifestError, setManifestError] = useState("");
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [saveError, setSaveError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const styleSignature = formatStyles(node?.styles ?? {});
  const cssPending = !!node && cssDraft !== styleSignature;
  const manifestPending = manifestDraft !== JSON.stringify(manifest, null, 2);
  const dirty = JSON.stringify({ document: website, manifest }) !== saved ||
    cssPending || manifestPending || layerPending || apiPending;
  useEffect(() => {
    setCssDraft(styleSignature);
    setCssError("");
  }, [selected, styleSignature, site.id]);
  useEffect(() => {
    const first = allNodes(site).find((n) => n.id === "hero-title") ??
      allNodes(site)[0];
    setActivePage(site.id);
    setSelected(first?.id ?? null);
    setCssDraft(formatStyles(first?.styles ?? {}));
  }, [site.id]);
  useEffect(() => {
    setPageName(site.name);
    setPagePath(site.path);
    setPageError("");
  }, [site.id, site.name, site.path]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    globalThis.addEventListener("beforeunload", leave);
    return () => globalThis.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    const select = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (
        mode === "design" && event.data?.type === "dragonfruit.select" &&
        typeof event.data.id === "string" && nodes.some((n) =>
          n.id === event.data.id
        )
      ) selectNode(event.data.id);
      if (
        mode === "preview" && event.data?.type === "dragonfruit.navigate" &&
        typeof event.data.path === "string"
      ) {
        const next = website.pages.find((p) => p.path === event.data.path);
        if (next) switchPage(next.id);
      }
    };
    globalThis.addEventListener("message", select);
    return () => globalThis.removeEventListener("message", select);
  });
  function commitWebsite(next: WebsiteDocument) {
    setHistory([...history.slice(0, position + 1), next].slice(-60));
    setPosition(Math.min(position + 1, 59));
    setMessage("");
    setSaveError("");
  }
  function commit(next: SiteDocument) {
    commitWebsite({
      ...website,
      pages: website.pages.map((p) => p.id === site.id ? { ...p, ...next } : p),
    });
  }
  function switchPage(id: string) {
    if (!canDiscardCss()) return;
    const next = website.pages.find((p) => p.id === id);
    if (!next) return;
    const first = allNodes(next).find((n) => n.id === "hero-title") ??
      allNodes(next)[0];
    setActivePage(id);
    setSelected(first?.id ?? null);
    setCssDraft(formatStyles(first?.styles ?? {}));
    setCssError("");
  }
  function createPage(
    template: PageTemplate,
    name: string,
  ): string | undefined {
    if (!canDiscardCss()) {
      return "Apply or discard the current CSS draft first.";
    }
    try {
      const next = addPage(website, template, name);
      commitWebsite(next);
      setActivePage(next.pages[next.pages.length - 1].id);
      setShowPages(false);
    } catch (error) {
      return error instanceof Error ? error.message : "Could not create page";
    }
  }
  function canDiscardCss() {
    if (!cssPending && !layerPending && !apiPending) return true;
    if (
      !confirm(
        "Discard unapplied CSS, layer JavaScript / JSON, or API JSON edits?",
      )
    ) return false;
    setCssDraft(styleSignature);
    setCssError("");
    setLayerPending(false);
    setApiPending(false);
    return true;
  }
  function selectNode(id: string) {
    if (canDiscardCss()) {
      setSelected(id);
      setCssDraft(formatStyles(nodes.find((n) => n.id === id)?.styles ?? {}));
    }
  }
  function update(transform: (n: SiteNode) => SiteNode) {
    if (node) commit(changeNode(site, node.id, transform));
  }
  function style(key: string, value: string) {
    update((n) => {
      const styles = { ...n.styles };
      delete styles[key];
      if (value) styles[key] = value;
      return { ...n, styles };
    });
  }
  function insert(tag: ElementTag, variant = "button") {
    if (nodes.length >= 80) {
      setSaveError("This page supports up to 80 elements.");
      return;
    }
    if (!canDiscardCss()) return;
    const formApi = tag === "form"
      ? website.apis?.find((a) => a.provider === "preview") ??
        { ...newConnection("preview"), name: "Local preview" }
      : undefined;
    const id = "element-" + crypto.randomUUID().slice(0, 8);
    const child: SiteNode = {
      id,
      tag,
      text: tag === "section"
        ? ""
        : tag === "h2"
        ? "A new chapter."
        : tag === "a"
        ? "Learn more →"
        : "Tell your story here.",
      ...(tag === "a" ? { href: "#" } : {}),
      styles: tag === "section"
        ? { padding: "48px 8%", background: "#ffffff" }
        : tag === "h2"
        ? { "font-size": "32px", color: "#243c30", "margin-bottom": "20px" }
        : tag === "a"
        ? {
          display: "inline-block",
          padding: "14px 24px",
          background: "#294c38",
          color: "#ffffff",
          "border-radius": "8px",
          "text-decoration": "none",
        }
        : {
          "font-size": "18px",
          color: "#65735a",
          "line-height": "1.7",
          "margin-bottom": "16px",
        },
      children: [],
    };
    if (
      ["img", "form", "carousel", "accordion", "nav", "navmenu"].includes(tag)
    ) {
      child.layer = parseLayer(tag, {});
      if (formApi) child.layer!.apiId = formApi.id;
      child.text = tag === "img"
        ? ""
        : tag === "form"
        ? "Get in touch"
        : tag === "carousel"
        ? "Highlights"
        : tag === "accordion"
        ? "Questions and answers"
        : project.name;
      child.styles = {
        padding: tag === "img" ? "0" : "28px",
        margin: "24px auto",
        "max-width": "100%",
        color: "#243c30",
        background: "#f1f4e9",
        "border-radius": "10px",
      };
      if (tag === "img") {
        child.styles = {
          width: "100%",
          height: "auto",
          "object-fit": "cover",
          "border-radius": "10px",
        };
      }
      if (tag === "nav" || tag === "navmenu") {
        child.layer!.items = website.pages.map((p) => ({
          title: p.name,
          body: "",
          href: p.path,
          image: "",
        }));
      }
    }
    if (tag === "a") {
      child.layer = { newTab: false };
      if (variant === "link") {
        child.text = "A useful link →";
        child.styles = {
          color: "#294c38",
          "text-decoration": "underline",
          "font-size": "16px",
        };
      }
    }
    const parent = node && ["section", "div"].includes(node.tag)
      ? node
      : nodes.find((n) => n.children.some((c) => c.id === selected));
    const next = tag !== "section" && parent
      ? changeNode(
        site,
        parent.id,
        (n) => ({ ...n, children: [...n.children, child] }),
      )
      : { ...site, nodes: [...site.nodes, child] };
    if (formApi) {
      commitWebsite({
        ...website,
        apis: website.apis?.some((a) => a.id === formApi.id)
          ? website.apis
          : [...website.apis ?? [], formApi],
        pages: website.pages.map((p) =>
          p.id === site.id ? { ...p, ...next } : p
        ),
      });
    } else commit(next);
    setSelected(id);
    setCssDraft(formatStyles(child.styles));
    setLeftTab("layers");
  }
  function move(direction: number) {
    if (!node || !canDiscardCss()) return;
    function reorder(list: SiteNode[]): SiteNode[] {
      const i = list.findIndex((n) => n.id === selected);
      if (i >= 0) {
        const next = [...list], j = i + direction;
        if (j >= 0 && j < list.length) [next[i], next[j]] = [next[j], next[i]];
        return next;
      }
      return list.map((n) => ({ ...n, children: reorder(n.children) }));
    }
    commit({ ...site, nodes: reorder(site.nodes) });
  }
  function downloadProject() {
    if (cssPending || manifestPending || layerPending || apiPending) {
      setSaveError(
        "Apply or discard your CSS, manifest, layer JavaScript / JSON, or API edits before exporting.",
      );
      return;
    }
    try {
      const files = projectSourceFiles(website, exportFormat, DEPLOY_FILES);
      const url = URL.createObjectURL(
        new Blob([sourceZip(files)], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = project.slug + "-" + exportFormat + ".zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not export website",
      );
    }
  }
  async function save() {
    if (cssPending || manifestPending || layerPending || apiPending) {
      setSaveError(
        "Apply or discard your CSS, manifest, layer JavaScript / JSON, or API edits before saving.",
      );
      return;
    }
    try {
      const snapshot = JSON.stringify({ document: website, manifest });
      const document = parseWebsite(website),
        checkedManifest = parseManifest(manifest);
      setSaving(true);
      setSaveError("");
      setMessage("");
      const response = await fetch("/api/projects/" + project.id + "/editor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, document, manifest: checkedManifest }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.issues?.join(" · ") ?? result.error);
      }
      setRevision(result.project.revision);
      setSaved(snapshot);
      setMessage(
        ephemeral ? "Draft saved for this demo session" : "Draft saved",
      );
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save draft");
    } finally {
      setSaving(false);
    }
  }
  function layers(list: SiteNode[], depth = 0) {
    return list.map((n) => (
      <div key={n.id}>
        <button
          type="button"
          class={"layer " + (selected === n.id ? "active" : "")}
          style={{ paddingLeft: 14 + depth * 14 }}
          onClick={() => selectNode(n.id)}
        >
          <span>
            {["div", "section"].includes(n.tag)
              ? "▧"
              : n.tag === "a"
              ? "↗"
              : "T"}
          </span>
          <span>
            {n.text ? n.text.split("\n")[0].slice(0, 25) : friendly[n.tag]}
          </span>
        </button>
        {layers(n.children, depth + 1)}
      </div>
    ));
  }
  return (
    <div class="site-editor">
      {showPages && (
        <PageDialog
          website={website}
          onClose={() => setShowPages(false)}
          onCreate={createPage}
        />
      )}
      <header class="editor-header">
        <div class="editor-identity">
          <a
            href="/websites"
            class="editor-home"
            title="Back to websites"
            aria-label="Back to websites"
          >
            d<span>●</span>
          </a>
          <div>
            <strong>{project.name}</strong>
            <select
              class="editor-page-select"
              aria-label="Current page"
              value={site.id}
              onChange={(e) => switchPage(e.currentTarget.value)}
            >
              {website.pages.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span>
              {dirty ? "Unsaved changes" : "All changes saved"}
              {ephemeral ? " · Demo session" : ""}
            </span>
          </div>
        </div>
        <nav class="editor-modes" aria-label="Editor mode">
          {(["design", "preview", "code", "api", "settings"] as const).map((
            m,
          ) => (
            <button
              type="button"
              key={m}
              class={mode === m ? "active" : ""}
              onClick={() => {
                if (canDiscardCss()) setMode(m);
              }}
            >
              {m === "design"
                ? "Design"
                : m === "preview"
                ? "Preview"
                : m === "code"
                ? "</> Code"
                : m === "api"
                ? "API"
                : "Settings"}
            </button>
          ))}
        </nav>
        <div class="editor-actions">
          <ThemeToggle />
          <button
            type="button"
            class="button"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            class="button primary"
            onClick={() => {
              setSaveError("");
              setMessage(
                "Publishing isn’t available yet. You can save your draft or download your website source.",
              );
            }}
          >
            Publish ↗
          </button>
        </div>
      </header>
      {(saveError || message) && (
        <div
          class={"editor-message " + (saveError ? "error" : "")}
          role={saveError ? "alert" : "status"}
        >
          {saveError || message}
          <button
            type="button"
            onClick={() => {
              setSaveError("");
              setMessage("");
            }}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}
      {mode === "api"
        ? (
          <ApiEditor
            key={site.id}
            website={website}
            projectId={project.id}
            onChange={commitWebsite}
            onPending={setApiPending}
          />
        )
        : mode === "settings"
        ? (
          <div class="editor-settings">
            <p class="eyebrow">EXPERT CONFIGURATION</p>
            <h1>Under the hood</h1>
            <p class="muted">
              Defaults handle the setup. Change them whenever you need more
              control.
            </p>
            <section class="panel">
              <h2>Page settings · {site.name}</h2>
              <label>
                Page name<input
                  value={pageName}
                  maxLength={60}
                  onInput={(e) => setPageName(e.currentTarget.value)}
                />
              </label>
              <label>
                Page URL<input
                  aria-label="Page URL"
                  value={pagePath}
                  readOnly={site.path === "/"}
                  onInput={(e) => setPagePath(e.currentTarget.value)}
                />
                <small>
                  {site.path === "/"
                    ? "The Home page always lives at /."
                    : "A unique URL such as /about or /company/team."}
                </small>
              </label>
              {pageError && <p class="form-error" role="alert">{pageError}</p>}
              <div class="settings-buttons">
                <button
                  type="button"
                  class="button"
                  onClick={() => {
                    try {
                      commitWebsite(
                        updatePageDetails(website, site.id, pageName, pagePath),
                      );
                      setPageError("");
                    } catch (e) {
                      setPageError(
                        e instanceof Error
                          ? e.message
                          : "Invalid page settings",
                      );
                    }
                  }}
                >
                  Apply page settings
                </button>
                {site.path !== "/" && (
                  <button
                    type="button"
                    class="button danger"
                    onClick={() => {
                      if (
                        canDiscardCss() &&
                        confirm("Delete this page and its content?")
                      ) {
                        commitWebsite(deletePage(website, site.id));
                        setActivePage(
                          website.pages.find((p) => p.path === "/")!.id,
                        );
                      }
                    }}
                  >
                    Delete page
                  </button>
                )}
              </div>
              <label>
                Page title<input
                  value={site.title}
                  maxLength={120}
                  onInput={(e) =>
                    commit({ ...site, title: e.currentTarget.value })}
                />
              </label>
            </section>
            <section class="panel">
              <h2>Application manifest</h2>
              <p class="muted">
                Build tasks, runtime settings, and resource limits. This
                configuration is separate from your page design.
              </p>
              <label>
                Manifest JSON<textarea
                  key="manifest-json"
                  maxLength={32000}
                  class="code-input"
                  rows={24}
                  spellcheck={false}
                  value={manifestDraft}
                  onInput={(e) => setManifestDraft(e.currentTarget.value)}
                />
              </label>
              {manifestError && (
                <p class="form-error" role="alert">{manifestError}</p>
              )}
              <div class="settings-buttons">
                <button
                  type="button"
                  class="button"
                  onClick={() => {
                    try {
                      const next = parseManifest(JSON.parse(manifestDraft));
                      setManifest(next);
                      setManifestDraft(JSON.stringify(next, null, 2));
                      setManifestError("");
                      setMessage(
                        "Manifest applied. Save your draft to keep this configuration.",
                      );
                    } catch (e) {
                      setManifestError(
                        e instanceof Error ? e.message : "Invalid manifest",
                      );
                    }
                  }}
                >
                  Apply manifest
                </button>
                <button
                  type="button"
                  class="button"
                  onClick={() => {
                    setManifestDraft(JSON.stringify(manifest, null, 2));
                    setManifestError("");
                  }}
                >
                  Discard edits
                </button>
              </div>
            </section>
            <section class="panel">
              <h2>Repository</h2>
              <p class="muted">
                {project.repositoryUrl ??
                  "No repository required to get started. Source-control connections are a later integration."}
              </p>
            </section>
          </div>
        )
        : mode === "code"
        ? (
          <div class="editor-source">
            <div>
              <p class="eyebrow">YOUR WEBSITE, AS CODE</p>
              <h1>Source is always within reach.</h1>
              <p class="muted">
                Download your complete website, ready to run independently.
                Every page, its styling, and navigation are included.
              </p>
              <div
                class="export-format"
                role="group"
                aria-label="Export format"
              >
                <button
                  type="button"
                  aria-pressed={exportFormat === "fresh"}
                  class={exportFormat === "fresh" ? "active" : ""}
                  onClick={() => setExportFormat("fresh")}
                >
                  Fresh (Deno)
                </button>
                <button
                  type="button"
                  aria-pressed={exportFormat === "react"}
                  class={exportFormat === "react" ? "active" : ""}
                  onClick={() => setExportFormat("react")}
                >
                  React (Vite)
                </button>
              </div>
              <p class="export-summary">
                {exportFormat === "fresh"
                  ? "A server-rendered Fresh project. Run with Deno."
                  : "A React browser application. Run with Node.js and npm."}
                {" "}
                Includes a README with development and production commands.
              </p>
              <button
                type="button"
                class="button primary"
                onClick={downloadProject}
              >
                Download website.zip ↓
              </button>
              <p class="muted">
                {website.pages.length} pages · {exportFormat === "fresh"
                  ? "routes/" + routeFilename(site.path)
                  : "src/App.tsx"}
              </p>
            </div>
            <label>
              Generated source · read only<textarea
                class="code-input"
                readOnly
                value={exportFormat === "fresh"
                  ? freshSource(site, site.id)
                  : reactAppSource()}
                spellcheck={false}
                rows={35}
              />
            </label>
          </div>
        )
        : (
          <div
            class={"editor-body " + (mode === "preview" ? "preview-mode" : "")}
          >
            {mode === "design" && (
              <aside class="editor-left">
                <div class="editor-panel-title">
                  <strong>Pages</strong>
                  <button
                    type="button"
                    class="page-add"
                    onClick={() => {
                      if (canDiscardCss()) setShowPages(true);
                    }}
                  >
                    + Add page
                  </button>
                </div>
                <div class="page-list" aria-label="Website pages">
                  {website.pages.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      aria-current={site.id === p.id ? "page" : undefined}
                      class={site.id === p.id ? "active" : ""}
                      onClick={() => switchPage(p.id)}
                    >
                      <span>{p.path === "/" ? "⌂" : "▤"}</span>
                      <span>
                        {p.name}
                        <small>{p.path}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <div class="editor-panel-title layers-title">
                  <strong>{site.name} elements</strong>
                  <span class="badge">{nodes.length}</span>
                </div>
                <div class="segmented">
                  <button
                    type="button"
                    class={leftTab === "layers" ? "active" : ""}
                    onClick={() => setLeftTab("layers")}
                  >
                    Layers
                  </button>
                  <button
                    type="button"
                    class={leftTab === "add" ? "active" : ""}
                    onClick={() => setLeftTab("add")}
                  >
                    + Add
                  </button>
                </div>
                {leftTab === "layers"
                  ? <div class="layer-tree">{layers(site.nodes)}</div>
                  : (
                    <div class="insert-elements">
                      <p>Build it one element at a time.</p>
                      {([
                        [
                          "section",
                          "▧",
                          "Section",
                          "A new space for your content",
                        ],
                        ["h2", "H", "Heading", "Make your point"],
                        ["p", "T", "Text", "Tell your story"],
                        ["a", "↗", "Button", "Give visitors a next step"],
                        ["a", "↗", "Link", "Connect content and pages"],
                        ["img", "▧", "Image", "Upload or link an image"],
                        ["form", "▤", "Form", "Collect and deliver responses"],
                        [
                          "carousel",
                          "◫",
                          "Carousel",
                          "A slideshow for your stories",
                        ],
                        [
                          "accordion",
                          "☷",
                          "Accordion",
                          "Expandable answers and details",
                        ],
                        [
                          "nav",
                          "☰",
                          "Navbar",
                          "Navigation across your website",
                        ],
                        [
                          "navmenu",
                          "≡",
                          "Navmenu",
                          "A collapsible menu of links",
                        ],
                      ] as const).map(([tag, icon, title, description]) => (
                        <button
                          type="button"
                          key={title}
                          onClick={() =>
                            insert(tag, title === "Link" ? "link" : "button")}
                        >
                          <span>{icon}</span>
                          <div>
                            <strong>{title}</strong>
                            <small>{description}</small>
                          </div>
                          <span>+</span>
                        </button>
                      ))}
                    </div>
                  )}
                <div class="editor-left-note">
                  <strong>Make it yours.</strong>
                  <p>
                    Select an element on the canvas, then adjust its content and
                    style.
                  </p>
                </div>
              </aside>
            )}
            <section class="editor-canvas-area">
              <div class="canvas-toolbar">
                <span>
                  {mode === "preview" ? "Preview" : site.name + " /"}{" "}
                  <strong>
                    {mode === "design" ? "Design canvas" : site.title}
                  </strong>
                </span>
                <div class="device-switch">
                  <button
                    type="button"
                    class={device === "desktop" ? "active" : ""}
                    onClick={() => setDevice("desktop")}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    class={device === "mobile" ? "active" : ""}
                    onClick={() => setDevice("mobile")}
                  >
                    Mobile
                  </button>
                </div>
                <div class="history-actions">
                  <button
                    type="button"
                    aria-label="Undo"
                    disabled={position === 0}
                    onClick={() => {
                      if (canDiscardCss()) setPosition(position - 1);
                    }}
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    aria-label="Redo"
                    disabled={position >= history.length - 1}
                    onClick={() => {
                      if (canDiscardCss()) setPosition(position + 1);
                    }}
                  >
                    ↷
                  </button>
                </div>
              </div>
              <div class={"canvas-scroll " + device}>
                <iframe
                  ref={frame}
                  title="Website canvas"
                  sandbox="allow-scripts allow-forms"
                  srcDoc={previewHtml(
                    site,
                    mode === "design" ? selected : null,
                    mode === "design",
                    website.pages.map((p) => p.path),
                    site.id,
                  )}
                />
              </div>
              <div class="canvas-caption">
                {mode === "design"
                  ? "Click any element to edit · Changes stay in your draft until you save"
                  : "Preview of your current draft · Publishing is not connected yet"}
              </div>
            </section>
            {mode === "design" && (
              <aside class="editor-inspector">
                <div class="editor-panel-title">
                  <strong>
                    {node ? friendly[node.tag] : "Select an element"}
                  </strong>
                  {node && <code>&lt;{node.tag}&gt;</code>}
                </div>
                <div class="segmented">
                  <button
                    type="button"
                    class={inspector === "visual" ? "active" : ""}
                    onClick={() => {
                      if (canDiscardCss()) setInspector("visual");
                    }}
                  >
                    Visual
                  </button>
                  <button
                    type="button"
                    class={inspector === "css" ? "active" : ""}
                    onClick={() => {
                      if (canDiscardCss()) setInspector("css");
                    }}
                  >
                    {"{ } CSS"}
                  </button>
                </div>
                {node
                  ? (
                    <div class="inspector-content">
                      {inspector === "visual"
                        ? (
                          <>
                            {!["section", "div", "img"].includes(node.tag) && (
                              <label>
                                Content<textarea
                                  key="element-content"
                                  rows={4}
                                  value={node.text}
                                  maxLength={6000}
                                  onInput={(e) =>
                                    update((n) => ({
                                      ...n,
                                      text: e.currentTarget.value,
                                    }))}
                                />
                              </label>
                            )}
                            {node.tag === "a" && (
                              <label>
                                Link destination<input
                                  value={node.href ?? "#"}
                                  onInput={(e) =>
                                    update((n) => ({
                                      ...n,
                                      href: e.currentTarget.value,
                                    }))}
                                />
                              </label>
                            )}
                            {[
                              "a",
                              "img",
                              "form",
                              "carousel",
                              "accordion",
                              "nav",
                              "navmenu",
                            ].includes(node.tag) && (
                              <LayerInspector
                                key={site.id + "/" + node.id}
                                node={node}
                                apis={website.apis ?? []}
                                pages={website.pages}
                                onChange={(layer) =>
                                  update((n) => ({ ...n, layer }))}
                                onStyle={style}
                                onPending={setLayerPending}
                                onApi={() => {
                                  if (canDiscardCss()) setMode("api");
                                }}
                              />
                            )}
                            <p class="inspector-label">STYLE</p>
                            {styleFields.map(([key, title]) => (
                              <StyleControl
                                key={key}
                                property={key}
                                label={title}
                                value={node.styles[key] ?? ""}
                                onChange={style}
                              />
                            ))}
                            <BoxSpacing
                              property="padding"
                              styles={node.styles}
                              onChange={style}
                            />
                            <BoxSpacing
                              property="margin"
                              styles={node.styles}
                              onChange={style}
                            />
                            <label>
                              Text alignment<select
                                value={node.styles["text-align"] ?? ""}
                                onChange={(e) =>
                                  style("text-align", e.currentTarget.value)}
                              >
                                <option value="">Inherit</option>
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                              </select>
                            </label>
                            <label>
                              Layout<select
                                value={node.styles.display ?? ""}
                                onChange={(e) =>
                                  style("display", e.currentTarget.value)}
                              >
                                <option value="">Default</option>
                                <option value="block">Block</option>
                                <option value="inline-block">
                                  Inline block
                                </option>
                                <option value="flex">Flex</option>
                                <option value="grid">Grid</option>
                              </select>
                            </label>
                            <p class="inspector-help">
                              Need more control? Every property is available in
                              the CSS tab.
                            </p>
                          </>
                        )
                        : (
                          <>
                            <p class="inspector-help">
                              Edit this element’s CSS declarations directly.
                              Visual controls use these same properties;
                              additional properties are preserved.
                            </p>
                            <label>
                              Element CSS<textarea
                                key="element-css"
                                maxLength={8000}
                                class="code-input"
                                rows={19}
                                spellcheck={false}
                                value={cssDraft}
                                onInput={(e) =>
                                  setCssDraft(e.currentTarget.value)}
                              />
                            </label>
                            {cssError && (
                              <p class="form-error" role="alert">{cssError}</p>
                            )}
                            <div class="settings-buttons">
                              <button
                                type="button"
                                class="button primary"
                                onClick={() => {
                                  try {
                                    const styles = parseStyles(cssDraft);
                                    update((n) => ({ ...n, styles }));
                                    setCssDraft(formatStyles(styles));
                                    setCssError("");
                                  } catch (e) {
                                    setCssError(
                                      e instanceof Error
                                        ? e.message
                                        : "Invalid CSS",
                                    );
                                  }
                                }}
                              >
                                Apply CSS
                              </button>
                              <button
                                type="button"
                                class="button"
                                onClick={() => {
                                  setCssDraft(styleSignature);
                                  setCssError("");
                                }}
                              >
                                Discard
                              </button>
                            </div>
                          </>
                        )}
                      <div class="element-actions">
                        <button
                          type="button"
                          class="button small"
                          onClick={() => move(-1)}
                        >
                          ↑ Move up
                        </button>
                        <button
                          type="button"
                          class="button small"
                          onClick={() => move(1)}
                        >
                          ↓ Move down
                        </button>
                        <button
                          type="button"
                          class="button small danger"
                          onClick={() => {
                            if (
                              canDiscardCss() &&
                              confirm("Remove this element and its contents?")
                            ) {
                              const next = removeNode(site, node.id);
                              commit(next);
                              setSelected(allNodes(next)[0]?.id ?? null);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                  : (
                    <p class="inspector-help">
                      Choose an element from the canvas or the layers panel. Add
                      a section to start with an empty page.
                    </p>
                  )}
              </aside>
            )}
          </div>
        )}
      <footer class="editor-footer">
        <span>
          <i />Draft website <span class="footer-separator">/</span> {site.name}
        </span>
        <span>Simple by default. Expert configuration always available.</span>
        <span>dragonfruit</span>
      </footer>
    </div>
  );
}

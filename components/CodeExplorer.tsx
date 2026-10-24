import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { downloadStatic, optimizeUpload } from "@/src/client/static-files.ts";
import {
  encodeBytes,
  type StaticFile,
  staticMime,
  staticPath,
  staticUsage,
} from "@/src/domain/static-files.ts";
import type { ExportFormat, ProjectFile } from "@/src/domain/export.ts";
import type { WebsiteDocument } from "@/src/domain/website.ts";
import CodeResizeHandle from "./CodeResizeHandle.tsx";
interface Entry {
  name: string;
  path: string;
  directory: boolean;
  children: Entry[];
}
const bytes = (n: number) =>
  n >= 1_000_000
    ? (n / 1_000_000).toFixed(2) + " MB"
    : n >= 1000
    ? (n / 1000).toFixed(1) + " kB"
    : n + " B";
function tree(files: ProjectFile[]): Entry[] {
  const root: Entry = { name: "", path: "", directory: true, children: [] };
  for (const file of files) {
    let parent = root;
    const parts = file.name.replace(/\/$/, "").split("/");
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let entry = parent.children.find((e) => e.path === path);
      if (!entry) {
        entry = {
          name,
          path,
          directory: i < parts.length - 1 || file.name.endsWith("/"),
          children: [],
        };
        parent.children.push(entry);
      }
      parent = entry;
    });
  }
  const sort = (entries: Entry[]) => {
    entries.sort((a, b) =>
      Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)
    );
    entries.forEach((e) => sort(e.children));
  };
  sort(root.children);
  return root.children;
}
export default function CodeExplorer(
  {
    website,
    files,
    format,
    preferred,
    onFormat,
    onChange,
    onPending,
    onDownload,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  }: {
    website: WebsiteDocument;
    files: ProjectFile[];
    format: ExportFormat;
    preferred: string;
    onFormat: (format: ExportFormat) => void;
    onChange: (website: WebsiteDocument) => boolean;
    onPending: (pending: boolean) => void;
    onDownload: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  },
) {
  const root = format === "fresh" ? "static" : "public";
  const [selected, setSelected] = useState(preferred),
    [expanded, setExpanded] = useState(
      new Set(["routes", "src", "src/pages", "static", "public"]),
    ),
    [folder, setFolder] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const active = useRef(true), working = useRef(false);
  const panes = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [fileShare, setFileShare] = useState(50);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onPending(false);
    };
  }, []);
  useEffect(() => {
    if (
      !files.some((f) =>
        f.name.replace(/\/$/, "") === selected ||
        f.name.startsWith(selected + "/")
      )
    ) setSelected(root);
  }, [files, selected, root]);
  const entries = useMemo(() => tree(files), [files]);
  const usage = useMemo(() => staticUsage(website), [website]);
  const file = files.find((f) => f.name === selected && !f.name.endsWith("/"));
  const path = selected === root
    ? ""
    : selected.startsWith(root + "/")
    ? selected.slice(root.length + 1)
    : undefined;
  const asset = path === undefined
    ? undefined
    : website.staticFiles?.find((f) => f.path === path);
  const directory = !!entries.length && !file;
  const removable = path !== undefined &&
    (!!asset ||
      (directory &&
        ((website.staticFiles ?? []).some((f) =>
          !path || f.path.startsWith(path + "/")
        ) || (website.staticDirectories ?? []).some((d) =>
          d === path || !path || d.startsWith(path + "/")
        ))));
  const openParents = (path: string) =>
    setExpanded((old) => {
      const next = new Set(old);
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        next.add(parts.slice(0, i).join("/"));
      }
      next.add(root);
      return next;
    });
  const choose = (entry: Entry) => {
    setSelected(entry.path);
    if (entry.directory) {
      setExpanded((old) => {
        const next = new Set(old);
        if (next.has(entry.path)) next.delete(entry.path);
        else next.add(entry.path);
        return next;
      });
      if (entry.path === root || entry.path.startsWith(root + "/")) {
        setFolder(entry.path === root ? "" : entry.path.slice(root.length + 1));
      }
    } else if (entry.path.startsWith(root + "/")) {
      setFolder(
        entry.path.slice(root.length + 1).split("/").slice(0, -1).join("/"),
      );
    }
  };
  const list = (nodes: Entry[]) =>
    nodes.map((entry) => (
      <li key={entry.path}>
        <button
          type="button"
          class={"code-tree-item " + (selected === entry.path ? "active" : "")}
          aria-current={selected === entry.path ? "true" : undefined}
          aria-expanded={entry.directory ? expanded.has(entry.path) : undefined}
          onClick={() => choose(entry)}
          title={entry.path}
        >
          <span
            aria-hidden="true"
            class={"code-caret " +
              (entry.directory && expanded.has(entry.path) ? "open" : "")}
          >
            {entry.directory ? "›" : "·"}
          </span>
          <span>
            {entry.name}
            {entry.path === root && format === "react"
              ? " (static assets)"
              : ""}
          </span>
        </button>
        {entry.directory && expanded.has(entry.path) && (
          <ul>{list(entry.children)}</ul>
        )}
      </li>
    ));
  const apply = (next: WebsiteDocument) => {
    try {
      if (onChange(next)) {
        setError("");
        return true;
      }
      return false;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update static files",
      );
      return false;
    }
  };
  const upload = async (input: HTMLInputElement) => {
    const uploads = Array.from(input.files ?? []);
    input.value = "";
    if (!uploads.length || working.current) return;
    working.current = true;
    setBusy(true);
    onPending(true);
    setError("");
    let originals = 0, optimized = 0;
    const additions: StaticFile[] = [];
    try {
      for (let i = 0; i < uploads.length; i++) {
        setMessage(
          `Optimizing ${i + 1} of ${uploads.length}: ${uploads[i].name}`,
        );
        const relative = uploads[i].webkitRelativePath || uploads[i].name;
        const target = staticPath((folder ? folder + "/" : "") + relative);
        const result = await optimizeUpload(uploads[i], target);
        additions.push(result);
        originals += uploads[i].size;
        optimized += result.size;
      }
      if (!active.current) return;
      const map = new Map((website.staticFiles ?? []).map((f) => [f.path, f]));
      additions.forEach((f) => map.set(f.path, f));
      if (apply({ ...website, staticFiles: [...map.values()] })) {
        const last = additions.at(-1)!;
        setSelected(root + "/" + last.path);
        openParents(root + "/" + last.path);
        setMessage(
          `Added ${additions.length} ${
            additions.length === 1 ? "file" : "files"
          }. Saved ${
            bytes(Math.max(0, originals - optimized))
          } through optimization.`,
        );
      } else setMessage("");
    } catch (e) {
      if (active.current) {
        setError(e instanceof Error ? e.message : "Could not optimize files");
        setMessage("");
      }
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
      onPending(false);
    }
  };
  const remove = () => {
    if (path === undefined) return;
    const match = (value: string) =>
      !path || value === path || value.startsWith(path + "/");
    if (
      apply({
        ...website,
        staticFiles: website.staticFiles?.filter((f) => !match(f.path)),
        staticDirectories: website.staticDirectories?.filter((d) => !match(d)),
      })
    ) {
      setSelected(root);
      setFolder("");
      setMessage("Removed uploaded resources. Use Undo to restore them.");
    }
  };
  const { text, binary, image } = useMemo(() => {
    let text = file?.content ?? "", binary = false, image = "";
    if (file?.bytes) {
      const mime = staticMime(file.name);
      if (mime.startsWith("image/")) {
        binary = true;
        image = "data:" + mime + ";base64," +
          encodeBytes(file.bytes);
      } else if (
        /^(text\/|application\/(json|xml|manifest\+json))/.test(mime)
      ) {
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
        } catch {
          binary = true;
        }
      } else binary = true;
    }
    return { text, binary, image };
  }, [file]);

  return (
    <div class="code-workspace">
      <header class="code-toolbar">
        <div>
          <p class="eyebrow">YOUR WEBSITE, AS CODE</p>
          <h1>Project files</h1>
          <p>Read-only source. Manage uploaded resources in {root}/.</p>
        </div>
        <div class="code-toolbar-actions">
          <div class="export-format" role="group" aria-label="Export format">
            {(["fresh", "react"] as const).map((value) => (
              <button
                type="button"
                disabled={busy}
                aria-pressed={format === value}
                class={format === value ? "active" : ""}
                onClick={() => onFormat(value)}
                key={value}
              >
                {value === "fresh" ? "Fresh (Deno)" : "React (Vite)"}
              </button>
            ))}
          </div>
          <button
            type="button"
            class="button"
            disabled={!canUndo || busy}
            onClick={onUndo}
          >
            Undo
          </button>
          <button
            type="button"
            class="button"
            disabled={!canRedo || busy}
            onClick={onRedo}
          >
            Redo
          </button>
          <button
            type="button"
            class="button primary"
            disabled={busy}
            onClick={onDownload}
          >
            Download website.zip ↓
          </button>
        </div>
      </header>
      <div
        class="code-panes"
        ref={panes}
        style={`--code-sidebar-width:${sidebarWidth}px`}
      >
        <aside
          class="code-files"
          id="code-files"
          ref={sidebar}
          style={`--code-file-share:${fileShare}fr;--code-resource-share:${
            100 - fileShare
          }fr`}
        >
          <nav id="code-file-tree" aria-label="Project files">
            <h2>File explorer</h2>
            <ul>{list(entries)}</ul>
          </nav>
          <CodeResizeHandle
            orientation="horizontal"
            label="Resize File Explorer and Static Resources panels"
            controls="code-file-tree code-static-resources"
            value={fileShare}
            min={15}
            max={85}
            onChange={setFileShare}
            fromPointer={(event) => {
              const bounds = sidebar.current!.getBoundingClientRect();
              return (event.clientY - bounds.top) / bounds.height * 100;
            }}
          />
          <section
            class="code-resources"
            id="code-static-resources"
            aria-label="Static resources"
          >
            <fieldset class="static-controls" disabled={busy}>
              <legend>Static resources</legend>
              <p>{bytes(usage.bytes)} / 20 MB</p>
              <progress
                max={usage.limit}
                value={usage.bytes}
                aria-label="Static resource usage"
              />
              <details>
                <summary>Storage breakdown</summary>
                <p>
                  Uploaded: {bytes(usage.userBytes)}
                  <br />Generated images, fonts & runtime:{" "}
                  {bytes(usage.generatedBytes)}
                </p>
              </details>
              <label>
                Upload into folder<input
                  value={folder}
                  placeholder="images or leave empty"
                  onInput={(e) => setFolder(e.currentTarget.value)}
                />
              </label>
              <label class="button static-upload">
                Upload files<input
                  type="file"
                  multiple
                  onChange={(e) => upload(e.currentTarget)}
                />
              </label>
              <label class="button static-upload">
                Upload directory<input
                  type="file"
                  multiple
                  {...{ webkitdirectory: true }}
                  onChange={(e) => upload(e.currentTarget)}
                />
              </label>
              <label>
                New directory<input
                  value={name}
                  placeholder="documents"
                  onInput={(e) => setName(e.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                class="button"
                disabled={!name.trim()}
                onClick={() => {
                  try {
                    const path = staticPath(
                      (folder ? folder + "/" : "") + name.trim(),
                    );
                    if (
                      apply({
                        ...website,
                        staticDirectories: [
                          ...website.staticDirectories ?? [],
                          path,
                        ],
                      })
                    ) {
                      setName("");
                      setSelected(root + "/" + path);
                      setFolder(path);
                      openParents(root + "/" + path + "/");
                      setMessage("Directory created.");
                    }
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Invalid directory",
                    );
                  }
                }}
              >
                Create directory
              </button>
              <p>Files are served from /. Use /images/logo.png on any page.</p>
            </fieldset>
          </section>
        </aside>
        <CodeResizeHandle
          orientation="vertical"
          label="Resize file sidebar and code viewer"
          controls="code-files code-reader"
          value={sidebarWidth}
          min={190}
          max={600}
          onChange={setSidebarWidth}
          fromPointer={(event) => {
            const bounds = panes.current!.getBoundingClientRect();
            return Math.min(event.clientX - bounds.left, bounds.width - 290);
          }}
        />
        <section
          id="code-reader"
          class="code-reader"
          aria-label="Read-only file viewer"
        >
          <header>
            <strong>{selected || "Select a file"}</strong>
            <div>
              {asset && (
                <button
                  type="button"
                  class="button"
                  onClick={() => downloadStatic(asset)}
                >
                  Download file
                </button>
              )}
              {removable && (
                <button
                  type="button"
                  class="button danger"
                  disabled={busy}
                  onClick={remove}
                >
                  {!path
                    ? "Clear uploaded files"
                    : file
                    ? "Remove file"
                    : "Remove directory"}
                </button>
              )}
            </div>
          </header>
          {file && path !== undefined && (
            <label class="static-resource-url">
              Resource URL<input
                readOnly
                value={"/" + path.split("/").map(encodeURIComponent).join("/")}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
          {file
            ? (binary
              ? (
                <div class="code-binary">
                  {image && <img src={image} alt={selected} />}
                  <p>
                    {staticMime(file.name)} · {bytes(file.bytes?.length ?? 0)}
                  </p>
                  <p>Binary file · read only</p>
                </div>
              )
              : (
                <textarea
                  aria-label="File contents · read only"
                  class="code-input"
                  readOnly
                  value={text}
                  spellcheck={false}
                />
              ))
            : (
              <div class="code-directory">
                <p>
                  {directory
                    ? "Directory · choose a file to read its contents."
                    : "Select a file from the explorer."}
                </p>
                <p>
                  Generated files are read only. Uploaded static files and
                  directories can be removed here.
                </p>
              </div>
            )}
          {message && <p class="code-status" role="status">{message}</p>}
          {error && <p class="form-error code-status" role="alert">{error}</p>}
        </section>
      </div>
    </div>
  );
}

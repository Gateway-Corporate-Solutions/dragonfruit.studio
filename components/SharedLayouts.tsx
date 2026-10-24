import { useState } from "preact/hooks";
import type { SharedLayout } from "@/src/domain/shared-layouts.ts";
import type { SiteNode } from "@/src/domain/site.ts";

export function SharedLayoutControls({ node, layout, uses, onSave, onDetach }: {
  node: SiteNode;
  layout?: SharedLayout;
  uses: number;
  onSave: (name: string) => boolean;
  onDetach: () => void;
}) {
  const [name, setName] = useState("");
  if (layout) {
    return (
      <section class="shared-layout-controls">
        <strong>Shared · {layout.name}</strong>
        <p>
          Edits update all {uses} linked{" "}
          {uses === 1 ? "instance" : "instances"}, across pages.
        </p>
        <button type="button" class="button" onClick={onDetach}>
          Detach for this page
        </button>
      </section>
    );
  }
  if (!["div", "section"].includes(node.tag)) return null;
  return (
    <section class="shared-layout-controls">
      <h3>Reuse across pages</h3>
      <label>
        Layout name<input
          value={name}
          maxLength={60}
          placeholder={node.tag === "div" ? "Feature group" : "Site footer"}
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>
      <button
        type="button"
        class="button"
        disabled={!name.trim()}
        onClick={() => {
          if (onSave(name)) setName("");
        }}
      >
        Save to Shared Layouts
      </button>
      <p>
        Keep this container and its copies linked. Undo restores the previous
        layout everywhere.
      </p>
    </section>
  );
}
function LayoutCard({ layout, uses, onInsert, onRename, onRemove }: {
  layout: SharedLayout;
  uses: number;
  onInsert: (id: string, linked: boolean) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(layout.name);
  return (
    <article class="shared-layout-card">
      <strong>{layout.name}</strong>
      <small>
        {layout.node.tag === "div" ? "Group" : "Section"} · {uses} linked{" "}
        {uses === 1 ? "instance" : "instances"}
      </small>
      <button
        type="button"
        class="button"
        onClick={() => onInsert(layout.id, true)}
      >
        + Add to this page
      </button>
      <details class="expert-options">
        <summary>Expert · Layout options</summary>
        <button
          type="button"
          class="button"
          onClick={() => onInsert(layout.id, false)}
        >
          Insert independent copy
        </button>
        <label>
          Rename layout<input
            maxLength={60}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          class="button"
          disabled={!name.trim() || name === layout.name}
          onClick={() => onRename(layout.id, name)}
        >
          Rename
        </button>
        <p>
          Removing a layout from this menu keeps every placed instance as an
          independent copy.
        </p>
        <button
          type="button"
          class="button danger"
          onClick={() => onRemove(layout.id)}
        >
          Remove from Shared Layouts
        </button>
      </details>
    </article>
  );
}
export function SharedLayoutsMenu(
  { layouts, counts, onInsert, onRename, onRemove }: {
    layouts: SharedLayout[];
    counts: Record<string, number>;
    onInsert: (id: string, linked: boolean) => void;
    onRename: (id: string, name: string) => void;
    onRemove: (id: string) => void;
  },
) {
  const [query, setQuery] = useState("");
  const matches = layouts.filter((l) =>
    l.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <div class="shared-layout-menu">
      <h3>Shared Layouts</h3>
      <p>
        Your reusable Groups and Sections, available on every page in this
        website.
      </p>
      {layouts.length > 0 && (
        <label>
          Find a layout<input
            type="search"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>
      )}
      {matches.map((layout) => (
        <LayoutCard
          key={layout.id + layout.name}
          layout={layout}
          uses={counts[layout.id] ?? 0}
          onInsert={onInsert}
          onRename={onRename}
          onRemove={onRemove}
        />
      ))}
      {!matches.length && (
        <p>
          {layouts.length
            ? "No matching layouts."
            : "Select a Group or Section and choose Save to Shared Layouts in the inspector."}
        </p>
      )}
    </div>
  );
}

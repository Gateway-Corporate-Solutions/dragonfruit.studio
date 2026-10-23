import { useState } from "preact/hooks";
import {
  addPageGroup,
  movePageToGroup,
  removePageGroup,
  renamePageGroup,
  type SitePage,
  type WebsiteDocument,
} from "@/src/domain/website.ts";
export default function PageTree({
  website,
  activePage,
  onSelect,
  onRemove,
  onChange,
}: {
  website: WebsiteDocument;
  activePage: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onChange: (website: WebsiteDocument) => void;
}) {
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const groups = website.pageGroups ?? [];
  const apply = (fn: () => WebsiteDocument) => {
    try {
      onChange(fn());
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update group");
      return false;
    }
  };
  function row(page: SitePage) {
    return (
      <div class="group-page" key={page.id}>
        <div class="page-row">
          <button
            type="button"
            aria-current={activePage === page.id ? "page" : undefined}
            class={activePage === page.id ? "active" : ""}
            onClick={() => onSelect(page.id)}
          >
            <span>{page.path === "/" ? "⌂" : "▤"}</span>
            <span>
              {page.name}
              <small>{page.path}</small>
            </span>
          </button>
          {page.path !== "/" && (
            <button
              type="button"
              class="page-remove"
              aria-label={`Remove ${page.name} page`}
              title={`Remove ${page.name} page`}
              onClick={() => onRemove(page.id)}
            >
              ×
            </button>
          )}
        </div>
        {activePage === page.id && groups.length > 0 && (
          <label class="page-group-select">
            Group<select
              aria-label={`Group for ${page.name}`}
              value={page.groupId ?? ""}
              onChange={(e) =>
                apply(() =>
                  movePageToGroup(
                    website,
                    page.id,
                    e.currentTarget.value || undefined,
                  )
                )}
            >
              <option value="">Ungrouped</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  }
  return (
    <div class="page-list" aria-label="Website pages">
      <button
        type="button"
        class="page-group-add"
        disabled={groups.length >= 16}
        onClick={() => setAdding(!adding)}
      >
        + Add group
      </button>
      {adding && (
        <form
          class="page-group-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (apply(() => addPageGroup(website, name))) {
              setAdding(false);
              setName("");
            }
          }}
        >
          <label>
            Group name<input
              autoFocus
              required
              maxLength={60}
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </label>
          <div class="settings-buttons">
            <button class="button" type="submit">Create group</button>
            <button
              class="button"
              type="button"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {website.pages.filter((p) => !p.groupId).map(row)}
      {groups.map((group) => (
        <details class="page-group" key={group.id} open>
          <summary>
            <span class="page-group-caret" aria-hidden="true">›</span>
            <span>{group.name}</span>
            <small>
              {website.pages.filter((p) => p.groupId === group.id).length}
            </small>
          </summary>
          <div class="page-group-pages">
            {website.pages.filter((p) => p.groupId === group.id).map(row)}
            {!website.pages.some((p) => p.groupId === group.id) && (
              <p class="page-group-empty">
                Select a page, then choose this group.
              </p>
            )}
            <details class="page-group-manage">
              <summary>Manage group</summary>
              <label>
                Group name<input
                  aria-label={`Rename ${group.name} group`}
                  defaultValue={group.name}
                  key={group.name}
                  maxLength={60}
                  onChange={(e) =>
                    apply(() =>
                      renamePageGroup(website, group.id, e.currentTarget.value)
                    )}
                />
              </label>
              <button
                type="button"
                class="button"
                onClick={() => apply(() => removePageGroup(website, group.id))}
              >
                Remove group
              </button>
              <p>Pages will move to Ungrouped.</p>
            </details>
          </div>
        </details>
      ))}
      {error && <p role="alert" class="form-error">{error}</p>}
    </div>
  );
}

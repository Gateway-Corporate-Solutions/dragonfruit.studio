import { useEffect, useRef, useState } from "preact/hooks";
import {
  PAGE_TEMPLATES,
  type PageTemplate,
  uniquePagePath,
  type WebsiteDocument,
} from "@/src/domain/website.ts";
export default function PageDialog(
  { website, onClose, onCreate }: {
    website: WebsiteDocument;
    onClose: () => void;
    onCreate: (template: PageTemplate, name: string) => string | undefined;
  },
) {
  const ref = useRef<HTMLDialogElement>(null);
  const [template, setTemplate] = useState<PageTemplate>("about"),
    [name, setName] = useState("About"),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      class="page-dialog"
      aria-labelledby="page-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const result = onCreate(template, name.trim());
          if (result) setError(result);
        }}
      >
        <div class="page-dialog-heading">
          <div>
            <p class="eyebrow">ROOM FOR MORE</p>
            <h2 id="page-dialog-title">Add a page</h2>
            <p>Start with a familiar layout. Make every detail yours.</p>
          </div>
          <button
            type="button"
            class="dialog-close"
            onClick={onClose}
            aria-label="Close page templates"
          >
            ×
          </button>
        </div>
        <div class="template-grid">
          {PAGE_TEMPLATES.map((t) => (
            <button
              type="button"
              key={t.id}
              aria-pressed={template === t.id}
              class={template === t.id ? "active" : ""}
              onClick={() => {
                setTemplate(t.id);
                setName(t.name);
                setError("");
              }}
            >
              <span>{t.icon}</span>
              <strong>{t.name}</strong>
              <small>{t.description}</small>
            </button>
          ))}
        </div>
        <label>
          Page name<input
            value={name}
            maxLength={60}
            required
            autoFocus
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <p class="page-address">
          Page URL <code>{uniquePagePath(website, name)}</code>{" "}
          <span>Change it later in Settings.</span>
        </p>
        {error && <p class="form-error" role="alert">{error}</p>}
        <div class="page-dialog-actions">
          <button type="button" class="button" onClick={onClose}>Cancel</button>
          <button type="submit" class="button primary">Create page →</button>
        </div>
      </form>
    </dialog>
  );
}

import { useEffect, useRef, useState } from "preact/hooks";
import type { SiteNode } from "@/src/domain/site.ts";
import {
  defaultFields,
  type LayerOptions,
  MAX_IMAGE_BYTES,
  parseLayer,
} from "@/src/domain/layers.ts";
import { defaultJavascript } from "@/src/domain/interactions.ts";
import type { ApiConnection } from "@/src/domain/forms.ts";
export default function LayerInspector({
  node,
  apis,
  onChange,
  onPending,
  onApi,
  onStyle,
  pages,
}: {
  node: SiteNode;
  apis: ApiConnection[];
  onChange: (options: LayerOptions) => void;
  onPending: (pending: boolean) => void;
  onApi: () => void;
  onStyle: (key: string, value: string) => void;
  pages: { name: string; path: string }[];
}) {
  const o = node.layer ?? {};
  const uploadDialog = useRef<HTMLDialogElement>(null);
  const [json, setJson] = useState<string | null>(null),
    [js, setJs] = useState<string | null>(null),
    [error, setError] = useState(""),
    [uploadError, setUploadError] = useState("");
  const pending = json !== null || js !== null;
  useEffect(() => {
    onPending(pending);
    return () => onPending(false);
  }, [pending]);
  useEffect(() => {
    if (uploadError) uploadDialog.current?.showModal();
  }, [uploadError]);
  const change = (patch: Partial<LayerOptions>) => onChange({ ...o, ...patch });
  const interactive = ["carousel", "accordion", "nav", "navmenu"].includes(
    node.tag,
  );
  const editItem = (
    i: number,
    key: "title" | "body" | "href" | "image",
    value: string,
  ) =>
    change({
      items: o.items!.map((x, j) => i === j ? { ...x, [key]: value } : x),
    });
  return (
    <section class="layer-options">
      <fieldset disabled={pending}>
        {node.tag === "a" && (
          <label class="inline-check">
            <input
              type="checkbox"
              checked={o.newTab}
              onChange={(e) => change({ newTab: e.currentTarget.checked })}
            />Open in a new tab
          </label>
        )}
        {node.tag === "img" && (
          <>
            <label>
              Image URL<input
                value={o.src ?? ""}
                placeholder="https://… or upload below"
                onInput={(e) => change({ src: e.currentTarget.value })}
              />
            </label>
            <label>
              Upload image<input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (!file) return;
                  e.currentTarget.value = "";
                  if (file.size > MAX_IMAGE_BYTES) {
                    setUploadError(
                      "This image is larger than 10 MB. Choose a smaller PNG, JPEG, WebP, or GIF, or use an HTTPS image URL.",
                    );
                    return;
                  }
                  if (
                    !["image/png", "image/jpeg", "image/webp", "image/gif"]
                      .includes(file.type)
                  ) {
                    setUploadError(
                      "This file type is not supported. Upload a PNG, JPEG, WebP, or GIF image up to 10 MB.",
                    );
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result !== "string") {
                      setUploadError(
                        "The image could not be read. Try another image up to 10 MB, or use an HTTPS image URL.",
                      );
                      return;
                    }
                    change({ src: reader.result });
                  };
                  reader.onerror = () =>
                    setUploadError(
                      "The image could not be read. Try another image up to 10 MB, or use an HTTPS image URL.",
                    );
                  reader.onabort = () =>
                    setUploadError(
                      "The image upload was interrupted. Try again.",
                    );
                  try {
                    reader.readAsDataURL(file);
                  } catch {
                    setUploadError(
                      "The image could not be read. Try another image up to 10 MB, or use an HTTPS image URL.",
                    );
                  }
                }}
              />
            </label>
            <label>
              Alternative text<input
                value={o.alt ?? ""}
                maxLength={300}
                onInput={(e) => change({ alt: e.currentTarget.value })}
              />
            </label>
            <label>
              Image fit<select
                aria-label="Image fit"
                value={node.styles["object-fit"] ?? "cover"}
                onChange={(e) => onStyle("object-fit", e.currentTarget.value)}
              >
                {["cover", "contain", "fill", "none"].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              Image width<input
                value={node.styles.width ?? "100%"}
                onInput={(e) => onStyle("width", e.currentTarget.value)}
              />
            </label>
            <label>
              Image height<input
                value={node.styles.height ?? "auto"}
                onInput={(e) => onStyle("height", e.currentTarget.value)}
              />
            </label>
            <p class="inspector-help">
              Uploads are embedded in the exported project. HTTPS images remain
              hosted at their original URL.
            </p>
          </>
        )}
        {node.tag === "form" && (
          <>
            <label>
              Form API<select
                aria-label="Form API"
                value={o.apiId ?? ""}
                onChange={(e) => {
                  const api = apis.find((a) => a.id === e.currentTarget.value);
                  const fields = o.fields ?? defaultFields();
                  change({
                    apiId: e.currentTarget.value,
                    ...(api?.provider === "mailchimp" &&
                        !fields.some((f) => f.name === api.consentField)
                      ? {
                        fields: [...fields, {
                          name: api.consentField,
                          label: "I agree to receive newsletter emails.",
                          type: "checkbox",
                          required: true,
                        }],
                      }
                      : {}),
                  });
                }}
              >
                <option value="">Choose an API connection</option>
                {apis.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.provider}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" class="button" onClick={onApi}>
              Open API editor →
            </button>
            <label>
              Submit button<input
                value={o.submitLabel}
                maxLength={100}
                onInput={(e) => change({ submitLabel: e.currentTarget.value })}
              />
            </label>
            <label>
              Success message<input
                value={o.successMessage}
                maxLength={500}
                onInput={(e) =>
                  change({ successMessage: e.currentTarget.value })}
              />
            </label>
            <p class="inspector-label">FORM FIELDS</p>
            {(o.fields ?? []).map((field, i) => (
              <div class="option-card" key={i}>
                <label>
                  Field {i + 1} label<input
                    aria-label={"Field " + (i + 1) + " label"}
                    value={field.label}
                    maxLength={120}
                    onInput={(e) =>
                      change({
                        fields: o.fields!.map((f, j) =>
                          j === i ? { ...f, label: e.currentTarget.value } : f
                        ),
                      })}
                  />
                </label>
                <label>
                  Field name<input
                    aria-label={"Field " + (i + 1) + " name"}
                    value={field.name}
                    maxLength={40}
                    onInput={(e) =>
                      change({
                        fields: o.fields!.map((f, j) =>
                          j === i ? { ...f, name: e.currentTarget.value } : f
                        ),
                      })}
                  />
                </label>
                <label>
                  Field type<select
                    aria-label={"Field " + (i + 1) + " type"}
                    value={field.type}
                    onChange={(e) =>
                      change({
                        fields: o.fields!.map((f, j) =>
                          j === i
                            ? {
                              ...f,
                              type: e.currentTarget.value as typeof field.type,
                            }
                            : f
                        ),
                      })}
                  >
                    {["text", "email", "textarea", "tel", "number", "checkbox"]
                      .map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label class="inline-check">
                  <input
                    type="checkbox"
                    aria-label={"Field " + (i + 1) + " required"}
                    checked={field.required}
                    onChange={(e) =>
                      change({
                        fields: o.fields!.map((f, j) =>
                          j === i
                            ? { ...f, required: e.currentTarget.checked }
                            : f
                        ),
                      })}
                  />Required
                </label>
                <button
                  type="button"
                  class="button"
                  disabled={o.fields!.length <= 1}
                  onClick={() =>
                    change({
                      fields: o.fields!.filter((_, j) =>
                        j !== i
                      ),
                    })}
                >
                  Remove field {i + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              class="button"
              disabled={(o.fields?.length ?? 0) >= 16}
              onClick={() => {
                let n = 1;
                while (o.fields!.some((f) => f.name === "field_" + n)) n++;
                change({
                  fields: [...o.fields!, {
                    name: "field_" + n,
                    label: "New field",
                    type: "text",
                    required: false,
                  }],
                });
              }}
            >
              + Add field
            </button>
            <p class="inspector-help">
              Preview validates without sending. Exported forms use the server
              API and your configured integration.
            </p>
          </>
        )}
        {interactive && (
          <>
            {["nav", "navmenu"].includes(node.tag) && (
              <button
                type="button"
                class="button"
                onClick={() =>
                  change({
                    items: pages.map((p) => ({
                      title: p.name,
                      body: "",
                      href: p.path,
                      image: "",
                    })),
                  })}
              >
                Use website pages
              </button>
            )}
            <p class="inspector-label">
              {node.tag === "carousel"
                ? "SLIDES"
                : node.tag === "accordion"
                ? "PANELS"
                : "MENU LINKS"}
            </p>
            {(o.items ?? []).map((item, i) => (
              <div class="option-card" key={i}>
                <label>
                  Item {i + 1} title<input
                    aria-label={"Item " + (i + 1) + " title"}
                    value={item.title}
                    maxLength={200}
                    onInput={(e) => editItem(i, "title", e.currentTarget.value)}
                  />
                </label>
                {["carousel", "accordion"].includes(node.tag) && (
                  <label>
                    Item {i + 1} text<textarea
                      aria-label={"Item " + (i + 1) + " text"}
                      value={item.body}
                      maxLength={3000}
                      rows={3}
                      onInput={(e) =>
                        editItem(i, "body", e.currentTarget.value)}
                    />
                  </label>
                )}
                {node.tag !== "accordion" && (
                  <label>
                    Item {i + 1} link<input
                      aria-label={"Item " + (i + 1) + " link"}
                      value={item.href}
                      onInput={(e) =>
                        editItem(i, "href", e.currentTarget.value)}
                    />
                  </label>
                )}
                {node.tag === "carousel" && (
                  <label>
                    Item {i + 1} image URL<input
                      aria-label={"Item " + (i + 1) + " image URL"}
                      value={item.image}
                      onInput={(e) =>
                        editItem(i, "image", e.currentTarget.value)}
                    />
                  </label>
                )}
                <div class="settings-buttons">
                  <button
                    type="button"
                    class="button"
                    disabled={i === 0}
                    onClick={() => {
                      const items = [...o.items!];
                      [items[i - 1], items[i]] = [items[i], items[i - 1]];
                      change({ items });
                    }}
                  >
                    Move item {i + 1} up
                  </button>
                  <button
                    type="button"
                    class="button"
                    disabled={o.items!.length <= 1}
                    onClick={() =>
                      change({ items: o.items!.filter((_, j) => j !== i) })}
                  >
                    Remove item {i + 1}
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              class="button"
              disabled={(o.items?.length ?? 0) >= 12}
              onClick={() =>
                change({
                  items: [...o.items!, {
                    title: "New item",
                    body: "Add your content here.",
                    href: "#",
                    image: "",
                  }],
                })}
            >
              + Add item
            </button>
            <p class="inspector-label">INTERACTION</p>
            <label>
              Animation<select
                aria-label="Animation"
                value={o.animation ?? "fade"}
                onChange={(e) =>
                  change({
                    animation: e.currentTarget
                      .value as LayerOptions["animation"],
                  })}
              >
                {["none", "fade", "slide"].map((a) => (
                  <option key={a} value={a}>
                    {a === "none" ? "None" : a === "fade" ? "Fade" : "Slide"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Animation duration (ms)<input
                type="number"
                min={0}
                max={2000}
                value={o.duration ?? 250}
                onInput={(e) =>
                  change({ duration: Number(e.currentTarget.value) })}
              />
            </label>
            {node.tag === "carousel" && (
              <>
                <label class="inline-check">
                  <input
                    type="checkbox"
                    checked={o.autoplay}
                    onChange={(e) =>
                      change({ autoplay: e.currentTarget.checked })}
                  />Autoplay slides
                </label>
                <label>
                  Slide interval (ms)<input
                    type="number"
                    min={1500}
                    max={60000}
                    value={o.interval ?? 5000}
                    onInput={(e) =>
                      change({ interval: Number(e.currentTarget.value) })}
                  />
                </label>
              </>
            )}
            {node.tag === "accordion" && (
              <label class="inline-check">
                <input
                  type="checkbox"
                  checked={o.multiple}
                  onChange={(e) =>
                    change({ multiple: e.currentTarget.checked })}
                />Allow multiple open panels
              </label>
            )}
            {["nav", "navmenu"].includes(node.tag) && (
              <label>
                Collapsible menu<select
                  aria-label="Collapsible menu"
                  value={o.collapse ?? "mobile"}
                  onChange={(e) =>
                    change({
                      collapse: e.currentTarget.value as "mobile" | "always",
                    })}
                >
                  <option value="mobile">On small screens</option>
                  <option value="always">Always</option>
                </select>
              </label>
            )}
            <p class="inspector-help">
              Try interactions in Preview. Presets respect reduced motion.
              Custom JavaScript overrides the default behavior.
            </p>
          </>
        )}
      </fieldset>
      {uploadError && (
        <dialog
          ref={uploadDialog}
          class="page-dialog upload-error-dialog"
          aria-labelledby="image-upload-error-title"
          onCancel={(event) => {
            event.preventDefault();
            uploadDialog.current?.close();
            setUploadError("");
          }}
        >
          <div class="page-dialog-heading">
            <div>
              <p class="eyebrow">IMAGE UPLOAD</p>
              <h2 id="image-upload-error-title">Image upload failed</h2>
              <p>{uploadError}</p>
            </div>
            <button
              type="button"
              class="dialog-close"
              aria-label="Close image upload message"
              onClick={() => {
                uploadDialog.current?.close();
                setUploadError("");
              }}
            >
              ×
            </button>
          </div>
          <div class="page-dialog-actions">
            <button
              type="button"
              class="button primary"
              onClick={() => {
                uploadDialog.current?.close();
                setUploadError("");
              }}
            >
              Got it
            </button>
          </div>
        </dialog>
      )}
      {interactive && (
        <details class="expert-options">
          <summary>Expert · JavaScript</summary>
          <p class="inspector-help">
            Edit the actual interaction function body. Available: element,
            options, api.on, api.animate, api.cleanup. Use api.cleanup for
            timers. Preview runs inside the isolated canvas; exports run this
            code in your website.
          </p>
          <label>
            Interaction JavaScript<textarea
              class="code-input"
              rows={16}
              spellcheck={false}
              maxLength={20000}
              value={js ?? o.javascript ?? defaultJavascript(node.tag)}
              onInput={(e) => {
                const value = e.currentTarget.value;
                setJs(
                  value === (o.javascript ?? defaultJavascript(node.tag))
                    ? null
                    : value,
                );
              }}
            />
          </label>
          <div class="settings-buttons">
            <button
              type="button"
              class="button primary"
              onClick={() => {
                try {
                  const value = js ?? o.javascript ??
                    defaultJavascript(node.tag);
                  new Function("element", "options", "api", value);
                  change({ javascript: value });
                  setJs(null);
                  setError("");
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Invalid JavaScript",
                  );
                }
              }}
            >
              Apply JavaScript
            </button>
            <button
              type="button"
              class="button"
              onClick={() => {
                setJs(null);
                setError("");
              }}
            >
              Discard JavaScript
            </button>
            <button
              type="button"
              class="button"
              onClick={() => {
                const next = { ...o };
                delete next.javascript;
                onChange(next);
                setJs(null);
                setError("");
              }}
            >
              Restore preset JavaScript
            </button>
          </div>
        </details>
      )}
      {node.layer && (
        <details class="expert-options">
          <summary>Expert · Layer JSON</summary>
          <label>
            Layer configuration<textarea
              class="code-input"
              spellcheck={false}
              rows={12}
              maxLength={350000}
              value={json ?? JSON.stringify(o, null, 2)}
              onInput={(e) =>
                setJson(
                  e.currentTarget.value === JSON.stringify(o, null, 2)
                    ? null
                    : e.currentTarget.value,
                )}
            />
          </label>
          <div class="settings-buttons">
            <button
              type="button"
              class="button"
              onClick={() => {
                try {
                  onChange(
                    parseLayer(
                      node.tag,
                      JSON.parse(json ?? JSON.stringify(o)),
                    ) ?? {},
                  );
                  setJson(null);
                  setError("");
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Invalid configuration",
                  );
                }
              }}
            >
              Apply layer JSON
            </button>
            <button
              type="button"
              class="button"
              onClick={() => {
                setJson(null);
                setError("");
              }}
            >
              Discard layer JSON
            </button>
          </div>
        </details>
      )}
      {pending && (
        <p class="inspector-help">
          Apply or discard expert edits before changing the visual configuration
          or saving.
        </p>
      )}
      {error && <p class="form-error" role="alert">{error}</p>}
    </section>
  );
}

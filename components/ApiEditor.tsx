import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { allNodes } from "@/src/domain/site.ts";
import type { WebsiteDocument } from "@/src/domain/website.ts";
import {
  type ApiConnection,
  type Integration,
  newConnection,
} from "@/src/domain/forms.ts";
import ApiConnectionEditor from "./ApiConnectionEditor.tsx";
export default function ApiEditor(
  { website, projectId, onChange, onPending }: {
    website: WebsiteDocument;
    projectId: string;
    onChange: (site: WebsiteDocument) => boolean | void;
    onPending: (pending: boolean) => void;
  },
) {
  const apis = website.apis ?? [],
    forms = website.pages.flatMap((page) =>
      allNodes(page).filter((n) => n.tag === "form").map((node) => ({
        page,
        node,
        key: page.id + "/" + node.id,
      }))
    );
  const [added, setAdded] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(pending);
  const reportPending = useCallback((id: string, dirty: boolean) => {
    if (pendingRef.current.has(id) === dirty) return;
    const next = new Set(pendingRef.current);
    if (dirty) next.add(id);
    else next.delete(id);
    pendingRef.current = next;
    setPending(next);
    onPending(next.size > 0);
  }, [onPending]);
  const hasPending = pending.size > 0;
  const [testForm, setTestForm] = useState(forms[0]?.key ?? ""),
    [sample, setSample] = useState(""),
    [result, setResult] = useState(""),
    [testing, setTesting] = useState(false);
  const form = forms.find((f) => f.key === testForm) ?? forms[0];
  useEffect(() => {
    return () => onPending(false);
  }, [onPending]);
  useEffect(() => {
    if (form) {
      setSample(
        JSON.stringify(
          Object.fromEntries(
            form.node.layer!.fields!.map((f) => [
              f.name,
              f.type === "email"
                ? "hello@example.com"
                : f.type === "checkbox"
                ? "true"
                : f.type === "number"
                ? "1"
                : "Sample " + f.label,
            ]),
          ),
          null,
          2,
        ),
      );
      setResult("");
    }
  }, [form?.key, JSON.stringify(form?.node.layer?.fields)]);
  const commit = (next: ApiConnection[]) =>
    onChange({ ...website, apis: next });
  const add = (provider: Integration) => {
    const c = newConnection(provider);
    if (commit([...apis, c]) !== false) setAdded(c.id);
  };
  return (
    <div class="api-editor editor-settings">
      <p class="eyebrow">MAKE YOUR FORMS USEFUL</p>
      <h1>Connect, collect, deliver.</h1>
      <p class="muted">
        Choose what happens when a visitor submits a form. Start with a guided
        integration; open expert JSON whenever you need it.
      </p>
      <section class="panel">
        <h2>1. Choose an integration</h2>
        <div class="integration-grid">
          {([
            ["preview", "Preview", "Validate without delivery"],
            ["resend", "Resend", "Send an email notification"],
            ["mailchimp", "Mailchimp", "Grow a newsletter audience"],
            ["webhook", "Webhook", "Send JSON to your service"],
          ] as const).map(([provider, name, description]) => (
            <button
              type="button"
              class="integration-card"
              disabled={apis.length >= 24}
              onClick={() => add(provider)}
            >
              <strong>+ {name}</strong>
              <span>{description}</span>
            </button>
          ))}
        </div>
      </section>
      <section class="panel">
        <h2>2. Configure delivery</h2>
        <p class="muted">
          Open any connections to edit them together. Each connection keeps its
          own expert JSON draft.
        </p>
        {apis.length === 0 && (
          <p class="muted">
            Choose an integration above to add your first connection.
          </p>
        )}
      </section>
      <section class="api-connections" aria-label="API connections">
        {apis.map((connection, index) => (
          <ApiConnectionEditor
            key={connection.id}
            connection={connection}
            initiallyOpen={connection.id === added || index === 0}
            connected={forms.some((f) => f.node.layer?.apiId === connection.id)}
            onChange={(next) =>
              commit(apis.map((a) => a.id === connection.id ? next : a))}
            onRemove={() => commit(apis.filter((a) => a.id !== connection.id))}
            onPending={reportPending}
          />
        ))}
      </section>
      <section class="panel">
        <h2>3. Connect your forms</h2>
        {!forms.length
          ? (
            <p class="muted">
              Add a Form layer in Design, then choose its API connection here or
              in the layer inspector.
            </p>
          )
          : forms.map(({ page, node }) => (
            <label>
              {page.name} · {node.text || node.id}
              <select
                aria-label={"API for " + page.name + " " + node.id}
                value={node.layer?.apiId ?? ""}
                onChange={(e) => {
                  const id = e.currentTarget.value,
                    api = apis.find((a) => a.id === id);
                  const fields = node.layer!.fields!;
                  const visit = (nodes: typeof page.nodes): typeof page.nodes =>
                    nodes.map((n) =>
                      n.id === node.id
                        ? {
                          ...n,
                          layer: {
                            ...n.layer,
                            apiId: id,
                            ...(api?.provider === "mailchimp" &&
                                !fields.some((f) => f.name === api.consentField)
                              ? {
                                fields: [...fields, {
                                  name: api.consentField,
                                  label:
                                    "I agree to receive newsletter emails.",
                                  type: "checkbox" as const,
                                  required: true,
                                }],
                              }
                              : {}),
                          },
                        }
                        : { ...n, children: visit(n.children) }
                    );
                  onChange({
                    ...website,
                    pages: website.pages.map((p) =>
                      p.id === page.id ? { ...p, nodes: visit(p.nodes) } : p
                    ),
                  });
                }}
              >
                <option value="">Not connected</option>
                {apis.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          ))}
      </section>
      {form && (
        <section class="panel">
          <h2>4. Test without sending</h2>
          <p class="muted">
            Test field validation and integration mappings using sample data.
            This never contacts providers or saves submissions.
          </p>
          <label>
            Test form<select
              aria-label="Test form"
              value={form.key}
              onChange={(e) => setTestForm(e.currentTarget.value)}
            >
              {forms.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.page.name} · {f.node.text || f.node.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sample submission<textarea
              class="code-input"
              rows={10}
              value={sample}
              spellcheck={false}
              onInput={(e) => setSample(e.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            class="button primary"
            disabled={testing || hasPending}
            onClick={async () => {
              try {
                setTesting(true);
                setResult("");
                const values = JSON.parse(sample);
                const response = await fetch(
                  "/api/projects/" + projectId + "/forms/test",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      document: website,
                      pageId: form.page.id,
                      nodeId: form.node.id,
                      values,
                    }),
                  },
                );
                const data = await response.json();
                setResult(
                  response.ok
                    ? "Validated · " + data.provider + " · " + data.message
                    : (data.error ?? data.issues?.join(" · ") ??
                      "Validation failed"),
                );
              } catch (e) {
                setResult(
                  e instanceof Error ? e.message : "Could not validate sample",
                );
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? "Testing…" : "Test form locally"}
          </button>
          {result && <p class="result" role="status">{result}</p>}
        </section>
      )}
    </div>
  );
}

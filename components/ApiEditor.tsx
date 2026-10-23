import { useEffect, useState } from "preact/hooks";
import { allNodes } from "@/src/domain/site.ts";
import type { WebsiteDocument } from "@/src/domain/website.ts";
import {
  type ApiConnection,
  type Integration,
  newConnection,
  parseConnections,
} from "@/src/domain/forms.ts";
export default function ApiEditor(
  { website, projectId, onChange, onPending }: {
    website: WebsiteDocument;
    projectId: string;
    onChange: (site: WebsiteDocument) => void;
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
  const [selected, setSelected] = useState(apis[0]?.id ?? ""),
    [json, setJson] = useState<string | null>(null),
    [error, setError] = useState(""),
    [testForm, setTestForm] = useState(forms[0]?.key ?? ""),
    [sample, setSample] = useState(""),
    [result, setResult] = useState(""),
    [testing, setTesting] = useState(false);
  const connection = apis.find((a) => a.id === selected) ?? apis[0];
  const form = forms.find((f) => f.key === testForm) ?? forms[0];
  useEffect(() => {
    onPending(json !== null);
    return () => onPending(false);
  }, [json !== null]);
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
  const update = (patch: Partial<ApiConnection>) => {
    if (connection) {
      commit(apis.map((a) => a.id === connection.id ? { ...a, ...patch } : a));
    }
  };
  const add = (provider: Integration) => {
    const c = newConnection(provider);
    commit([...apis, c]);
    setSelected(c.id);
    setError("");
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
              disabled={json !== null || apis.length >= 24}
              onClick={() => add(provider)}
            >
              <strong>+ {name}</strong>
              <span>{description}</span>
            </button>
          ))}
        </div>
      </section>
      {connection && (
        <section class="panel">
          <h2>2. Configure delivery</h2>
          <fieldset disabled={json !== null}>
            <label>
              API connection<select
                aria-label="API connection"
                value={connection.id}
                onChange={(e) => {
                  setSelected(e.currentTarget.value);
                  setError("");
                }}
              >
                {apis.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.provider}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Connection name<input
                value={connection.name}
                maxLength={200}
                onInput={(e) => update({ name: e.currentTarget.value })}
              />
            </label>
            <label>
              Integration<select
                aria-label="Integration"
                value={connection.provider}
                onChange={(e) => {
                  const defaults = newConnection(
                    e.currentTarget.value as Integration,
                  );
                  update({
                    ...defaults,
                    id: connection.id,
                    name: connection.name,
                  });
                }}
              >
                {["preview", "resend", "mailchimp", "webhook"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            {connection.provider === "preview"
              ? (
                <p class="muted">
                  This connection validates form data and delivers nothing.
                  Switch integrations when you are ready to connect your
                  website.
                </p>
              )
              : (
                <>
                  <p class="muted">
                    Credentials stay on your server. The exported project
                    includes .env.example with these variable names. Add the
                    values there before running it.
                  </p>
                  {([
                    ["credentialEnv", "API key environment variable"],
                    ...(connection.provider === "resend"
                      ? [["fromEnv", "Sender email environment variable"], [
                        "toEnv",
                        "Recipient email environment variable",
                      ]]
                      : connection.provider === "mailchimp"
                      ? [["audienceEnv", "Audience ID environment variable"]]
                      : [["urlEnv", "Webhook URL environment variable"]]),
                  ] as [keyof ApiConnection, string][]).map(([key, label]) => (
                    <label>
                      {label}
                      <input
                        aria-label={label}
                        value={String(connection[key])}
                        maxLength={80}
                        onInput={(e) =>
                          update({ [key]: e.currentTarget.value })}
                      />
                    </label>
                  ))}
                  {connection.provider === "resend" && (
                    <label>
                      Email subject<input
                        value={connection.subject}
                        maxLength={200}
                        onInput={(e) =>
                          update({ subject: e.currentTarget.value })}
                      />
                    </label>
                  )}
                  {["resend", "mailchimp"].includes(connection.provider) && (
                    <label>
                      Email field name<input
                        value={connection.emailField}
                        maxLength={40}
                        onInput={(e) =>
                          update({ emailField: e.currentTarget.value })}
                      />
                    </label>
                  )}
                  {connection.provider === "mailchimp" && (
                    <>
                      <label>
                        Consent checkbox field name<input
                          value={connection.consentField}
                          maxLength={40}
                          onInput={(e) =>
                            update({ consentField: e.currentTarget.value })}
                        />
                      </label>
                      <p class="muted">
                        Subscribers receive a confirmation email (double
                        opt-in). Connecting a Form layer to Mailchimp adds a
                        consent checkbox. Add optional merge tags such as FNAME
                        in expert JSON.
                      </p>
                      <label>
                        First name field (optional)<input
                          value={connection.mergeFields.FNAME ?? ""}
                          placeholder="name"
                          onInput={(e) => {
                            const map = { ...connection.mergeFields };
                            if (e.currentTarget.value) {
                              map.FNAME = e.currentTarget.value;
                            } else delete map.FNAME;
                            update({ mergeFields: map });
                          }}
                        />
                      </label>
                    </>
                  )}
                  {connection.provider === "webhook" && (
                    <p class="muted">
                      Set the webhook URL to an HTTPS endpoint. The optional
                      token is sent as a Bearer credential. Payload: form, page,
                      and fields.
                    </p>
                  )}
                </>
              )}
            <button
              type="button"
              class="button danger"
              onClick={() => {
                if (forms.some((f) => f.node.layer?.apiId === connection.id)) {
                  setError(
                    "Disconnect forms from this API before removing it.",
                  );
                  return;
                }
                commit(apis.filter((a) => a.id !== connection.id));
                setError("");
              }}
            >
              Remove API connection
            </button>
          </fieldset>
          <details class="expert-options">
            <summary>Expert · API JSON</summary>
            <p class="muted">
              Edit the same configuration used by the guided controls, including
              provider field mappings and the per-form submission limit.
            </p>
            <label>
              API configuration<textarea
                class="code-input"
                spellcheck={false}
                rows={20}
                value={json ?? JSON.stringify(connection, null, 2)}
                onInput={(e) =>
                  setJson(
                    e.currentTarget.value ===
                        JSON.stringify(connection, null, 2)
                      ? null
                      : e.currentTarget.value,
                  )}
              />
            </label>
            <div class="settings-buttons">
              <button
                type="button"
                class="button primary"
                onClick={() => {
                  try {
                    const parsed = parseConnections([
                      JSON.parse(json ?? JSON.stringify(connection)),
                    ])[0];
                    if (parsed.id !== connection.id) {
                      throw new Error(
                        "Keep the connection ID; forms use it to link delivery.",
                      );
                    }
                    commit(
                      apis.map((a) => a.id === connection.id ? parsed : a),
                    );
                    setJson(null);
                    setError("");
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Invalid API JSON",
                    );
                  }
                }}
              >
                Apply API JSON
              </button>
              <button
                type="button"
                class="button"
                onClick={() => {
                  setJson(null);
                  setError("");
                }}
              >
                Discard API JSON
              </button>
            </div>
          </details>
        </section>
      )}
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
                disabled={json !== null}
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
            disabled={testing || json !== null}
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
      {error && <p class="form-error" role="alert">{error}</p>}
    </div>
  );
}

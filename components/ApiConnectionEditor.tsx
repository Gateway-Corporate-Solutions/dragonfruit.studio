import { useEffect, useState } from "preact/hooks";
import {
  type ApiConnection,
  type Integration,
  newConnection,
  parseConnections,
} from "@/src/domain/forms.ts";

export default function ApiConnectionEditor(
  { connection, initiallyOpen, connected, onChange, onRemove, onPending }: {
    connection: ApiConnection;
    initiallyOpen: boolean;
    connected: boolean;
    onChange: (connection: ApiConnection) => boolean | void;
    onRemove: () => void;
    onPending: (id: string, pending: boolean) => void;
  },
) {
  const [open, setOpen] = useState(initiallyOpen);
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    return () => onPending(connection.id, false);
  }, [connection.id, onPending]);
  const setDraft = (value: string | null) => {
    setJson(value);
    onPending(connection.id, value !== null);
  };
  const update = (patch: Partial<ApiConnection>) =>
    onChange({ ...connection, ...patch });
  return (
    <details
      class="panel api-connection"
      aria-label={"API connection " + connection.name}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <strong>{connection.name}</strong>
        <span>
          {connection.provider}
          {json !== null ? " · Unapplied JSON" : ""}
        </span>
      </summary>
      <div class="api-connection-content">
        <fieldset disabled={json !== null}>
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
                This connection validates form data and delivers nothing. Switch
                integrations when you are ready to connect your website.
              </p>
            )
            : (
              <>
                <p class="muted">
                  Credentials stay on your server. The exported project includes
                  .env.example with these variable names. Add the values there
                  before running it.
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
                      onInput={(e) => update({ [key]: e.currentTarget.value })}
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
                      Subscribers receive a confirmation email (double opt-in).
                      Connecting a Form layer to Mailchimp adds a consent
                      checkbox. Add optional merge tags such as FNAME in expert
                      JSON.
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
                    Set the webhook URL to an HTTPS endpoint. The optional token
                    is sent as a Bearer credential. Payload: form, page, and
                    fields.
                  </p>
                )}
              </>
            )}
          <button
            type="button"
            class="button danger"
            onClick={() => {
              if (connected) {
                setError(
                  "Disconnect forms from this API before removing it.",
                );
                return;
              }
              onRemove();
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
                setDraft(
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
                  if (onChange(parsed) === false) return;
                  setDraft(null);
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
                setDraft(null);
                setError("");
              }}
            >
              Discard API JSON
            </button>
          </div>
        </details>
        {error && <p class="form-error" role="alert">{error}</p>}
      </div>
    </details>
  );
}

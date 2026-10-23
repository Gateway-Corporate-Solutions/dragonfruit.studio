import { useState } from "preact/hooks";
export default function ActionButton(
  { endpoint, label, primary = false }: {
    endpoint: string;
    label: string;
    primary?: boolean;
  },
) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <span class="action">
      <button
        type="button"
        class={"button " + (primary ? "primary" : "small")}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Idempotency-Key": crypto.randomUUID() },
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Request failed");
            location.reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Request failed");
            setPending(false);
          }
        }}
      >
        {pending ? "Working…" : label}
      </button>
      {error && <small class="form-error" role="alert">{error}</small>}
    </span>
  );
}

import { useEffect, useState } from "preact/hooks";
import ThemeToggle from "@/islands/ThemeToggle.tsx";
export default function VerifyEmail() {
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get("token") ??
      "";
    setToken(value);
    history.replaceState(null, "", location.pathname);
    if (!/^[a-f0-9]{64}$/.test(value)) {
      setError("This sign-in link is missing or invalid. Request a new link.");
    }
  }, []);
  return (
    <main class="verify-page">
      <a class="public-brand" href="/">
        dragonfruit<span class="studio-label">STUDIO</span>
      </a>
      <div class="verify-theme">
        <ThemeToggle />
      </div>
      <section class="verify-card">
        <span class="auth-mark" aria-hidden="true">✳</span>
        <p class="public-eyebrow">ONE LAST STEP</p>
        <h1>Your ideas are waiting.</h1>
        <p>
          Confirm that you want to sign in to dragonfruit in this browser. Your
          email link can only be used once.
        </p>
        <button
          type="button"
          class="button primary"
          disabled={!token || busy || !!error}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch("/auth/email/complete", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token }),
                }),
                data = await r.json();
              if (!r.ok) throw Error(data.error ?? "Could not sign in");
              location.assign("/websites");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not sign in");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Signing in…" : "Continue to dragonfruit →"}
        </button>
        {error && <p class="form-error" role="alert">{error}</p>}
        <a href="/?auth=login">Request a new sign-in link</a>
        <noscript>Enable JavaScript to confirm this sign-in link.</noscript>
      </section>
    </main>
  );
}

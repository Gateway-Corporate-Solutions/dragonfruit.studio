import { useState } from "preact/hooks";
export default function NewProject() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  return (
    <form
      class="panel new-site-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setPending(true);
        const data = new FormData(event.currentTarget);
        try {
          const response = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: data.get("name") }),
          });
          const result = await response.json();
          if (!response.ok) {
            if (result.code === "WEBSITE_LIMIT") setUpgrade(true);
            throw new Error(
              result.issues?.join(" · ") ?? result.error,
            );
          }
          location.assign("/projects/" + result.project.id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not create website");
          setPending(false);
        }
      }}
    >
      <div class="new-site-illustration">
        <span>✳</span>
        <div>
          <i />
          <i />
          <i />
        </div>
      </div>
      <h2>What are you making?</h2>
      <p class="muted">
        Give your website a name. We’ll take you straight to the editor.
      </p>
      <label>
        Website name<input
          name="name"
          placeholder="Your next great idea"
          required
          maxLength={80}
          autoFocus
        />
      </label>
      {error && <p class="form-error" role="alert">{error}</p>}
      {upgrade && (
        <a class="button" href="/billing">View website slots and plans →</a>
      )}
      <button type="submit" class="button primary" disabled={pending}>
        {pending ? "Creating your website…" : "Start building →"}
      </button>
      <p class="new-site-footnote">
        A ready-to-edit page. Sensible defaults. Every detail within reach.
      </p>
    </form>
  );
}

import { useState } from "preact/hooks";

export default function PermanentWebsites({ projects, capacity }: {
  projects: { id: string; name: string; permanent?: boolean }[];
  capacity: number;
}) {
  const [selected, setSelected] = useState(
    projects.filter((project) => project.permanent).map((project) =>
      project.id
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section class="panel" id="permanent-access">
      <h2>Permanent website access</h2>
      <p>
        Choose up to {capacity} {capacity === 1 ? "website" : "websites"}{" "}
        covered by your free and purchased slots. Other websites lock when
        Unlimited ends; their data is retained.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/projects/permanent", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: selected }),
            });
            const result = await response.json();
            if (!response.ok) {
              throw new Error(
                result.error || "Could not save permanent website access",
              );
            }
            location.reload();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Could not save selection",
            );
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>
            {selected.length} / {capacity} permanent slots selected
          </legend>
          {projects.map((project) => (
            <label class="inline-check" key={project.id}>
              <input
                type="checkbox"
                checked={selected.includes(project.id)}
                disabled={!selected.includes(project.id) &&
                  selected.length >= capacity}
                onChange={(event) =>
                  setSelected(
                    event.currentTarget.checked
                      ? [...selected, project.id]
                      : selected.filter((id) =>
                        id !== project.id
                      ),
                  )}
              />
              {project.name}
            </label>
          ))}
          <button type="submit" class="button primary">
            {busy ? "Saving…" : "Save permanent selection"}
          </button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}

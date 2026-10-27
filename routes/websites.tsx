import { getServices } from "@/src/services.ts";
import { define } from "@/utils.ts";
import PermanentWebsites from "@/islands/PermanentWebsites.tsx";
export default define.page(async function Projects(ctx) {
  const projects = await ctx.state.store.listProjects();
  const capacity = ctx.state.user
    ? await getServices().billing.summary(ctx.state.user.id)
    : undefined;
  return (
    <>
      <div class="page-heading">
        <div>
          <p class="eyebrow">YOUR WEBSITES</p>
          <h1>Your websites</h1>
          <p>Start with an idea. Make it your own.</p>
        </div>
        <a class="button primary" href="/projects/new">+ New website</a>
      </div>
      {capacity && (
        <p class="notice">
          {capacity.used} / {capacity.limit ?? "Unlimited"}{" "}
          website slots in use · <a href="/billing">Plans & billing</a>{" "}
          · Access outside permanent capacity requires active Unlimited.
        </p>
      )}
      <section class="hero">
        <div>
          <span class="badge light">YOUR IDEAS, BROUGHT TO LIFE</span>
          <h2>
            Good ideas need<br />a place to grow.
          </h2>
          <p>
            Your next website starts with a name.<br class="desktop" />{" "}
            Design it visually. Make it yours. Go deeper whenever you like.
          </p>
          <a href="/projects/new">
            Create a website <span>↗</span>
          </a>
        </div>
        <img src="/dragonfruit.svg" alt="Dragonfruit" />
      </section>
      {capacity && projects.length > 0 && (
        <PermanentWebsites
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
            permanent: project.permanent,
          }))}
          capacity={1 + capacity.purchasedSlots}
        />
      )}
      <div class="metrics">
        <div>
          <span>Websites</span>
          <strong>{projects.length}</strong>
        </div>
        <div>
          <span>Accessible saved designs</span>
          <strong>{projects.filter((p) => p.document !== null).length}</strong>
        </div>
        <div>
          <span>Your editor</span>
          <strong class="text-metric">Visual + CSS</strong>
        </div>
      </div>
      <div class="section-heading">
        <h2>
          Your websites <span class="count">{projects.length}</span>
        </h2>
        <span class="muted">Built with Fresh</span>
      </div>
      {projects.length
        ? (
          <div class="project-grid">
            {projects.map((p) => (
              <a
                class="project-card"
                href={p.locked ? "#permanent-access" : "/projects/" + p.id}
                key={p.id}
              >
                <div class="project-icon">
                  F<span>↗</span>
                </div>
                <h3>{p.name}</h3>
                <p>
                  {p.repositoryUrl?.replace("https://", "") ??
                    (p.locked
                      ? "Locked · Your website data is retained"
                      : "Your website · Open editor")}
                </p>
                <div>
                  <span class="badge">Fresh 2</span>
                  <span class="muted">
                    {p.locked ? "Choose a permanent slot ↑" : "Open editor →"}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )
        : (
          <section class="empty">
            <span class="empty-icon">⌘</span>
            <h3>Your next website starts here</h3>
            <p>
              Name your website and step straight into the visual editor.
            </p>
            <a class="button" href="/projects/new">Create a website</a>
          </section>
        )}
      <div class="foundation-note">
        <span>↳</span>
        <p>
          <strong>
            Simple by default. Expert configuration always available.
          </strong>{" "}
          Design with visual controls. Open element CSS whenever you need more
          control. Build settings stay in Settings, ready when you are.
        </p>
      </div>
    </>
  );
});

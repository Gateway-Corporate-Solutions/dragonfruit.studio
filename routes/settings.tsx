import { define } from "@/utils.ts";
export default define.page(function Settings(ctx) {
  return (
    <>
      <div class="page-heading">
        <div>
          <p class="eyebrow">PLATFORM FOUNDATION</p>
          <h1>Platform</h1>
          <p>What is connected, and what comes next.</p>
        </div>
      </div>
      <div class="detail-grid">
        <section class="panel">
          <h2>Control plane</h2>
          <dl>
            <dt>Metadata storage</dt>
            <dd>
              {ctx.state.store.durable
                ? "PostgreSQL · durable"
                : "Memory · ephemeral demo"}
            </dd>
            <dt>Access</dt>
            <dd>
              {ctx.state.config.devMode
                ? "Loopback development only"
                : "Single operator token"}
            </dd>
            <dt>Worker</dt>
            <dd>
              {ctx.state.store.durable
                ? "Separate process required"
                : "Embedded demo runner"}
            </dd>
            <dt>Implemented job</dt>
            <dd>Configuration validation</dd>
          </dl>
        </section>
        <section class="panel">
          <h2>Integration roadmap</h2>
          <p class="muted">
            These are planned adapter boundaries. No provider is connected.
          </p>
          <dl>
            <dt>Identity</dt>
            <dd>GitHub · Email</dd>
            <dt>Source control</dt>
            <dd>GitHub · GitLab · Bitbucket</dd>
            <dt>Runtime</dt>
            <dd>Docker via host agent</dd>
            <dt>Infrastructure</dt>
            <dd>DigitalOcean · AWS · Hetzner</dd>
          </dl>
        </section>
      </div>
      <section class="panel">
        <h2>Next milestone</h2>
        <p class="muted">
          Freeze an immutable repository revision, execute an isolated build,
          retain its artifact, and start a verified candidate behind HTTPS
          ingress. See docs/roadmap.md for the full acceptance gates.
        </p>
      </section>
    </>
  );
});

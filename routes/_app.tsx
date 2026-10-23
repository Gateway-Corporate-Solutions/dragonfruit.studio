import ThemeToggle from "@/islands/ThemeToggle.tsx";
import { themeBootstrap } from "@/src/http/theme.ts";
import { define } from "@/utils.ts";
export default define.page(function App({ Component, state, url }) {
  const active = url.pathname;
  const publicPage = active === "/" || active.startsWith("/auth/");
  const editor = /^\/projects\/[0-9a-f-]{36}$/i.test(active);
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#111513" />
        <title>dragonfruit · Website builder</title>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        {editor || publicPage ? <Component /> : (
          <>
            <aside class="sidebar">
              <a class="brand" href="/websites">
                <span class="brand-mark">
                  d<span>●</span>
                </span>dragonfruit
              </a>
              <p class="nav-label">YOUR WORKSPACE</p>
              <nav aria-label="Main navigation">
                <a
                  class={active === "/websites" ||
                      active.startsWith("/projects")
                    ? "selected"
                    : ""}
                  href="/websites"
                >
                  <span>▦</span>Websites
                </a>
                <details
                  class="developer-nav"
                  open={active === "/jobs" || active === "/settings"}
                >
                  <summary>Developer tools</summary>
                  <a class={active === "/jobs" ? "selected" : ""} href="/jobs">
                    <span>≋</span>Validation jobs
                  </a>
                  {state.operator && (
                    <a
                      class={active === "/settings" ? "selected" : ""}
                      href="/settings"
                    >
                      <span>⚙</span>Platform
                    </a>
                  )}
                </details>
              </nav>
              <div class="sidebar-bottom">
                <span class="status-dot" />
                {state.user
                  ? "Your creative workspace"
                  : "Single-host foundation"}
                <small>
                  {state.user
                    ? "Make room for your next idea"
                    : "Boilerplate · v0.1.0"}
                </small>
              </div>
            </aside>
            <div class="workspace">
              <header class="topbar">
                <span>
                  Workspace <span class="slash">/</span>{" "}
                  <strong>{state.user?.name ?? "Personal"}</strong>
                </span>
                <div class="topbar-controls">
                  <ThemeToggle />
                  {state.user && (
                    <div class="workspace-account">
                      <a href="/">Studio homepage</a>
                      <form method="post" action="/auth/logout">
                        <button type="submit">Sign out</button>
                      </form>
                    </div>
                  )}
                  <span class="badge">
                    {state.config.devMode
                      ? "Local development"
                      : state.user
                      ? "Signed in"
                      : "Operator access"}
                  </span>
                </div>
              </header>
              {!state.store.durable && (
                <div class="notice">
                  Demo mode · Projects and jobs live in memory and reset when
                  the server restarts.
                </div>
              )}
              <main id="main">
                <Component />
              </main>
              <footer>
                dragonfruit <span>Built with Deno + Fresh</span>
              </footer>
            </div>
          </>
        )}
      </body>
    </html>
  );
});

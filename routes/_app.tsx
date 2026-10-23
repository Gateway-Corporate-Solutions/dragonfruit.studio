import ThemeToggle from "@/islands/ThemeToggle.tsx";
import { themeBootstrap } from "@/src/http/theme.ts";
import { define } from "@/utils.ts";
export default define.page(function App({ Component, state, url }) {
  const active = url.pathname;
  const publicPage = active === "/" || active.startsWith("/auth/");
  const origin = state.config.publicOrigin || url.origin;
  const description =
    "Build expressive websites with dragonfruit. Design pages, publish Markdown articles, and connect your shop, checkout, and bookings.";
  const image = new URL("/social/home.png", origin).href;
  const editor = /^\/projects\/[0-9a-f-]{36}$/i.test(active);
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#111513" />
        <title>dragonfruit · Website builder</title>
        <meta name="description" content={description} />
        <meta
          name="robots"
          content={active === "/" ? "index,follow" : "noindex,nofollow"}
        />
        <link rel="canonical" href={new URL(active, origin).href} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="dragonfruit" />
        <meta property="og:title" content="dragonfruit · Website builder" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={new URL(active, origin).href} />
        <meta property="og:image" content={image} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="dragonfruit · Make room for your next idea"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="dragonfruit · Website builder" />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
        <meta
          name="twitter:image:alt"
          content="dragonfruit · Make room for your next idea"
        />
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

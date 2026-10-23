import { useEffect, useRef, useState } from "preact/hooks";
import ThemeToggle from "@/islands/ThemeToggle.tsx";
type Intent = "signup" | "login";
const errors: Record<string, string> = {
  github_state:
    "That GitHub sign-in expired or could not be verified. Please try again.",
  github_email: "GitHub sign-in needs a verified primary email address.",
  github_failed: "GitHub sign-in could not be completed. Please try again.",
  account_missing: "No account exists yet. Choose Sign up to get started.",
};
export default function PublicHome(
  { user, demo, github, email }: {
    user?: { name: string };
    demo: boolean;
    github: boolean;
    email: boolean;
  },
) {
  const dialog = useRef<HTMLDialogElement>(null),
    [intent, setIntent] = useState<Intent>("signup"),
    [address, setAddress] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const open = (mode: Intent) => {
    setIntent(mode);
    setError("");
    setSent(false);
    dialog.current?.showModal();
  };
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("auth") === "login" || q.has("auth_error")) {
      open("login");
      setError(errors[q.get("auth_error") ?? ""] ?? "");
    }
  }, []);
  async function start(provider: "email" | "github") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/" + provider + "/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent, email: address }),
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Could not start sign-in");
      if (provider === "github") location.assign(data.url);
      else setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start sign-in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="public-home">
      <header class="public-nav">
        <a class="public-brand" href="/" aria-label="dragonfruit home">
          <span class="brand-mark">
            d<span>●</span>
          </span>dragonfruit<span class="studio-label">STUDIO</span>
        </a>
        <nav aria-label="Website navigation">
          <a href="#possibilities">What you can make</a>
          <a href="#your-way">Your way of working</a>
        </nav>
        <div class="public-nav-actions">
          <ThemeToggle />
          {user
            ? <a class="button primary" href="/websites">Open workspace ↗</a>
            : (
              <>
                <button
                  class="public-login"
                  type="button"
                  onClick={() => open("login")}
                >
                  Log in
                </button>
                <button
                  class="button primary"
                  type="button"
                  onClick={() => open("signup")}
                >
                  Get started ↗
                </button>
              </>
            )}
        </div>
      </header>
      <main>
        <section class="public-hero">
          <div class="public-hero-copy">
            <p class="public-eyebrow">
              <span />A LITTLE IDEA. A BIG POSSIBILITY.
            </p>
            <h1>
              Your next idea<br />deserves a<br />
              <em>place to grow.</em>
            </h1>
            <p class="public-intro">
              Build a website that feels like you. Start with a name, make it
              yours visually, and go deeper whenever inspiration calls.
            </p>
            <div class="public-hero-actions">
              {user
                ? (
                  <a class="button primary" href="/websites">
                    Back to your websites ↗
                  </a>
                )
                : (
                  <button
                    type="button"
                    class="button primary"
                    onClick={() => open("signup")}
                  >
                    Start building ↗
                  </button>
                )}
              <a class="public-text-link" href="#your-way">
                See how it works <span>↓</span>
              </a>
            </div>
            <p class="public-footnote">
              Simple by default. Expert configuration always available.
            </p>
          </div>
          <div class="public-hero-art">
            <div class="fruit-orbit" />
            <span class="art-label art-label-top">
              A fresh start, every time.
            </span>
            <img
              src="/dragonfruit.svg"
              alt="A bright pink dragonfruit with green leaves and a seed-speckled center"
            />
            <span class="art-label art-label-bottom">
              <span>✳</span> MADE TO BE YOURS
            </span>
          </div>
        </section>
        <section class="public-proof" aria-label="Creative tools">
          <span>VISUAL BY DEFAULT</span>
          <span>CSS WHEN YOU NEED IT</span>
          <span>FORMS THAT CONNECT</span>
          <span>YOUR SOURCE TO KEEP</span>
        </section>
        <section class="public-features" id="possibilities">
          <div class="public-section-heading">
            <p class="public-eyebrow">FROM FIRST THOUGHT TO FIRST PAGE</p>
            <h2>
              Room for whatever<br />you have in mind.
            </h2>
            <p>
              A home for your work, a new business, or the idea you have been
              meaning to start.
            </p>
          </div>
          <div class="public-feature-grid">
            <article>
              <span class="feature-symbol">▧</span>
              <h3>Make it feel like you.</h3>
              <p>
                Choose familiar page templates. Shape layouts, colors,
                typography, images, and interactive layers with visual controls.
              </p>
              <span class="feature-detail">
                ABOUT · PORTFOLIO · CONTACT · MORE
              </span>
            </article>
            <article>
              <span class="feature-symbol">↗</span>
              <h3>Give ideas somewhere to go.</h3>
              <p>
                Connect your forms to email, newsletters, and the services you
                already use. Guided setup keeps the first steps clear.
              </p>
              <span class="feature-detail">RESEND · MAILCHIMP · WEBHOOKS</span>
            </article>
            <article>
              <span class="feature-symbol">{"{}"}</span>
              <h3>Keep the keys.</h3>
              <p>
                Open CSS, JavaScript, and API configuration when you need more
                control. Export a runnable Fresh or React project.
              </p>
              <span class="feature-detail">
                OPEN CONFIGURATION · COMPLETE SOURCE
              </span>
            </article>
          </div>
        </section>
        <section class="public-workflow" id="your-way">
          <div>
            <p class="public-eyebrow">A SMALL START. AN OPEN CANVAS.</p>
            <h2>
              Start simply.<br />Grow your own way.
            </h2>
            <p>
              Good tools make space for both your first draft and your next big
              idea.
            </p>
            {!user && (
              <button
                type="button"
                class="button primary"
                onClick={() => open("signup")}
              >
                Make something yours ↗
              </button>
            )}
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Give your website a name.</h3>
                <p>No repository or configuration required to begin.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Go straight to the editor.</h3>
                <p>Pick pages, add layers, and make every detail yours.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Take it wherever you want.</h3>
                <p>
                  Save your draft and export your complete project. Built-in
                  publishing is coming next.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section class="public-final">
          <p class="public-eyebrow">IT DOESN'T NEED TO BE PERFECT TO BEGIN.</p>
          <h2>
            Something good<br />starts with an idea.
          </h2>
          {user
            ? <a class="button primary" href="/websites">Open workspace ↗</a>
            : (
              <button
                class="button primary"
                type="button"
                onClick={() => open("signup")}
              >
                Let's build it ↗
              </button>
            )}
          {demo && (
            <a class="public-demo" href="/websites">Explore the local demo</a>
          )}
        </section>
      </main>
      <footer class="public-footer">
        <a class="public-brand" href="/">
          dragonfruit<span class="studio-label">STUDIO</span>
        </a>
        <span>Made with Deno + Fresh. Made for your next idea.</span>
        <a href="#your-way">Simple by default. Open by design.</a>
      </footer>
      <dialog
        ref={dialog}
        class="auth-dialog"
        aria-labelledby="auth-title"
        onCancel={() => {
          if (!busy) dialog.current?.close();
        }}
      >
        <button
          type="button"
          class="auth-close"
          aria-label="Close sign-in"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        <span class="auth-mark" aria-hidden="true">✳</span>
        <p class="public-eyebrow">YOUR NEXT CHAPTER</p>
        <h2 id="auth-title">
          {sent
            ? "Check your inbox."
            : intent === "signup"
            ? "Make room for your ideas."
            : "Welcome back."}
        </h2>
        {sent
          ? (
            <>
              <p class="auth-description">
                We sent a one-use link to{" "}
                <strong>{address}</strong>. Open it in this browser, then choose
                Continue. Your link expires in ten minutes.
              </p>
              <p class="auth-description">
                The email comes from info@dragonfruit.studio. Check spam if it
                does not arrive.
              </p>
              <button
                type="button"
                class="button"
                onClick={() => setSent(false)}
              >
                Use another email
              </button>
            </>
          )
          : (
            <>
              <p class="auth-description">
                {intent === "signup"
                  ? "Create your account and start making something yours."
                  : "Sign in to pick up where you left off."}
              </p>
              <div class="auth-tabs" role="group" aria-label="Account action">
                <button
                  type="button"
                  aria-pressed={intent === "signup"}
                  class={intent === "signup" ? "active" : ""}
                  disabled={busy}
                  onClick={() => {
                    setIntent("signup");
                    setError("");
                  }}
                >
                  Sign up
                </button>
                <button
                  type="button"
                  aria-pressed={intent === "login"}
                  class={intent === "login" ? "active" : ""}
                  disabled={busy}
                  onClick={() => {
                    setIntent("login");
                    setError("");
                  }}
                >
                  Log in
                </button>
              </div>
              <button
                type="button"
                class="auth-github"
                disabled={busy || !github}
                onClick={() => start("github")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.58 9.58 0 0 1 12 6.98c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.59c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
                </svg>Continue with GitHub
              </button>
              {!github && (
                <p class="auth-provider-note">
                  GitHub sign-in is not configured yet.
                </p>
              )}
              <div class="auth-divider">
                <span />or use your email<span />
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  start("email");
                }}
              >
                <label>
                  Email address<input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={address}
                    placeholder="you@example.com"
                    disabled={busy || !email}
                    onInput={(e) => setAddress(e.currentTarget.value)}
                  />
                </label>
                <button
                  type="submit"
                  class="button primary auth-email"
                  disabled={busy || !email}
                >
                  {busy
                    ? "One moment…"
                    : intent === "signup"
                    ? "Send signup link →"
                    : "Send login link →"}
                </button>
              </form>
              {!email && (
                <p class="auth-provider-note">
                  Email sign-in is not configured yet.
                </p>
              )}
              <p class="auth-small">
                No password to remember. Your sign-in link works once.
              </p>
            </>
          )}
        {error && <p class="form-error auth-error" role="alert">{error}</p>}
      </dialog>
    </div>
  );
}

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
          <a href="/pricing">Pricing</a>
          <a href="#possibilities">Client delivery</a>
          <a href="#your-way">Ownership & limits</a>
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
              <span />BUILD FOR CLIENTS. DELIVER THE SOURCE.
            </p>
            <h1>
              dragonfruit<br />
              <em>Website builder.</em>
            </h1>
            <p class="public-intro">
              Design client websites visually. Deliver a complete Fresh or React
              project your client can run, edit, and host without dragonfruit.
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
                    Build your first site free ↗
                  </button>
                )}
              <a class="public-text-link" href="#your-way">
                See the handoff <span>↓</span>
              </a>
            </div>
            <p class="public-footnote">
              One free website. Unlimited source exports. Hosting not included.
            </p>
          </div>
          <div class="public-hero-art">
            <div class="fruit-orbit" />
            <span class="art-label art-label-top">
              Your work. Your source.
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
          <span>FREE SOURCE EXPORTS</span>
          <span>FRESH OR REACT</span>
          <span>CLIENT-READY HANDOFF</span>
          <span>NO DRAGONFRUIT RUNTIME REQUIRED</span>
        </section>
        <section class="public-features" id="possibilities">
          <div class="public-section-heading">
            <p class="public-eyebrow">FROM CLIENT BRIEF TO SOURCE HANDOFF</p>
            <h2>
              Build the site.<br />Deliver the whole project.
            </h2>
            <p>
              For freelancers and studios who want to hand over working source,
              not make every client depend on a builder subscription.
            </p>
          </div>
          <div class="public-feature-grid">
            <article>
              <span class="feature-symbol">▧</span>
              <h3>Design for the client.</h3>
              <p>
                Start from page templates, then shape layouts, typography,
                images, and interactions. Use CSS and JavaScript when the brief
                needs more control.
              </p>
              <span class="feature-detail">
                ABOUT · PORTFOLIO · CONTACT · MORE
              </span>
            </article>
            <article>
              <span class="feature-symbol">↗</span>
              <h3>Hand over runnable source.</h3>
              <p>
                Download a Fresh or React project with pages, assets, and the
                generated backend for connected forms and bookings. Include it
                in your client delivery or continue development outside the
                editor.
              </p>
              <span class="feature-detail">RESEND · MAILCHIMP · WEBHOOKS</span>
            </article>
            <article>
              <span class="feature-symbol">{"{}"}</span>
              <h3>Let the client choose hosting.</h3>
              <p>
                The exported project runs independently of dragonfruit. Deploy
                it to compatible hosting under your client's account. Domains,
                hosting, and third-party service charges are separate.
              </p>
              <span class="feature-detail">
                OPEN CONFIGURATION · COMPLETE SOURCE
              </span>
            </article>
          </div>
        </section>
        <section class="public-workflow" id="your-way">
          <div>
            <p class="public-eyebrow">
              OWNERSHIP WITHOUT THE FINE-PRINT SURPRISE
            </p>
            <h2>
              Keep the source.<br />Know the limits.
            </h2>
            <p>
              Plans pay for website capacity in your workspace, not permission
              to download your work. Source exports are free on every plan.
            </p>
            {!user && (
              <button
                type="button"
                class="button primary"
                onClick={() => open("signup")}
              >
                Start with one free website ↗
              </button>
            )}
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>One website free. No export limit.</h3>
                <p>
                  The free plan includes one website, all editor features, and
                  unlimited Fresh or React source exports. No trial expiry.
                  Additional permanent slots cost $9.99 each, or create
                  unlimited websites for $24.99/month. Prices are in USD.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Export is delivery, not hosting.</h3>
                <p>
                  Export downloads a project; it does not put a website online.
                  Hosting, domains, and paid integrations are not included.
                  Connected forms, bookings, and checkout need the exported
                  backend and your own service credentials.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Cancel without losing your work.</h3>
                <p>
                  Cancel the monthly plan through Stripe. Unlimited creation
                  continues until the paid period ends. Afterward, new websites
                  need available free or purchased capacity; existing websites
                  stay editable and exportable. Exported client sites do not
                  depend on your subscription.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section class="public-final">
          <p class="public-eyebrow">YOUR NEXT CLIENT PROJECT</p>
          <h2>
            Build it here.<br />Hand it over.
          </h2>
          {user
            ? <a class="button primary" href="/websites">Open workspace ↗</a>
            : (
              <button
                class="button primary"
                type="button"
                onClick={() => open("signup")}
              >
                Start free. Export freely. ↗
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
        <span>Visual editing. Independent source. Client-ready delivery.</span>
        <a href="/pricing">Plans & pricing · Start free</a>
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

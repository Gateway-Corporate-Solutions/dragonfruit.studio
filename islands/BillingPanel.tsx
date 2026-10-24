import { useEffect, useState } from "preact/hooks";
import type { BillingSummary, PurchaseKind } from "@/src/billing/model.ts";
export default function BillingPanel(
  { initial, enabled, signedIn = true }: {
    initial?: BillingSummary;
    enabled: boolean;
    signedIn?: boolean;
  },
) {
  const [summary, setSummary] = useState(initial),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const refresh = async (sessionId?: string) => {
    const response = await fetch("/api/billing/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setSummary(result.summary);
    return result as { summary: BillingSummary; confirmed?: boolean };
  };
  useEffect(() => {
    if (!signedIn || !enabled) return;
    let stopped = false,
      timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const query = new URLSearchParams(location.search),
      sessionId = query.get("session_id") ?? undefined;
    if (query.get("checkout") === "cancelled") {
      setMessage(
        "Checkout cancelled. No additional website capacity was added.",
      );
    }
    let attempts = 0;
    const sync = async () => {
      try {
        const result = await refresh(sessionId);
        if (stopped) return;
        const confirmed = result.confirmed === true;
        if (query.get("checkout") === "success") {
          setMessage(
            confirmed
              ? "Payment confirmed. Your website capacity is ready."
              : "Your payment is being verified. Capacity is added only after payment confirmation.",
          );
          if (!confirmed && ++attempts < 8) {
            timer = globalThis.setTimeout(sync, 3000);
          }
        }
      } catch (e) {
        if (!stopped) {
          setError(
            e instanceof Error ? e.message : "Could not refresh billing",
          );
        }
      }
    };
    if (initial?.hasCustomer || sessionId) sync();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  const action = async (kind: PurchaseKind | "portal") => {
    setBusy(kind);
    setError("");
    try {
      const response = await fetch(
        "/api/billing/" + (kind === "portal" ? "portal" : "checkout"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing");
      setBusy("");
    }
  };
  return (
    <section class="billing-panel">
      {summary && (
        <div class="panel billing-summary">
          <h2>
            {summary.unlimited ? "Unlimited websites" : "Your website capacity"}
          </h2>
          <p>
            <strong>{summary.used}</strong> websites · {summary.limit === null
              ? "Unlimited capacity"
              : `${summary.limit} total website ${
                summary.limit === 1 ? "slot" : "slots"
              }`} · {summary.purchasedSlots} purchased{" "}
            {summary.purchasedSlots === 1 ? "slot" : "slots"}
          </p>
          <p>
            Your first website is free forever. Editing and exports are always
            included.
          </p>
          {summary.subscriptionStatus && (
            <p>
              Subscription: {summary.subscriptionStatus}
              {summary.periodEnd
                ? ` · ${
                  summary.cancelAtPeriodEnd
                    ? "Access ends"
                    : "Current period ends"
                } ${new Date(summary.periodEnd * 1000).toLocaleDateString()}`
                : ""}
            </p>
          )}
          {summary.hasCustomer && (
            <div class="settings-buttons">
              <button
                class="button"
                type="button"
                disabled={!enabled || !!busy}
                onClick={() => action("portal")}
              >
                Manage subscription & payments
              </button>
              <button
                class="button"
                type="button"
                disabled={!enabled || !!busy}
                onClick={async () => {
                  setBusy("refresh");
                  setError("");
                  try {
                    await refresh();
                    setMessage("Billing status refreshed.");
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not refresh billing",
                    );
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Refresh status
              </button>
            </div>
          )}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" class="form-error">{error}</p>}
      <div class="billing-plans">
        <article class="panel">
          <span class="badge">Free forever</span>
          <h2>One website</h2>
          <p class="billing-price">$0</p>
          <p>
            Create and edit one website. Export the complete source whenever you
            like.
          </p>
          <ul>
            <li>No trial or expiry</li>
            <li>Unlimited exports</li>
            <li>All editor features</li>
          </ul>
          <a
            class="button"
            href={signedIn
              ? (summary?.used ? "/websites" : "/projects/new")
              : "/?auth=signup"}
          >
            {signedIn ? "Open your workspace" : "Start free"}
          </a>
        </article>
        <article class="panel">
          <span class="badge">One-off purchase</span>
          <h2>Another website</h2>
          <p class="billing-price">
            $9.99 <small>once</small>
          </p>
          <p>
            Add one permanent website slot to your account. Buy more whenever
            you need them.
          </p>
          <ul>
            <li>One additional website per purchase</li>
            <li>No recurring payment</li>
            <li>Editing and exports included forever</li>
          </ul>
          {signedIn
            ? (
              <button
                type="button"
                class="button primary"
                disabled={!enabled || !!busy}
                onClick={() => action("slot")}
              >
                {busy === "slot"
                  ? "Opening Stripe…"
                  : "Buy a website slot · $9.99"}
              </button>
            )
            : (
              <a class="button primary" href="/?auth=signup">
                Create an account
              </a>
            )}
        </article>
        <article class="panel">
          <span class="badge">Monthly subscription</span>
          <h2>Unlimited websites</h2>
          <p class="billing-price">
            $24.99 <small>/ month</small>
          </p>
          <p>
            Create as many websites as you need while your subscription is
            active.
          </p>
          <ul>
            <li>Unlimited website capacity</li>
            <li>Cancel through Stripe at any time</li>
            <li>Existing sites stay editable and exportable</li>
          </ul>
          {signedIn
            ? (
              <button
                type="button"
                class="button primary"
                disabled={!enabled || !!busy || summary?.unlimited}
                onClick={() => action("unlimited")}
              >
                {summary?.unlimited
                  ? "Unlimited is active"
                  : busy === "unlimited"
                  ? "Opening Stripe…"
                  : "Subscribe · $24.99/month"}
              </button>
            )
            : (
              <a class="button primary" href="/?auth=signup">
                Create an account
              </a>
            )}
        </article>
      </div>
      {signedIn && !enabled && (
        <p class="notice">
          Payments are not enabled on this installation yet. Your free website,
          editing, and exports remain available.
        </p>
      )}
      <p class="billing-policy">
        After a subscription ends, new websites require available free or
        purchased slots. Your existing websites are retained with editing and
        export access. Prices are in USD.
      </p>
    </section>
  );
}

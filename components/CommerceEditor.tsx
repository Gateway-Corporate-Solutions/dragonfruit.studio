import { useEffect, useState } from "preact/hooks";
import {
  type CommerceConfig,
  defaultCommerce,
  parseCommerce,
} from "@/src/domain/commerce.ts";
import type { WebsiteDocument } from "@/src/domain/website.ts";
export default function CommerceEditor(
  { website, onChange, onPending }: {
    onPending: (pending: boolean) => void;
    website: WebsiteDocument;
    onChange: (site: WebsiteDocument) => void;
  },
) {
  const c = website.commerce ?? defaultCommerce();
  const [draft, setDraft] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    onPending(draft !== null);
    return () => onPending(false);
  }, [draft]);
  const apply = (next: CommerceConfig) => {
    try {
      onChange({ ...website, commerce: parseCommerce(next) });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid commerce settings");
    }
  };
  return (
    <section class="panel">
      <fieldset disabled={draft !== null}>
        <h2>Commerce API</h2>
        <p>
          One catalog powers Shop, Product, Cart, and Checkout layers. Calendar
          and Schedule layers show your upcoming sessions and link to your
          booking provider.
        </p>
        <label>
          Checkout provider<select
            value={c.provider}
            onChange={(e) =>
              apply({
                ...c,
                provider: e.currentTarget.value as CommerceConfig["provider"],
              })}
          >
            <option value="preview">Preview · no payment collected</option>
            <option value="stripe">Stripe hosted checkout</option>
          </select>
        </label>
        <label>
          Currency<select
            value={c.currency}
            onChange={(e) =>
              apply({
                ...c,
                currency: e.currentTarget.value as CommerceConfig["currency"],
              })}
          >
            {["usd", "eur", "gbp"].map((v) => (
              <option key={v} value={v}>{v.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <p class="inspector-help">
          For Stripe, set STRIPE_SECRET_KEY and PUBLIC_ORIGIN in the exported
          server's .env file. Card details stay on Stripe. Fulfill orders only
          after verifying payment with Stripe; the return URL alone is not proof
          of payment.
        </p>
        <h3>Products</h3>
        {c.products.map((p, i) => (
          <fieldset class="option-card" key={p.id}>
            <legend>{p.name}</legend>
            <code>{p.id}</code>
            <label>
              Name<input
                value={p.name}
                maxLength={200}
                onChange={(e) =>
                  apply({
                    ...c,
                    products: c.products.map((v, j) =>
                      j === i ? { ...v, name: e.currentTarget.value } : v
                    ),
                  })}
              />
            </label>
            <label>
              Description<textarea
                value={p.description}
                maxLength={3000}
                onChange={(e) =>
                  apply({
                    ...c,
                    products: c.products.map((v, j) =>
                      j === i ? { ...v, description: e.currentTarget.value } : v
                    ),
                  })}
              />
            </label>
            <label>
              Price in minor units (100 = 1.00)<input
                type="number"
                min={50}
                max={99999999}
                step={1}
                value={p.amount}
                onChange={(e) =>
                  apply({
                    ...c,
                    products: c.products.map((v, j) =>
                      j === i
                        ? { ...v, amount: Number(e.currentTarget.value) }
                        : v
                    ),
                  })}
              />
            </label>
            <label>
              Image URL<input
                value={p.image}
                onChange={(e) =>
                  apply({
                    ...c,
                    products: c.products.map((v, j) =>
                      j === i ? { ...v, image: e.currentTarget.value } : v
                    ),
                  })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) =>
                  apply({
                    ...c,
                    products: c.products.map((v, j) =>
                      j === i ? { ...v, active: e.currentTarget.checked } : v
                    ),
                  })}
              />{" "}
              Available
            </label>
            <button
              class="button"
              type="button"
              onClick={() =>
                apply({
                  ...c,
                  products: c.products.filter((v) => v.id !== p.id),
                })}
            >
              Remove product
            </button>
          </fieldset>
        ))}
        <button
          class="button"
          type="button"
          disabled={c.products.length >= 100}
          onClick={() =>
            apply({
              ...c,
              products: [...c.products, {
                id: "product-" + crypto.randomUUID().slice(0, 8),
                name: "New product",
                description: "Describe your product.",
                amount: 1900,
                image: "",
                active: true,
              }],
            })}
        >
          + Add product
        </button>
        <h3>Schedule</h3>
        {c.slots.map((s, i) => (
          <fieldset class="option-card" key={s.id}>
            <legend>{s.title}</legend>
            {(["title", "start", "end", "bookingUrl"] as const).map((k) => (
              <label key={k}>
                {k === "bookingUrl"
                  ? "Booking URL (HTTPS)"
                  : k === "start" || k === "end"
                  ? k + " (ISO date with timezone)"
                  : "Title"}
                <input
                  value={s[k]}
                  onChange={(e) =>
                    apply({
                      ...c,
                      slots: c.slots.map((v, j) =>
                        j === i ? { ...v, [k]: e.currentTarget.value } : v
                      ),
                    })}
                />
              </label>
            ))}
            <button
              class="button"
              type="button"
              onClick={() =>
                apply({ ...c, slots: c.slots.filter((v) => v.id !== s.id) })}
            >
              Remove session
            </button>
          </fieldset>
        ))}
        <button
          class="button"
          type="button"
          disabled={c.slots.length >= 100}
          onClick={() => {
            const start = new Date(Date.now() + 86400000);
            apply({
              ...c,
              slots: [...c.slots, {
                id: "session-" + crypto.randomUUID().slice(0, 8),
                title: "Consultation",
                start: start.toISOString(),
                end: new Date(start.getTime() + 3600000).toISOString(),
                bookingUrl: "https://calendly.com/",
              }],
            });
          }}
        >
          + Add session
        </button>
      </fieldset>
      <details>
        <summary>Expert · Commerce JSON</summary>
        <label>
          Configuration<textarea
            class="code-input"
            rows={18}
            value={draft ?? JSON.stringify(c, null, 2)}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          class="button"
          onClick={() => {
            try {
              const next = parseCommerce(
                JSON.parse(draft ?? JSON.stringify(c)),
              );
              if (next) {
                onChange({ ...website, commerce: next });
                setDraft(null);
                setError("");
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "Invalid JSON");
            }
          }}
        >
          Apply JSON
        </button>
        <button type="button" class="button" onClick={() => setDraft(null)}>
          Discard JSON
        </button>
      </details>
      <p>
        <code>GET /api/commerce/catalog</code> ·{" "}
        <code>GET /api/commerce/schedule</code> ·{" "}
        <code>POST /api/commerce/checkout</code>
      </p>
      {error && <p role="alert" class="form-error">{error}</p>}
    </section>
  );
}

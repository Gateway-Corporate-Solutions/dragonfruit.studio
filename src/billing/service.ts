import type { Config } from "../config.ts";
import type { User } from "../auth/store.ts";
import type { Store } from "../storage/store.ts";
import { sameOrigin } from "../http/security.ts";
import { type BillingState, type PurchaseKind, summarize } from "./model.ts";
interface Price {
  id: string;
  active?: boolean;
  currency: string;
  unit_amount: number;
  recurring?: { interval: string; interval_count: number } | null;
}
interface Resource {
  id: string;
  url?: string;
  customer?: string;
  metadata?: Record<string, string>;
  mode?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  payment_intent?: string;
  subscription?: string;
  expires_at?: number;
  line_items?: { data: { quantity: number; price?: Price }[] };
  items?: { data: { current_period_end?: number; price: Price }[] };
  status?: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  pause_collection?: unknown;
  amount?: number;
  amount_refunded?: number;
  refunded?: boolean;
  disputed?: boolean;
  latest_charge?: Resource | string;
  charge?: string;
  parent?: { subscription_details?: { subscription?: string } };
}
class BillingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
async function rawBody(req: Request, max: number): Promise<string> {
  if (Number(req.headers.get("content-length")) > max) {
    throw new BillingError("Request too large", 413);
  }
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new BillingError("Request too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function verifyStripeSignature(
  raw: string,
  header: string | null,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const parts = (header ?? "").split(",").map((p) => p.trim().split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  if (!t || !/^\d+$/.test(t) || Math.abs(now / 1000 - Number(t)) > 300) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(t + "." + raw);
  for (const [, hex] of parts.filter((p) => p[0] === "v1")) {
    if (!/^[a-f0-9]{64}$/i.test(hex ?? "")) continue;
    const signature = Uint8Array.from(
      hex.match(/../g)!,
      (b) => parseInt(b, 16),
    );
    if (await crypto.subtle.verify("HMAC", key, signature, data)) return true;
  }
  return false;
}
export class BillingService {
  constructor(
    private config: Config,
    private store: Store,
    private send: typeof fetch = fetch,
  ) {}
  get enabled() {
    return this.store.durable &&
      !!(this.config.publicOrigin && this.config.stripeSecretKey &&
        this.config.stripeWebhookSecret && this.config.stripeSlotPriceId &&
        this.config.stripeUnlimitedPriceId);
  }
  private async stripe<T>(
    path: string,
    params?: URLSearchParams,
    key?: string,
  ): Promise<T> {
    if (!this.config.stripeSecretKey) {
      throw new BillingError("Payments are not configured", 503);
    }
    const headers: Record<string, string> = {
      Authorization: "Bearer " + this.config.stripeSecretKey,
      "Stripe-Version": "2025-06-30.basil",
    };
    if (params) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (key) headers["Idempotency-Key"] = key;
    const response = await this.send("https://api.stripe.com/v1/" + path, {
      method: params ? "POST" : "GET",
      headers,
      body: params,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new BillingError(
        "Stripe is unavailable. Please try again shortly.",
        503,
      );
    }
    return await response.json();
  }
  private id(value: string) {
    if (!/^[a-z]+_[a-zA-Z0-9_]+$/.test(value)) {
      throw new BillingError("Invalid Stripe reference");
    }
    return encodeURIComponent(value);
  }
  private hosted(url: string | undefined, host: string) {
    if (
      !url || new URL(url).origin !== "https://" + host
    ) throw new BillingError("Stripe returned an invalid checkout URL", 503);
    return url;
  }
  async summary(owner: string) {
    return summarize(
      await this.store.billing.read(owner),
      await this.store.countProjects(owner),
    );
  }
  private validPrice(price: Price | undefined, kind: PurchaseKind) {
    return !!price &&
      price.id ===
        (kind === "slot"
          ? this.config.stripeSlotPriceId
          : this.config.stripeUnlimitedPriceId) &&
      price.currency === "usd" &&
      price.unit_amount === (kind === "slot" ? 999 : 2499) &&
      (kind === "slot"
        ? !price.recurring
        : price.recurring?.interval === "month" &&
          price.recurring.interval_count === 1);
  }
  private async subscription(state: BillingState, id: string) {
    const s = await this.stripe<Resource>("subscriptions/" + this.id(id));
    if (s.customer !== state.customerId) return;
    const known = !!state.subscriptions?.[id];
    if (s.metadata?.app !== "dragonfruit" && !known) return;
    if (
      s.metadata?.app !== "dragonfruit" || s.items?.data.length !== 1 ||
      !this.validPrice(s.items.data[0].price, "unlimited")
    ) {
      if (known) {
        state.subscriptions![id] = {
          status: "inactive",
          periodEnd: 0,
          cancelAtPeriodEnd: false,
        };
      }
      return;
    }
    (state.subscriptions ??= {})[s.id] = {
      status: s.pause_collection ? "paused" : s.status ?? "incomplete",
      periodEnd: Number(
        s.items.data[0].current_period_end ?? s.current_period_end ?? 0,
      ),
      cancelAtPeriodEnd: s.cancel_at_period_end === true,
    };
  }
  private async fulfill(owner: string, id: string) {
    await this.store.billing.mutate(owner, async (state) => {
      const recorded = state.checkouts?.[id];
      if (!recorded) return;
      const session = await this.stripe<Resource>(
        "checkout/sessions/" + this.id(id) + "?expand[]=line_items",
      );
      if (
        session.customer !== state.customerId ||
        session.metadata?.owner_id !== owner ||
        session.metadata?.app !== "dragonfruit" ||
        session.metadata?.kind !== recorded.kind
      ) return;
      const items = session.line_items?.data;
      if (
        session.payment_status !== "paid" || session.currency !== "usd" ||
        session.amount_total !== (recorded.kind === "slot" ? 999 : 2499) ||
        items?.length !== 1 || items[0].quantity !== 1 ||
        !this.validPrice(items[0].price, recorded.kind)
      ) return;
      if (
        recorded.kind === "slot" && session.mode === "payment" &&
        session.payment_intent
      ) {
        // Reconcile the charge before granting, including refunds arriving before Checkout events.
        const intent = await this.stripe<Resource>(
          "payment_intents/" + this.id(session.payment_intent) +
            "?expand[]=latest_charge",
        );
        const charge = typeof intent.latest_charge === "object"
          ? intent.latest_charge
          : undefined;
        if (!charge) {
          throw new BillingError(
            "Payment settlement is not available yet",
            503,
          );
        }
        const existing = state.purchases?.[id];
        (state.purchases ??= {})[id] = {
          paymentIntent: session.payment_intent,
          refunded: charge.refunded === true ||
            (charge.amount !== undefined &&
              (charge.amount_refunded ?? 0) >= charge.amount),
          disputed: existing?.disputeResolved
            ? existing.disputed
            : charge.disputed === true,
          ...(existing?.disputeResolved ? { disputeResolved: true } : {}),
        };
      } else if (
        recorded.kind === "unlimited" && session.mode === "subscription" &&
        session.subscription
      ) await this.subscription(state, session.subscription);
      else return;
      recorded.expires = 0;
      recorded.complete = true;
    });
  }
  private checkout(user: User, kind: PurchaseKind) {
    if (!this.enabled) {
      throw new BillingError(
        "Payments are not available yet. Your free website and exports remain available.",
        503,
      );
    }
    return this.store.billing.mutate(user.id, async (state) => {
      if (kind === "unlimited") {
        for (const id of Object.keys(state.subscriptions ?? {})) {
          await this.subscription(state, id);
        }
      }
      if (kind === "unlimited" && summarize(state, 0).unlimited) {
        throw new BillingError(
          "Unlimited is already active. Manage it through Billing.",
          409,
        );
      }
      const pending = Object.values(state.checkouts ?? {}).find((c) =>
        c.kind === kind && c.expires * 1000 > Date.now()
      );
      if (pending) return { url: pending.url };
      const priceId = kind === "slot"
        ? this.config.stripeSlotPriceId!
        : this.config.stripeUnlimitedPriceId!;
      const price = await this.stripe<Price>("prices/" + this.id(priceId));
      if (!price.active || !this.validPrice(price, kind)) {
        throw new BillingError(
          "The configured Stripe price does not match this plan",
          503,
        );
      }
      if (!state.customerId) {
        const customer = await this.stripe<Resource>(
          "customers",
          new URLSearchParams({
            email: user.email,
            name: user.name,
            "metadata[app]": "dragonfruit",
            "metadata[owner_id]": user.id,
          }),
          "dragonfruit-customer-" + user.id,
        );
        state.customerId = customer.id;
      }
      const params = new URLSearchParams({
        mode: kind === "slot" ? "payment" : "subscription",
        customer: state.customerId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        client_reference_id: user.id,
        success_url: this.config.publicOrigin +
          "/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: this.config.publicOrigin + "/billing?checkout=cancelled",
        "metadata[app]": "dragonfruit",
        "metadata[owner_id]": user.id,
        "metadata[kind]": kind,
      });
      if (kind === "unlimited") {
        params.set("subscription_data[metadata][app]", "dragonfruit");
        params.set("subscription_data[metadata][owner_id]", user.id);
      }
      const s = await this.stripe<Resource>(
        "checkout/sessions",
        params,
        "dragonfruit-checkout-" + crypto.randomUUID(),
      );
      const url = this.hosted(s.url, "checkout.stripe.com");
      (state.checkouts ??= {})[s.id] = {
        kind,
        url,
        expires: s.expires_at ?? Math.floor(Date.now() / 1000) + 86400,
      };
      return { url };
    });
  }
  async webhook(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return Response.json({ error: "Use POST" }, { status: 405 });
    }
    if (!this.enabled) {
      return Response.json({ error: "Billing is not configured" }, {
        status: 503,
      });
    }
    try {
      const raw = await rawBody(req, 256 * 1024);
      if (
        !await verifyStripeSignature(
          raw,
          req.headers.get("stripe-signature"),
          this.config.stripeWebhookSecret!,
        )
      ) throw new BillingError("Invalid Stripe signature");
      const event = JSON.parse(raw) as {
        id: string;
        type: string;
        livemode: boolean;
        data: { object: Resource };
      };
      if (!event.id || !event.type || !event.data?.object?.id) {
        throw new BillingError("Invalid Stripe event");
      }
      if (event.livemode !== this.config.stripeSecretKey!.includes("_live_")) {
        throw new BillingError("Wrong Stripe mode");
      }
      const value = event.data.object;
      if (
        [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
        ].includes(event.type)
      ) {
        if (value.metadata?.app === "dragonfruit" && value.metadata.owner_id) {
          await this.fulfill(value.metadata.owner_id, value.id);
        }
      } else if (
        event.type.startsWith("customer.subscription.") ||
        ["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"]
          .includes(event.type)
      ) {
        const owner = value.customer &&
          await this.store.billing.ownerForCustomer(value.customer);
        const id = event.type.startsWith("customer.subscription.")
          ? value.id
          : value.subscription ??
            value.parent?.subscription_details?.subscription;
        if (owner && id) {
          await this.store.billing.mutate(owner, async (state) => {
            await this.subscription(state, id);
          });
        }
      } else if (
        ["charge.refunded", "charge.dispute.created", "charge.dispute.closed"]
          .includes(event.type)
      ) {
        const resource = await this.stripe<Resource>(
          (event.type === "charge.refunded" ? "charges/" : "disputes/") +
            this.id(value.id),
        );
        const intent = resource.payment_intent;
        const owner = intent &&
          await this.store.billing.ownerForPayment(intent);
        if (owner) {
          await this.store.billing.mutate(owner, async (state) => {
            const current = await this.stripe<Resource>(
              (event.type === "charge.refunded" ? "charges/" : "disputes/") +
                this.id(value.id),
            );
            if (current.payment_intent !== intent) return;
            for (const p of Object.values(state.purchases ?? {})) {
              if (p.paymentIntent === intent) {
                if (event.type === "charge.refunded") {
                  p.refunded = current.refunded === true ||
                    (current.amount_refunded ?? 0) >=
                      (current.amount ?? Infinity);
                } else {
                  p.disputed = current.status !== "won";
                  p.disputeResolved = current.status === "won" ||
                    current.status === "lost";
                }
              }
            }
          });
        }
      }
      return Response.json({ received: true });
    } catch (error) {
      if (error instanceof BillingError) {
        return Response.json({ error: error.message }, {
          status: error.status,
        });
      }
      console.error("Billing webhook processing failed");
      return Response.json({ error: "Please retry this event" }, {
        status: 503,
      });
    }
  }
  async handle(req: Request, user: User | undefined): Promise<Response> {
    if (!user) {
      return Response.json({ error: "Sign in to manage billing" }, {
        status: 401,
      });
    }
    const denied = sameOrigin(req, this.config);
    if (denied) return denied;
    try {
      const path = new URL(req.url).pathname;
      if (path === "/api/billing" && req.method === "GET") {
        return Response.json({
          summary: await this.summary(user.id),
          enabled: this.enabled,
        });
      }
      if (req.method !== "POST") throw new BillingError("Use POST", 405);
      if (!this.enabled) {
        throw new BillingError(
          "Payments are not available yet. Your free website and exports remain available.",
          503,
        );
      }
      if (path === "/api/billing/portal") {
        const state = await this.store.billing.read(user.id);
        if (!state.customerId) throw new BillingError("No billing account yet");
        const portal = await this.stripe<Resource>(
          "billing_portal/sessions",
          new URLSearchParams({
            customer: state.customerId,
            return_url: this.config.publicOrigin + "/billing",
          }),
        );
        return Response.json({
          url: this.hosted(portal.url, "billing.stripe.com"),
        });
      }
      if (!req.headers.get("content-type")?.startsWith("application/json")) {
        throw new BillingError("Use JSON");
      }
      let data: { kind?: string; sessionId?: string };
      try {
        data = JSON.parse(await rawBody(req, 4096));
      } catch (error) {
        if (error instanceof BillingError) throw error;
        throw new BillingError("Invalid JSON");
      }
      if (!data || typeof data !== "object") {
        throw new BillingError("Invalid request");
      }
      if (path === "/api/billing/checkout") {
        if (data.kind !== "slot" && data.kind !== "unlimited") {
          throw new BillingError("Choose a website slot or unlimited plan");
        }
        return Response.json(await this.checkout(user, data.kind));
      }
      if (path === "/api/billing/refresh") {
        if (data.sessionId) {
          if (typeof data.sessionId !== "string") {
            throw new BillingError("Invalid Checkout reference");
          }
          await this.fulfill(user.id, data.sessionId);
        }
        await this.store.billing.mutate(user.id, async (state) => {
          for (const id of Object.keys(state.subscriptions ?? {})) {
            await this.subscription(state, id);
          }
        });
        return Response.json({
          summary: await this.summary(user.id),
          enabled: this.enabled,
          confirmed: data.sessionId
            ? !!(await this.store.billing.read(user.id)).checkouts
              ?.[data.sessionId]?.complete
            : undefined,
        });
      }
      throw new BillingError("Route not found", 404);
    } catch (error) {
      if (error instanceof BillingError) {
        return Response.json({ error: error.message }, {
          status: error.status,
        });
      }
      return Response.json({
        error: "Billing is temporarily unavailable. Please try again.",
      }, { status: 503 });
    }
  }
}

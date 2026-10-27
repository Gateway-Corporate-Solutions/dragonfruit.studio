import { deepStrictEqual, equal, match, rejects } from "node:assert/strict";
import {
  BillingService,
  verifyStripeSignature,
} from "../../src/billing/service.ts";
import { summarize, WebsiteLimitError } from "../../src/billing/model.ts";
import { MemoryStore } from "../../src/storage/memory.ts";
import { ScopedStore } from "../../src/storage/scoped.ts";
import { DEFAULT_MANIFEST, parseProject } from "../../src/domain/manifest.ts";
import { handleApi } from "../../src/http/api.ts";
import { projectSourceFiles } from "../../src/domain/export.ts";
import { parseWebsite } from "../../src/domain/website.ts";
import type { Config } from "../../src/config.ts";
const user = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "Creator",
  email: "creator@example.com",
};
const config: Config = {
  devMode: false,
  storage: "postgres",
  publicOrigin: "https://studio.test",
  pollMs: 1000,
  stripeSecretKey: "sk_test_mock",
  stripeWebhookSecret: "whsec_mock",
  stripeSlotPriceId: "price_slot",
  stripeUnlimitedPriceId: "price_unlimited",
};
async function signed(payload: string, time = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("whsec_mock"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(time + "." + payload),
    ),
  );
  return `t=${time},v1=${
    [...sig].map((b) => b.toString(16).padStart(2, "0")).join("")
  }`;
}
function fixture() {
  const store = new MemoryStore();
  Object.defineProperty(store, "durable", { value: true });
  const slot = {
    id: "price_slot",
    active: true,
    currency: "usd",
    unit_amount: 999,
    recurring: null,
  };
  const monthly = {
    id: "price_unlimited",
    active: true,
    currency: "usd",
    unit_amount: 2499,
    recurring: { interval: "month", interval_count: 1 },
  };
  const sessions = new Map<string, Record<string, unknown>>();
  let count = 0, calls = 0, charged = 0, offline = false;
  const sub = {
    id: "sub_monthly",
    customer: "cus_creator",
    metadata: { app: "dragonfruit", owner_id: user.id },
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [{
        price: monthly,
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
      }],
    },
  };
  const charge = {
    id: "ch_payment",
    amount: 999,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
    payment_intent: "pi_slot",
  };
  let disputeStatus = "needs_response";
  const send: typeof fetch = (input, init) => {
    calls++;
    if (offline) {
      return Promise.resolve(
        Response.json({ error: "Outage" }, { status: 503 }),
      );
    }
    const url = new URL(String(input)), path = url.pathname;
    const p = new URLSearchParams(String(init?.body ?? ""));
    if (path.endsWith("/prices/price_slot")) {
      return Promise.resolve(Response.json(slot));
    }
    if (path.endsWith("/prices/price_unlimited")) {
      return Promise.resolve(Response.json(monthly));
    }
    if (path.endsWith("/customers")) {
      return Promise.resolve(Response.json({ id: "cus_creator" }));
    }
    if (path.endsWith("/checkout/sessions") && init?.method === "POST") {
      charged++;
      equal(p.get("line_items[0][quantity]"), "1");
      equal(
        p.get("success_url"),
        config.publicOrigin +
          "/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      );
      const kind = p.get("metadata[kind]")!, id = "cs_" + (++count);
      const session = {
        id,
        url: "https://checkout.stripe.com/c/" + id,
        customer: "cus_creator",
        metadata: { app: "dragonfruit", owner_id: user.id, kind },
        mode: kind === "slot" ? "payment" : "subscription",
        payment_status: "unpaid",
        currency: "usd",
        amount_total: kind === "slot" ? 999 : 2499,
        payment_intent: "pi_slot",
        subscription: kind === "unlimited" ? "sub_monthly" : undefined,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        line_items: {
          data: [{ quantity: 1, price: kind === "slot" ? slot : monthly }],
        },
      };
      sessions.set(id, session);
      return Promise.resolve(Response.json(session));
    }
    if (path.includes("/checkout/sessions/cs_")) {
      return Promise.resolve(
        Response.json(sessions.get(path.split("/").at(-1)!) ?? {}),
      );
    }
    if (path.includes("/payment_intents/")) {
      return Promise.resolve(
        Response.json({ id: "pi_slot", latest_charge: charge }),
      );
    }
    if (path.includes("/subscriptions/")) {
      return Promise.resolve(Response.json(sub));
    }
    if (path.includes("/charges/")) {
      return Promise.resolve(Response.json(charge));
    }
    if (path.includes("/disputes/")) {
      return Promise.resolve(
        Response.json({
          id: "dp_slot",
          payment_intent: "pi_slot",
          status: disputeStatus,
        }),
      );
    }
    if (path.endsWith("/billing_portal/sessions")) {
      equal(p.get("customer"), "cus_creator");
      return Promise.resolve(
        Response.json({
          id: "bps_portal",
          url: "https://billing.stripe.com/p/session",
        }),
      );
    }
    throw Error("Unexpected Stripe request " + path);
  };
  const billing = new BillingService(config, store, send);
  const req = (path: string, data: unknown = {}, who = user) =>
    billing.handle(
      new Request(config.publicOrigin + path, {
        method: "POST",
        headers: {
          origin: config.publicOrigin!,
          "content-type": "application/json",
        },
        body: JSON.stringify(data),
      }),
      who,
    );
  const event = async (type: string, value: unknown) => {
    const raw = JSON.stringify({
      id: "evt_test",
      type,
      livemode: false,
      data: { object: value },
    });
    return billing.webhook(
      new Request(config.publicOrigin + "/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": await signed(raw) },
        body: raw,
      }),
    );
  };
  return {
    store,
    billing,
    req,
    event,
    sessions,
    sub,
    charge,
    slot,
    monthly,
    get calls() {
      return calls;
    },
    get charged() {
      return charged;
    },
    setDispute: (s: string) => disputeStatus = s,
    setOffline: (value: boolean) => offline = value,
  };
}
Deno.test("free website capacity is atomic, owner-scoped, and never restricts editing or exports", async () => {
  const store = new MemoryStore(), own = new ScopedStore(store, user.id);
  const results = await Promise.allSettled(
    Array.from(
      { length: 12 },
      (_, i) => own.createProject(parseProject({ name: "Free " + i })),
    ),
  );
  equal(results.filter((r) => r.status === "fulfilled").length, 1);
  equal(await store.countProjects(user.id), 1);
  await rejects(
    () => own.createProject(parseProject({ name: "Second" })),
    WebsiteLimitError,
  );
  const project = (await own.listProjects())[0];
  await own.setPermanentProjects([project.id]);
  const accessible = await own.getProject(project.id);
  await own.saveEditor(
    project.id,
    0,
    parseWebsite(accessible!.document),
    DEFAULT_MANIFEST,
  );
  for (const format of ["fresh", "react"] as const) {
    equal(
      projectSourceFiles(parseWebsite(project.document), format).length > 0,
      true,
    );
  }
  const denied = await handleApi(
    new Request("https://studio.test/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Blocked" }),
    }),
    own,
  );
  equal(denied.status, 402);
  equal((await denied.json()).code, "WEBSITE_LIMIT");
  equal(
    await new ScopedStore(store, "other-owner").createProject(
      parseProject({ name: "Other" }),
    ).then((p) => p.ownerId),
    "other-owner",
  );
});
Deno.test("signed paid slot grants once despite concurrent duplicate delivery; redirect alone grants nothing", async () => {
  const f = fixture();
  equal(
    (await f.req("/api/billing/checkout", { kind: "slot", amount: 1 })).status,
    200,
  );
  equal(f.charged, 1);
  const s = f.sessions.get("cs_1")!;
  equal((await f.event("checkout.session.completed", s)).status, 200);
  equal((await f.billing.summary(user.id)).purchasedSlots, 0);
  s.payment_status = "paid";
  await Promise.all(
    Array.from({ length: 5 }, () => f.event("checkout.session.completed", s)),
  );
  equal((await f.billing.summary(user.id)).purchasedSlots, 1);
  const own = new ScopedStore(f.store, user.id);
  await own.createProject(parseProject({ name: "Free" }));
  await own.createProject(parseProject({ name: "Paid" }));
  await rejects(
    () => own.createProject(parseProject({ name: "Third" })),
    WebsiteLimitError,
  );
  await f.event("checkout.session.async_payment_succeeded", s);
  equal((await f.billing.summary(user.id)).limit, 2);
});
Deno.test("Stripe signatures reject tampering, expired timestamps, missing signatures and wrong account ownership", async () => {
  const raw = '{"hello":"world"}', signature = await signed(raw);
  equal(await verifyStripeSignature(raw, signature, "whsec_mock"), true);
  equal(await verifyStripeSignature(raw + " ", signature, "whsec_mock"), false);
  equal(
    await verifyStripeSignature(raw, await signed(raw, 1), "whsec_mock"),
    false,
  );
  equal(await verifyStripeSignature(raw, null, "whsec_mock"), false);
  const f = fixture();
  await f.req("/api/billing/checkout", { kind: "slot" });
  const s = f.sessions.get("cs_1")!;
  s.payment_status = "paid";
  s.customer = "cus_attacker";
  await f.event("checkout.session.completed", s);
  equal((await f.billing.summary(user.id)).purchasedSlots, 0);
  s.customer = "cus_creator";
  await f.req("/api/billing/refresh", { sessionId: "cs_1" }, {
    ...user,
    id: "other",
  });
  equal((await f.billing.summary("other")).purchasedSlots, 0);
  const invalid = await f.billing.webhook(
    new Request("https://studio.test/api/billing/webhook", {
      method: "POST",
      body: raw,
    }),
  );
  equal(invalid.status, 400);
});
Deno.test("checkout verifies exact server price, reuses pending sessions and rejects invalid kinds or cross-origin requests", async () => {
  const f = fixture();
  const first = await f.req("/api/billing/checkout", { kind: "slot" });
  const second = await f.req("/api/billing/checkout", { kind: "slot" });
  deepStrictEqual(await first.json(), await second.json());
  equal(f.charged, 1);
  equal(
    (await f.req("/api/billing/checkout", {
      kind: "free",
      price: "price_cheaper",
    })).status,
    400,
  );
  const cross = await f.billing.handle(
    new Request("https://studio.test/api/billing/checkout", {
      method: "POST",
      headers: {
        origin: "https://evil.test",
        "content-type": "application/json",
      },
      body: '{"kind":"slot"}',
    }),
    user,
  );
  equal(cross.status, 403);
  const wrong = fixture();
  wrong.monthly.unit_amount = 1;
  equal(
    (await wrong.req("/api/billing/checkout", { kind: "unlimited" })).status,
    503,
  );
  equal(wrong.charged, 0);
  const unknown = await f.billing.handle(
    new Request("https://studio.test/api/billing"),
    undefined,
  );
  equal(unknown.status, 401);
});
Deno.test("unlimited follows current Stripe subscription state, cancellation periods and expiry", async () => {
  const f = fixture();
  await f.req("/api/billing/checkout", { kind: "unlimited" });
  const s = f.sessions.get("cs_1")!;
  s.payment_status = "paid";
  await f.event("checkout.session.completed", s);
  equal((await f.billing.summary(user.id)).unlimited, true);
  const own = new ScopedStore(f.store, user.id);
  for (let i = 0; i < 105; i++) {
    await own.createProject(parseProject({ name: "Site " + i }));
  }
  equal((await own.listProjects()).length, 105);
  f.sub.cancel_at_period_end = true;
  await f.event("customer.subscription.updated", f.sub);
  equal((await f.billing.summary(user.id)).unlimited, true);
  equal(
    (await f.req("/api/billing/checkout", { kind: "unlimited" })).status,
    409,
  );
  f.sub.status = "canceled";
  await f.event("customer.subscription.deleted", f.sub);
  equal((await f.billing.summary(user.id)).unlimited, false);
  await rejects(
    () => own.createProject(parseProject({ name: "Over capacity" })),
    WebsiteLimitError,
  );
  const project = (await own.listProjects())[0];
  await own.setPermanentProjects([project.id]);
  const accessible = await own.getProject(project.id);
  await own.saveEditor(
    project.id,
    0,
    parseWebsite(accessible!.document),
    DEFAULT_MANIFEST,
  );
  const locked = (await own.listProjects()).find((website) => website.locked)!;
  await rejects(() => own.getProject(locked.id));
  // A stale "active" event cannot revive a subscription whose current Stripe state is canceled.
  await f.event("customer.subscription.updated", {
    ...f.sub,
    status: "active",
  });
  equal((await f.billing.summary(user.id)).unlimited, false);
  equal(
    summarize({
      subscriptions: {
        sub: { status: "active", periodEnd: 1, cancelAtPeriodEnd: false },
      },
    }, 1).unlimited,
    false,
  );
});
Deno.test("invoice failures and recoveries refresh Stripe state, and configured plan changes revoke unlimited", async () => {
  const f = fixture();
  await f.req("/api/billing/checkout", { kind: "unlimited" });
  const s = f.sessions.get("cs_1")!;
  s.payment_status = "paid";
  await f.event("checkout.session.completed", s);
  f.sub.status = "past_due";
  await f.event("invoice.payment_failed", {
    id: "in_failed",
    customer: "cus_creator",
    parent: { subscription_details: { subscription: "sub_monthly" } },
  });
  equal((await f.billing.summary(user.id)).unlimited, false);
  f.sub.status = "active";
  await f.event("invoice.paid", {
    id: "in_paid",
    customer: "cus_creator",
    subscription: "sub_monthly",
  });
  equal((await f.billing.summary(user.id)).unlimited, true);
  f.monthly.unit_amount = 1;
  await f.event("customer.subscription.updated", f.sub);
  equal((await f.billing.summary(user.id)).unlimited, false);
});
Deno.test("refunds, pre-fulfillment refunds and disputes revoke capacity without deleting websites", async () => {
  const f = fixture();
  await f.req("/api/billing/checkout", { kind: "slot" });
  const s = f.sessions.get("cs_1")!;
  s.payment_status = "paid";
  await f.event("checkout.session.completed", s);
  await f.event("charge.dispute.created", { id: "dp_slot" });
  equal((await f.billing.summary(user.id)).purchasedSlots, 0);
  f.setDispute("won");
  await f.event("charge.dispute.closed", { id: "dp_slot" });
  equal((await f.billing.summary(user.id)).purchasedSlots, 1);
  f.charge.refunded = true;
  f.charge.amount_refunded = 999;
  await f.event("charge.refunded", f.charge);
  equal((await f.billing.summary(user.id)).purchasedSlots, 0);
  await f.event("checkout.session.completed", s);
  equal((await f.billing.summary(user.id)).purchasedSlots, 0);
  const early = fixture();
  await early.req("/api/billing/checkout", { kind: "slot" });
  early.charge.refunded = true;
  early.sessions.get("cs_1")!.payment_status = "paid";
  await early.event("checkout.session.completed", early.sessions.get("cs_1"));
  equal((await early.billing.summary(user.id)).purchasedSlots, 0);
});
Deno.test("portal is bound to the signed-in customer and memory/demo cannot initiate real charges", async () => {
  const f = fixture();
  await f.req("/api/billing/checkout", { kind: "slot" });
  const portal = await f.req("/api/billing/portal");
  equal((await portal.json()).url, "https://billing.stripe.com/p/session");
  const demo = new MemoryStore();
  let called = false;
  const service = new BillingService(config, demo, () => {
    called = true;
    throw Error("No real billing");
  });
  equal(service.enabled, false);
  const response = await service.handle(
    new Request("https://studio.test/api/billing/checkout", {
      method: "POST",
      headers: {
        origin: "https://studio.test",
        "content-type": "application/json",
      },
      body: '{"kind":"slot"}',
    }),
    user,
  );
  equal(response.status, 503);
  equal(called, false);
  match((await response.json()).error, /free website/);
});

Deno.test("failed fulfillment is retried safely and return-page confirmation is server verified", async () => {
  const f = fixture();
  await f.req("/api/billing/checkout", { kind: "slot" });
  const s = f.sessions.get("cs_1")!;
  s.payment_status = "paid";
  f.setOffline(true);
  equal((await f.event("checkout.session.completed", s)).status, 503);
  equal((await f.billing.summary(user.id)).purchasedSlots, 0);
  f.setOffline(false);
  equal((await f.event("checkout.session.completed", s)).status, 200);
  const refreshed = await f.req("/api/billing/refresh", { sessionId: "cs_1" });
  const value = await refreshed.json();
  equal(value.confirmed, true);
  equal(value.summary.purchasedSlots, 1);
  const unknown = await f.req("/api/billing/refresh", {
    sessionId: "cs_unknown",
  });
  equal((await unknown.json()).confirmed, false);
  s.amount_total = 1;
  await f.event("checkout.session.completed", s);
  equal((await f.billing.summary(user.id)).purchasedSlots, 1);
});

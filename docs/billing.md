# Account billing and website capacity

The builder now has three options. These are separate from Stripe checkout inside a user's exported shop.

| Option | Price (USD) | Website capacity | Editing and exports |
| --- | --- | --- | --- |
| Free | $0 forever | One website | Included forever, no export count limit |
| Website slot | $9.99 once | One additional permanent slot per purchase | Included forever |
| Unlimited | $24.99/month | Unlimited website creation while active and within its verified billing period | Included |

Slots belong to an account and are additive to the free slot. A subscription does not consume purchased slots. Scheduled cancellation keeps Unlimited access until the verified paid period ends. After expiry, cancellation, payment failure, or pause, website access is limited to the free plus purchased permanent slots. Users choose covered websites on the Websites page, before or after cancellation. Without a saved selection, oldest websites are covered first, with ID ordering to break ties. Unfilled capacity automatically covers remaining oldest websites. Selections are ordered and stored in billing account state; no schema migration is required. Excess websites remain listed but locked, with drafts and manifests withheld from account APIs. Editing, validation, and source export require access. Data is retained; buying slots or resubscribing restores access. Already-exported projects cannot be revoked and run independently. New creation still requires unused capacity across all retained websites. Operator workspaces bypass account quotas.

`/pricing` is public. Signed-in creators use `/billing` or **Plans & billing** in the sidebar. The dashboard shows usage; the new-website page shows plans when full. Direct `POST /api/projects` requests return HTTP 402 with `code: WEBSITE_LIMIT` when full. Website creation and billing updates serialize on the same account row in PostgreSQL, including across server processes. Quotas count all websites, not a paginated dashboard result. There is no 100-website product cap.

## Deployment setup

1. Deploy the updated code and run `deno task migrate` against the production database to apply `004_billing.sql`. Keep existing migrations. Production billing requires PostgreSQL; real checkout is disabled with ephemeral memory storage.
2. In the Stripe account that receives the builder's revenue, create two active Prices:
   - A one-time USD price of **999 cents**, with no recurring interval.
   - A recurring USD price of **2499 cents**, monthly, interval count 1, with no trial.
3. Set these server environment values (never client-side):

   ```dotenv
   DRAGONFRUIT_PUBLIC_ORIGIN=https://dragonfruit.studio
   DRAGONFRUIT_STRIPE_SECRET_KEY=sk_test_REPLACE
   DRAGONFRUIT_STRIPE_WEBHOOK_SECRET=whsec_REPLACE
   DRAGONFRUIT_STRIPE_SLOT_PRICE_ID=price_REPLACE_SLOT
   DRAGONFRUIT_STRIPE_UNLIMITED_PRICE_ID=price_REPLACE_MONTHLY
   ```

   Use test-mode prices and credentials together for testing, then matching live-mode values to accept real payments. Keep these names distinct from the `STRIPE_SECRET_KEY` used by a customer's exported commerce application. Exact amount, currency, recurring interval, and active Price are validated before creating Checkout; browser-supplied prices or quantities are ignored.
4. Create a **snapshot event** webhook endpoint at `https://dragonfruit.studio/api/billing/webhook`. Use API version **2025-06-30.basil** and subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
5. Enable Stripe Customer Portal payment-method updates, invoice access, and subscription cancellation. Configure cancellation **at the end of the billing period**. Do not enable arbitrary subscription price switching or quantity changes; this app sells one fixed unlimited plan. The portal return URL is the configured origin plus `/billing`.
6. Restart the application so the environment changes take effect. Open `/billing` with an ordinary signed-in account. Verify test purchases and webhooks before replacing test credentials with live credentials.

Local webhook forwarding with Stripe CLI:

```sh
stripe listen --forward-to http://localhost:5173/api/billing/webhook
```

Use that command's webhook signing secret for local testing. The development server still accepts loopback hosts only. Subscribe to the same event types when forwarding. For an end-to-end test, use the application's **Buy a website slot** or **Subscribe** button; synthetic Checkout events from `stripe trigger` do not belong to an application-created checkout and cannot grant capacity.

## Payment processing

- Checkout and portal requests require an authenticated creator and the configured same-origin request header. The account ID and fixed Price IDs come from the server. Checkout uses Stripe-hosted payment collection; no card details enter this application.
- The webhook is the only session/CSRF exception. It verifies HMAC-SHA256 against the exact bounded request body, accepts rotated `v1` signatures, enforces a five-minute signature tolerance, and rejects a mismatched live/test mode. No capacity is granted from a success query parameter or unverified browser response.
- Application-created Checkout sessions are recorded against their owner and customer. Fulfillment retrieves the current session and checks its customer, owner metadata, mode, USD total, single line item, quantity, configured Price, and paid status. Permanent slots are keyed by Checkout session, so repeat and concurrent deliveries cannot add duplicate slots. A successful return can reconcile only that signed-in user's recorded session.
- Subscription events and invoice notifications retrieve the current subscription under the account's transaction lock instead of trusting an older event snapshot. Only the configured monthly Price, active status, unpaused collection, and a future billing period grant unlimited creation. A scheduled cancellation remains active until its period ends. A failed payment stops new unlimited creation; a subsequent paid renewal restores it.
- Full slot refunds and open/lost disputes remove that purchase's capacity; winning a dispute restores it. Reduced capacity can lock excess websites without deleting their data. Fulfillment also checks the current charge, including a refund that happened before the Checkout notification. Partial slot refunds retain the slot. Subscription refunds should be paired with subscription cancellation in Stripe when access should end; a refund alone does not change Stripe subscription status.
- Transient fulfillment failures return an error so Stripe can retry. Unknown or unrelated Stripe events do not grant anything. Repeated delivery is safe. Recent unfinished checkout links are reused so repeated button clicks do not create multiple active Checkout sessions for the same option.
- Keep Stripe webhook retrying enabled and monitor failed delivery attempts. A server-side clock with correct time is required for signature verification.

## Validation

`deno task test` includes signed-webhook tests using a mocked Stripe transport, duplicate delivery, wrong-owner and wrong-price rejection, concurrent free-slot creation, unlimited creation beyond 100 websites, renewal/failure/cancellation, refunds and disputes, retry recovery, portal ownership, permanent selection, locked draft/job access, and restoration after buying capacity or resubscribing. Browser checks cover permanent selection and locked sites as well as plan selection, Stripe redirects through a mock, paid-return confirmation, disabled/guest/unlimited states, quota upgrade navigation, and narrow/mobile layouts.

For real PostgreSQL transaction checks, point `TEST_DATABASE_URL` at an isolated test database and run:

```sh
deno task test:integration
```

`tests/integration/billing_postgres_test.ts` checks account-row locking across separate connections, purchased capacity, downgrade handling, and retained editing. No PostgreSQL integration test or live Stripe charge was executed in the artifact-generation environment.

Official references: [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment), [Webhook verification](https://docs.stripe.com/webhooks), [Customer Portal sessions](https://docs.stripe.com/api/customer_portal/sessions/create), [Subscription billing periods](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end).

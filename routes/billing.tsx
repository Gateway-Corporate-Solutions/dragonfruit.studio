import { define } from "@/utils.ts";
import { getServices } from "@/src/services.ts";
import BillingPanel from "@/islands/BillingPanel.tsx";
export default define.page(async function Billing(ctx) {
  const billing = getServices().billing;
  return (
    <>
      <div class="page-heading">
        <div>
          <p class="eyebrow">ROOM TO GROW</p>
          <h1>Plans & billing</h1>
          <p>One free website. Unlimited freedom to export.</p>
        </div>
      </div>
      {ctx.state.user
        ? (
          <BillingPanel
            initial={await billing.summary(ctx.state.user.id)}
            enabled={billing.enabled}
          />
        )
        : (
          <section class="panel">
            <p>
              Operator access is unrestricted. Sign in with a personal account
              to purchase website slots or a subscription.
            </p>
          </section>
        )}
    </>
  );
});

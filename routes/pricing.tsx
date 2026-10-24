import { define } from "@/utils.ts";
import { getServices } from "@/src/services.ts";
import BillingPanel from "@/islands/BillingPanel.tsx";
export default define.page(async function Pricing(ctx) {
  const billing = getServices().billing;
  return (
    <>
      <a class="back" href="/">← dragonfruit studio</a>
      <div class="page-heading">
        <div>
          <p class="eyebrow">SIMPLE, LASTING OWNERSHIP</p>
          <h1>A free start. Room to grow.</h1>
          <p>Your website source is yours, on every plan.</p>
        </div>
      </div>
      <BillingPanel
        signedIn={!!ctx.state.user}
        enabled={billing.enabled}
        initial={ctx.state.user
          ? await billing.summary(ctx.state.user.id)
          : undefined}
      />
    </>
  );
});

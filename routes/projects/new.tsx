import { getServices } from "@/src/services.ts";
import BillingPanel from "@/islands/BillingPanel.tsx";
import { define } from "@/utils.ts";
import NewProject from "@/islands/NewProject.tsx";
export default define.page(async function New(ctx) {
  const billing = getServices().billing;
  const summary = ctx.state.user
    ? await billing.summary(ctx.state.user.id)
    : undefined;
  return (
    <>
      <a class="back" href="/websites">← Your websites</a>
      <div class="page-heading">
        <div>
          <p class="eyebrow">MAKE ROOM FOR YOUR IDEAS</p>
          <h1>Create a website</h1>
          <p>Simple by default. Expert configuration always available.</p>
        </div>
      </div>
      {summary && !summary.canCreate
        ? (
          <>
            <p class="notice">
              Your website slots are full. Your existing websites and exports
              remain available.
            </p>
            <BillingPanel initial={summary} enabled={billing.enabled} />
          </>
        )
        : <NewProject />}
    </>
  );
});

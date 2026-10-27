import { doesNotMatch, match } from "node:assert/strict";
import { renderToString } from "preact-render-to-string";
import PublicHome from "../../islands/PublicHome.tsx";
import BillingPanel from "../../islands/BillingPanel.tsx";

Deno.test("homepage explains client delivery, free exports, hosting exclusions and cancellation", () => {
  const html = renderToString(
    <PublicHome demo={false} github email />,
  );
  match(html, /Design client websites visually/);
  match(
    html,
    /One free website\. Unlimited source exports\. Hosting not included/,
  );
  match(html, /Source exports are free on every plan/);
  match(html, /\$9\.99 each/);
  match(html, /\$24\.99\/month/);
  match(html, /continues until the paid period ends/);
  match(html, /stay editable and exportable/);
  match(html, /Exported client sites do not depend on your subscription/);
  doesNotMatch(html, /publishing is coming|place to grow/i);
});

Deno.test("billing distinguishes creation capacity from ongoing export and editing access", () => {
  const html = renderToString(
    <BillingPanel signedIn={false} enabled={false} />,
  );
  match(
    html,
    /unlimited creation continues until the paid billing period ends/,
  );
  match(html, /If you are over capacity/);
  match(html, /Existing websites stay editable and exportable/);
  match(html, /not hosting, domains, or third-party service fees/);
});

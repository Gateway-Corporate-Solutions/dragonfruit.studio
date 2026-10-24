export type PurchaseKind = "slot" | "unlimited";
export interface BillingState {
  customerId?: string;
  checkouts?: Record<
    string,
    { kind: PurchaseKind; url: string; expires: number; complete?: boolean }
  >;
  purchases?: Record<
    string,
    {
      paymentIntent: string;
      refunded: boolean;
      disputed: boolean;
      disputeResolved?: boolean;
    }
  >;
  subscriptions?: Record<
    string,
    { status: string; periodEnd: number; cancelAtPeriodEnd: boolean }
  >;
}
export interface BillingSummary {
  used: number;
  purchasedSlots: number;
  limit: number | null;
  unlimited: boolean;
  canCreate: boolean;
  hasCustomer: boolean;
  subscriptionStatus?: string;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}
export function summarize(
  state: BillingState,
  used: number,
  now = Date.now(),
): BillingSummary {
  const purchasedSlots =
    Object.values(state.purchases ?? {}).filter((p) =>
      !p.refunded && !p.disputed
    ).length;
  const subscriptions = Object.values(state.subscriptions ?? {});
  const active = subscriptions.find((s) =>
    s.status === "active" && s.periodEnd * 1000 > now
  );
  const latest = active ??
    subscriptions.sort((a, b) => b.periodEnd - a.periodEnd)[0];
  const limit = active ? null : 1 + purchasedSlots;
  return {
    used,
    purchasedSlots,
    limit,
    unlimited: !!active,
    canCreate: limit === null || used < limit,
    hasCustomer: !!state.customerId,
    ...(latest
      ? {
        subscriptionStatus: latest.status,
        periodEnd: latest.periodEnd,
        cancelAtPeriodEnd: latest.cancelAtPeriodEnd,
      }
      : {}),
  };
}
export class WebsiteLimitError extends Error {
  constructor() {
    super(
      "Your website slots are full. Add a permanent slot for $9.99 or unlock unlimited websites for $24.99/month. Existing websites and exports remain available.",
    );
  }
}

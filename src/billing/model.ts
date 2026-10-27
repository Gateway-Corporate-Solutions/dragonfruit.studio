export type PurchaseKind = "slot" | "unlimited";
export interface BillingState {
  permanentProjects?: string[];
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
      "Your website slots are full. Add a permanent slot for $9.99 or unlock unlimited websites for $24.99/month. Excess websites are retained but locked when Unlimited ends.",
    );
  }
}
export class WebsiteLockedError extends Error {
  constructor() {
    super(
      "This website is locked. Choose it for a permanent slot, buy more slots, or resubscribe to Unlimited.",
    );
  }
}
export function permanentProjectIds(
  state: BillingState,
  projects: { id: string; createdAt: string }[],
): string[] {
  const ids = new Set(projects.map((project) => project.id));
  const selected = (state.permanentProjects ?? []).filter((id) => ids.has(id));
  const ordered = [...projects].sort((first, second) =>
    first.createdAt.localeCompare(second.createdAt) ||
    first.id.localeCompare(second.id)
  );
  return [...new Set([...selected, ...ordered.map((project) => project.id)])]
    .slice(0, 1 + summarize(state, projects.length).purchasedSlots);
}

import type postgres from "postgres";
import type { BillingState } from "./model.ts";
export interface BillingRepository {
  read(ownerId: string): Promise<BillingState>;
  mutate<T>(
    ownerId: string,
    fn: (state: BillingState) => T | Promise<T>,
  ): Promise<T>;
  ownerForCustomer(customerId: string): Promise<string | undefined>;
  ownerForPayment(paymentIntent: string): Promise<string | undefined>;
}
export class MemoryBillingRepository implements BillingRepository {
  private states = new Map<string, BillingState>();
  private locks = new Map<string, Promise<void>>();
  read(ownerId: string) {
    return Promise.resolve(structuredClone(this.states.get(ownerId) ?? {}));
  }
  async mutate<T>(
    ownerId: string,
    fn: (state: BillingState) => T | Promise<T>,
  ): Promise<T> {
    const before = this.locks.get(ownerId) ?? Promise.resolve();
    let unlock!: () => void;
    const gate = new Promise<void>((r) => unlock = r);
    const tail = before.then(() => gate);
    this.locks.set(ownerId, tail);
    await before;
    try {
      const state = await this.read(ownerId);
      const result = await fn(state);
      this.states.set(ownerId, structuredClone(state));
      return result;
    } finally {
      unlock();
      if (this.locks.get(ownerId) === tail) this.locks.delete(ownerId);
    }
  }
  ownerForCustomer(id: string) {
    return Promise.resolve(
      [...this.states].find(([, s]) => s.customerId === id)?.[0],
    );
  }
  ownerForPayment(id: string) {
    return Promise.resolve(
      [...this.states].find(([, s]) =>
        Object.values(s.purchases ?? {}).some((p) => p.paymentIntent === id)
      )?.[0],
    );
  }
}
export class PostgresBillingRepository implements BillingRepository {
  constructor(private sql: postgres.Sql) {}
  async read(ownerId: string): Promise<BillingState> {
    const [r] = await this
      .sql`SELECT state FROM billing_accounts WHERE owner_id=${ownerId}`;
    return r?.state ?? {};
  }
  async mutate<T>(
    ownerId: string,
    fn: (state: BillingState) => T | Promise<T>,
  ): Promise<T> {
    return await this.sql.begin(async (tx) => {
      await tx`INSERT INTO billing_accounts(owner_id,state) VALUES(${ownerId},'{}') ON CONFLICT(owner_id) DO NOTHING`;
      const [row] =
        await tx`SELECT state FROM billing_accounts WHERE owner_id=${ownerId} FOR UPDATE`;
      const state: BillingState = row.state;
      const result = await fn(state);
      await tx`UPDATE billing_accounts SET state=${
        tx.json(state as unknown as postgres.JSONValue)
      },updated_at=now() WHERE owner_id=${ownerId}`;
      return result;
    }) as T;
  }
  async ownerForCustomer(id: string) {
    const [r] = await this
      .sql`SELECT owner_id FROM billing_accounts WHERE state->>'customerId'=${id}`;
    return r ? String(r.owner_id) : undefined;
  }
  async ownerForPayment(id: string) {
    const [r] = await this
      .sql`SELECT owner_id FROM billing_accounts WHERE EXISTS(SELECT 1 FROM jsonb_each(COALESCE(state->'purchases','{}'::jsonb)) p WHERE p.value->>'paymentIntent'=${id})`;
    return r ? String(r.owner_id) : undefined;
  }
}

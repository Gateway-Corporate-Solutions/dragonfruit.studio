import { BillingService } from "./billing/service.ts";
import { AuthService } from "./auth/service.ts";
import { MemoryAuthStore, PostgresAuthStore } from "./auth/store.ts";
import { readConfig } from "./config.ts";
import { MemoryStore } from "./storage/memory.ts";
import { PostgresStore } from "./storage/postgres.ts";
import type { Store } from "./storage/store.ts";
import { runOnce } from "./worker/run.ts";

let services:
  | {
    config: ReturnType<typeof readConfig>;
    store: Store;
    auth: AuthService;
    billing: BillingService;
  }
  | undefined;
export function getServices() {
  if (!services) {
    const config = readConfig();
    const store = config.storage === "memory"
      ? new MemoryStore()
      : new PostgresStore(config.databaseUrl!);
    const accounts = store instanceof PostgresStore
      ? new PostgresAuthStore(store.sql)
      : new MemoryAuthStore();
    services = {
      config,
      store,
      auth: new AuthService(config, accounts),
      billing: new BillingService(config, store),
    };
    // Demo-only process-local runner. Durable operation uses the separate worker.
    if (!store.durable) {
      const timer = setInterval(() => {
        runOnce(store).catch(() => console.error("Demo validation failed"));
      }, config.pollMs);
      Deno.unrefTimer(timer);
    }
  }
  return services;
}

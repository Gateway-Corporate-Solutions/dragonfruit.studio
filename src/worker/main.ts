import { readConfig } from "../config.ts";
import { PostgresStore } from "../storage/postgres.ts";
import { runWorker } from "./run.ts";

const config = readConfig();
if (config.storage !== "postgres") {
  throw new Error(
    "The separate worker requires PostgreSQL; memory demos run an embedded validation worker",
  );
}
const store = new PostgresStore(config.databaseUrl!);
await store.ping();
const controller = new AbortController();
const stop = () => controller.abort();
Deno.addSignalListener("SIGINT", stop);
Deno.addSignalListener("SIGTERM", stop);
console.log("dragonfruit worker ready (configuration validation only)");
try {
  await runWorker(store, controller.signal, config.pollMs);
} finally {
  Deno.removeSignalListener("SIGINT", stop);
  Deno.removeSignalListener("SIGTERM", stop);
  await store.close();
}

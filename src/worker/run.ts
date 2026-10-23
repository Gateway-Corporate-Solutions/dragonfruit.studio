import { parseManifest, ValidationError } from "../domain/manifest.ts";
import type { Store } from "../storage/store.ts";

/** Executes metadata validation only. No checkout, shell, build, or runtime access. */
export async function runOnce(store: Store): Promise<boolean> {
  const lease = await store.claim(30000);
  if (!lease) return false;
  try {
    parseManifest(lease.job.manifest);
    await store.complete(
      lease.job.id,
      lease.token,
      true,
      "Configuration schema is valid. Repository access, task existence, build output, and deployment have not been checked.",
    );
  } catch (error) {
    await store.complete(
      lease.job.id,
      lease.token,
      false,
      error instanceof ValidationError
        ? error.message
        : "Configuration validation failed",
    );
  }
  return true;
}
export async function runWorker(
  store: Store,
  signal: AbortSignal,
  pollMs = 1000,
) {
  while (!signal.aborted) {
    try {
      await runOnce(store);
    } catch {
      console.error("Worker storage unavailable; retrying");
    }
    if (signal.aborted) break;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, pollMs);
      signal.addEventListener("abort", done, { once: true });
    });
  }
}

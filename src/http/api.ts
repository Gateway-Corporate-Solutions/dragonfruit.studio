import { WebsiteLimitError } from "../billing/model.ts";
import { FORM_SERVER_SOURCE } from "../domain/form-runtime.ts";
import { parseWebsite } from "../domain/website.ts";
import {
  parseManifest,
  parseProject,
  ValidationError,
} from "../domain/manifest.ts";
import { ConflictError, NotFoundError } from "../domain/models.ts";
import type { Store } from "../storage/store.ts";
const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const MAX_REQUEST_BODY_BYTES = 15 * 1024 * 1024;
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status });
async function body(
  req: Request,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    throw new ValidationError(["Use application/json"]);
  }
  if (Number(req.headers.get("content-length")) > maxBytes) {
    throw new ValidationError([
      `Request body exceeds ${maxBytes / 1024 / 1024} MiB`,
    ]);
  }
  if (!req.body) throw new ValidationError(["JSON body is required"]);
  const reader = req.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) {
        await reader.cancel();
        throw new ValidationError([
          `Request body exceeds ${maxBytes / 1024 / 1024} MiB`,
        ]);
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      throw new ValidationError(["Invalid JSON"]);
    }
  } finally {
    reader.releaseLock();
  }
}
export async function handleApi(req: Request, store: Store): Promise<Response> {
  const url = new URL(req.url), path = url.pathname;
  try {
    if (path === "/api/ready" && req.method === "GET") {
      await store.ping();
      return Response.json({ status: "ok", durable: store.durable });
    }
    if (path === "/api/projects") {
      if (req.method === "GET") {
        return Response.json({ projects: await store.listProjects() });
      }
      if (req.method === "POST") {
        const project = await store.createProject(
          parseProject(await body(req)),
        );
        return Response.json({ project }, {
          status: 201,
          headers: { Location: "/api/projects/" + project.id },
        });
      }
      return error("Method not allowed", 405);
    }
    let match = path.match(new RegExp("^/api/projects/(" + uuid + ")$"));
    if (match && req.method === "GET") {
      const project = await store.getProject(match[1]);
      return project
        ? Response.json({ project })
        : error("Project not found", 404);
    }
    match = path.match(new RegExp("^/api/projects/(" + uuid + ")/forms/test$"));
    if (match && req.method === "POST") {
      if (!await store.getProject(match[1])) {
        return error("Project not found", 404);
      }
      const data = await body(req, 48 * 1024 * 1024) as Record<string, unknown>;
      const website = parseWebsite(data.document);
      const runtime = await import(
        "data:text/javascript," + encodeURIComponent(FORM_SERVER_SOURCE)
      );
      return runtime.handleForm(
        new Request(
          "http://preview.local/api/forms/" + String(data.pageId) + "/" +
            String(data.nodeId),
          {
            method: "POST",
            headers: {
              Origin: "http://preview.local",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data.values),
          },
        ),
        website,
        () => undefined,
        { dryRun: true },
      );
    }
    match = path.match(new RegExp("^/api/projects/(" + uuid + ")/editor$"));
    if (match) {
      if (req.method !== "PUT") return error("Method not allowed", 405);
      const data = await body(req, 48 * 1024 * 1024) as
        | Record<string, unknown>
        | null;
      if (
        !data || !Number.isSafeInteger(data.revision) ||
        Number(data.revision) < 0
      ) throw new ValidationError(["A valid revision is required"]);
      const project = await store.saveEditor(
        match[1],
        Number(data.revision),
        parseWebsite(data.document),
        parseManifest(data.manifest),
      );
      return Response.json({ project });
    }
    match = path.match(new RegExp("^/api/projects/(" + uuid + ")/validate$"));
    if (match) {
      if (req.method !== "POST") return error("Method not allowed", 405);
      const key = req.headers.get("idempotency-key") ?? crypto.randomUUID();
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key)) {
        return error("Invalid Idempotency-Key", 400);
      }
      const job = await store.enqueueValidation(match[1], key);
      return Response.json({ job }, {
        status: 202,
        headers: { Location: "/api/jobs/" + job.id },
      });
    }
    if (path === "/api/jobs" && req.method === "GET") {
      return Response.json({ jobs: await store.listJobs() });
    }
    match = path.match(new RegExp("^/api/jobs/(" + uuid + ")(/cancel)?$"));
    if (match) {
      const job = await store.getJob(match[1]);
      if (!job) return error("Job not found", 404);
      if (!match[2] && req.method === "GET") return Response.json({ job });
      if (match[2] && req.method === "POST") {
        return await store.cancel(job.id)
          ? Response.json({ job: await store.getJob(job.id) })
          : error("Job is already terminal", 409);
      }
      return error("Method not allowed", 405);
    }
    return error("Route not found", 404);
  } catch (e) {
    if (e instanceof WebsiteLimitError) {
      return Response.json({
        error: e.message,
        code: "WEBSITE_LIMIT",
        billingUrl: "/billing",
      }, { status: 402 });
    }
    if (e instanceof ValidationError) {
      return Response.json({ error: "Validation failed", issues: e.issues }, {
        status: 400,
      });
    }
    if (e instanceof ConflictError) return error(e.message, 409);
    if (e instanceof NotFoundError) return error(e.message, 404);
    throw e;
  }
}

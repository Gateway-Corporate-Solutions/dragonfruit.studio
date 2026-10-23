export interface Manifest {
  schemaVersion: 1;
  framework: "fresh2";
  root: string;
  tasks: { check: string; build: string; start: string };
  http: { port: number; readinessPath: string };
  limits: { buildTimeoutSeconds: number; memoryMiB: number; cpu: number };
}
export const DEFAULT_MANIFEST: Manifest = {
  schemaVersion: 1,
  framework: "fresh2",
  root: ".",
  tasks: {
    check: "deno task check",
    build: "deno task build",
    start: "deno task start",
  },
  http: { port: 8000, readinessPath: "/healthz" },
  limits: { buildTimeoutSeconds: 600, memoryMiB: 512, cpu: 1 },
};
export class ValidationError extends Error {
  constructor(public issues: string[]) {
    super(issues.join("; "));
    this.name = "ValidationError";
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function parseManifest(value: unknown): Manifest {
  const errors: string[] = [];
  if (!object(value)) throw new ValidationError(["Manifest must be an object"]);
  const { tasks, http, limits } = value;
  if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (value.framework !== "fresh2") errors.push("framework must be fresh2");
  if (
    typeof value.root !== "string" || value.root.length > 200 ||
    !/^(\.|[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*)$/.test(value.root) ||
    value.root.split("/").some((p) =>
      p === ".." || p === "." && value.root !== "."
    )
  ) errors.push("root must be a relative directory without traversal");
  for (const key of ["check", "build", "start"]) {
    if (
      !object(tasks) || typeof tasks[key] !== "string" ||
      !/^deno task [a-zA-Z0-9:_-]+$/.test(tasks[key] as string)
    ) {
      errors.push(
        "tasks." + key + " must name one Deno task (no shell expressions)",
      );
    }
  }
  if (
    !object(http) || !Number.isInteger(http.port) || Number(http.port) < 1024 ||
    Number(http.port) > 65535
  ) errors.push("http.port must be 1024–65535");
  if (
    !object(http) || typeof http.readinessPath !== "string" ||
    !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(http.readinessPath) ||
    http.readinessPath.length > 200
  ) errors.push("http.readinessPath must be a local absolute path");
  for (
    const [key, min, max] of [["buildTimeoutSeconds", 1, 3600], [
      "memoryMiB",
      64,
      8192,
    ], ["cpu", 0.25, 8]] as const
  ) {
    const n = object(limits) ? limits[key] : undefined;
    if (
      typeof n !== "number" || !Number.isFinite(n) || n < min || n > max ||
      key !== "cpu" && !Number.isInteger(n)
    ) errors.push("limits." + key + " must be between " + min + " and " + max);
  }
  if (errors.length) throw new ValidationError(errors);
  // Reconstruct known fields so undeclared privileges cannot enter the execution contract.
  const t = tasks as Manifest["tasks"],
    h = http as Manifest["http"],
    l = limits as Manifest["limits"];
  return {
    schemaVersion: 1,
    framework: "fresh2",
    root: value.root as string,
    tasks: { check: t.check, build: t.build, start: t.start },
    http: { port: h.port, readinessPath: h.readinessPath },
    limits: {
      buildTimeoutSeconds: l.buildTimeoutSeconds,
      memoryMiB: l.memoryMiB,
      cpu: l.cpu,
    },
  };
}
export interface ProjectInput {
  name: string;
  slug: string;
  repositoryUrl: string | null;
  manifest: Manifest;
}
export function parseProject(value: unknown): ProjectInput {
  if (!object(value)) throw new ValidationError(["Project must be an object"]);
  const { name, repositoryUrl } = value;
  const slug = value.slug ??
    ((typeof name === "string"
        ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
          .slice(0, 32)
        : "") || "project") + "-" + crypto.randomUUID().slice(0, 8);
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    throw new ValidationError(["name must contain 1–80 characters"]);
  }
  if (typeof slug !== "string" || !/^[a-z][a-z0-9-]{1,47}$/.test(slug)) {
    throw new ValidationError([
      "slug must contain 2–48 lowercase letters, digits, or hyphens and start with a letter",
    ]);
  }
  if (repositoryUrl !== undefined && repositoryUrl !== null) {
    try {
      const url = new URL(String(repositoryUrl));
      if (
        url.protocol !== "https:" || url.username || url.password ||
        url.search ||
        url.hash ||
        !["github.com", "gitlab.com", "bitbucket.org"].includes(url.hostname) ||
        url.port || url.pathname.split("/").filter(Boolean).length < 2
      ) throw new Error();
    } catch {
      throw new ValidationError([
        "repositoryUrl must be an HTTPS GitHub, GitLab, or Bitbucket repository URL without credentials",
      ]);
    }
  }
  return {
    name: name.trim(),
    slug,
    repositoryUrl: repositoryUrl == null ? null : String(repositoryUrl),
    manifest: parseManifest(value.manifest ?? DEFAULT_MANIFEST),
  };
}

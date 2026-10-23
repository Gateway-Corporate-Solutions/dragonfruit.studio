import { deepStrictEqual, throws } from "node:assert/strict";
import {
  DEFAULT_MANIFEST,
  parseManifest,
  parseProject,
  ValidationError,
} from "../../src/domain/manifest.ts";

Deno.test("manifest rejects traversal, unsafe commands, URLs, and unbounded resources", () => {
  for (
    const patch of [
      { root: "../private" },
      { root: "app/../private" },
      { root: "/etc" },
      { root: "a/./b" },
      {
        tasks: {
          ...DEFAULT_MANIFEST.tasks,
          build: "deno task build; curl evil",
        },
      },
      { http: { port: 8000, readinessPath: "//other-host" } },
      { limits: { ...DEFAULT_MANIFEST.limits, cpu: Infinity } },
      { limits: { ...DEFAULT_MANIFEST.limits, memoryMiB: 99999 } },
      { schemaVersion: 2 },
    ]
  ) {
    throws(
      () => parseManifest({ ...DEFAULT_MANIFEST, ...patch }),
      ValidationError,
    );
  }
});
Deno.test("manifest reconstructs supported fields without accepting extra privileges", () => {
  deepStrictEqual(
    parseManifest({ ...DEFAULT_MANIFEST, privileged: true }),
    DEFAULT_MANIFEST,
  );
});
Deno.test("project validates provider URLs and prevents embedded credentials", () => {
  const input = { name: "Demo", slug: "demo", manifest: DEFAULT_MANIFEST };
  for (
    const repositoryUrl of [
      "file:///etc/passwd",
      "https://token@github.com/a/b",
      "https://localhost/a/b",
      "https://github.com/a/b?token=secret",
      "https://github.com:8443/a/b",
    ]
  ) {
    throws(() => parseProject({ ...input, repositoryUrl }), ValidationError);
  }
  for (const host of ["github.com", "gitlab.com", "bitbucket.org"]) {
    deepStrictEqual(
      parseProject({
        ...input,
        repositoryUrl: "https://" + host + "/owner/app",
      }).manifest,
      DEFAULT_MANIFEST,
    );
  }
});

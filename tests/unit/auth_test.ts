// deno-lint-ignore-file require-await -- Async fetch doubles implement the fetch signature without network I/O.
import { deepStrictEqual, equal, match, rejects } from "node:assert/strict";
import {
  AuthService,
  hashToken,
  POSTMARK_SENDER,
  randomToken,
} from "../../src/auth/service.ts";
import { MemoryAuthStore } from "../../src/auth/store.ts";
import { MemoryStore } from "../../src/storage/memory.ts";
import { ScopedStore } from "../../src/storage/scoped.ts";
import { parseProject } from "../../src/domain/manifest.ts";
import { handleApi } from "../../src/http/api.ts";
import type { Config } from "../../src/config.ts";
const config: Config = {
  devMode: true,
  storage: "memory",
  pollMs: 1000,
  publicOrigin: "http://localhost",
  postmarkToken: "server-secret",
  githubClientId: "client-id",
  githubClientSecret: "github-secret",
};
const post = (
  path: string,
  data: unknown,
  cookie = "",
  origin = "http://localhost",
) =>
  new Request("http://localhost" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie,
    },
    body: JSON.stringify(data),
  });
const cookie = (r: Response) => r.headers.get("set-cookie")!.split(";")[0];
function fixture() {
  const store = new MemoryAuthStore();
  let delivered: Record<string, string> = {};
  let calls = 0;
  const auth = new AuthService(config, store, async (input, init) => {
    calls++;
    equal(String(input), "https://api.postmarkapp.com/email");
    equal(
      (init!.headers as Record<string, string>)["X-Postmark-Server-Token"],
      "server-secret",
    );
    delivered = JSON.parse(String(init!.body));
    return Response.json({ ErrorCode: 0, MessageID: "message" });
  });
  return { store, auth, mail: () => delivered, calls: () => calls };
}
async function emailSignup(
  f: ReturnType<typeof fixture>,
  email = "creator@example.com",
) {
  const start = (await f.auth.handle(
    post("/auth/email/start", { intent: "signup", email }),
  ))!;
  equal(start.status, 200);
  await start.text();
  const token = f.mail().TextBody.match(/#token=([a-f0-9]+)/)![1];
  return { binding: cookie(start), token };
}
Deno.test("Postmark sign-up sends a fixed sender, bounded one-use link and no tracking", async () => {
  const f = fixture();
  await emailSignup(f);
  equal(POSTMARK_SENDER, "info@dragonfruit.studio");
  equal(f.mail().From, POSTMARK_SENDER);
  equal(f.mail().To, "creator@example.com");
  equal(f.mail().TrackLinks, "None");
  equal(f.mail().TrackOpens, false);
  match(
    f.mail().TextBody,
    /http:\/\/localhost\/auth\/email\/verify#token=[a-f0-9]{64}/,
  );
  equal(f.calls(), 1);
});
Deno.test("email delivery failures log safe diagnostics and invalidate the challenge", async () => {
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => logs.push(args);
  try {
    for (const failure of ["rejected", "network", "malformed"]) {
      const store = new MemoryAuthStore();
      const binding = randomToken();
      let token = "";
      const auth = new AuthService(config, store, async (_input, init) => {
        const mail = JSON.parse(String(init!.body));
        token = mail.TextBody.match(/#token=([a-f0-9]+)/)![1];
        if (failure === "network") {
          throw new TypeError("Sensitive transport detail: " + token);
        }
        return failure === "malformed"
          ? new Response("Bad Gateway", { status: 502 })
          : Response.json({
            ErrorCode: 400,
            Message: "Sensitive provider detail: creator@example.com",
          }, { status: 422 });
      });
      const result = (await auth.handle(post(
        "/auth/email/start",
        { email: "creator@example.com", intent: "signup" },
        "df_email=" + binding,
      )))!;
      equal(result.status, 503);
      equal(result.headers.get("set-cookie"), null);
      deepStrictEqual(await result.json(), {
        error: "We could not send the sign-in email. Please try again later.",
      });
      equal(
        await store.consumeChallenge(
          await hashToken(token),
          "email",
          await hashToken(binding),
        ),
        undefined,
      );
      const diagnostics = logs.at(-1)![1];
      deepStrictEqual(diagnostics, {
        provider: "postmark",
        status: failure === "network"
          ? undefined
          : failure === "rejected"
          ? 422
          : 502,
        errorCode: failure === "rejected" ? 400 : undefined,
        error: failure === "network"
          ? "TypeError"
          : failure === "malformed"
          ? "SyntaxError"
          : "Error",
      });
      const serialized = JSON.stringify(logs);
      equal(serialized.includes(token), false);
      equal(serialized.includes("creator@example.com"), false);
      equal(serialized.includes(config.postmarkToken!), false);
    }
    equal(logs.length, 3);
  } finally {
    console.error = originalError;
  }
});
Deno.test("email proof is browser-bound, does not consume on GET, and cannot be replayed", async () => {
  const f = fixture(), { binding, token } = await emailSignup(f);
  equal(
    await f.auth.handle(new Request("http://localhost/auth/email/verify")),
    undefined,
  );
  const wrong = (await f.auth.handle(
    post("/auth/email/complete", { token }, "df_email=" + randomToken()),
  ))!;
  equal(wrong.status, 400);
  await wrong.text();
  const complete =
    (await f.auth.handle(post("/auth/email/complete", { token }, binding)))!;
  equal(complete.status, 200);
  const session = cookie(complete);
  match(complete.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax/);
  await complete.text();
  const user = await f.auth.user(
    new Request("http://localhost/websites", { headers: { Cookie: session } }),
  );
  equal(user!.email, "creator@example.com");
  const again =
    (await f.auth.handle(post("/auth/email/complete", { token }, binding)))!;
  equal(again.status, 400);
  await again.text();
});
Deno.test("expired challenges cannot create accounts and unknown login does not create a user", async () => {
  const f = fixture(), token = randomToken(), binding = randomToken();
  await f.store.putChallenge(await hashToken(token), {
    kind: "email",
    binding: await hashToken(binding),
    expires: Date.now() - 1,
    data: { email: "expired@example.com", intent: "signup" },
  });
  const expired = (await f.auth.handle(
    post("/auth/email/complete", { token }, "df_email=" + binding),
  ))!;
  equal(expired.status, 400);
  await expired.text();
  equal(
    await f.store.resolveUser(
      "email",
      "missing@example.com",
      "missing@example.com",
      "Missing",
      false,
    ),
    undefined,
  );
});
Deno.test("session rotation and logout revoke the previous token", async () => {
  const f = fixture(),
    first = await emailSignup(f),
    r = (await f.auth.handle(
      post("/auth/email/complete", { token: first.token }, first.binding),
    ))!;
  const session1 = cookie(r);
  await r.text();
  const second = await emailSignup(f),
    r2 = (await f.auth.handle(
      post(
        "/auth/email/complete",
        { token: second.token },
        second.binding + "; " + session1,
      ),
    ))!;
  const session2 = cookie(r2);
  await r2.text();
  equal(
    await f.auth.user(
      new Request("http://localhost", { headers: { Cookie: session1 } }),
    ),
    undefined,
  );
  const logout = (await f.auth.handle(post("/auth/logout", {}, session2)))!;
  equal(logout.status, 303);
  match(logout.headers.get("set-cookie")!, /Max-Age=0/);
  equal(
    await f.auth.user(
      new Request("http://localhost", { headers: { Cookie: session2 } }),
    ),
    undefined,
  );
});
Deno.test("auth requests reject cross-origin input, invalid email, provider failures and excessive sends", async () => {
  const f = fixture();
  for (
    const [email, origin, status] of [
      ["valid@example.com", "https://other.test", 403],
      ["a@example.com,other@example.com", "http://localhost", 400],
      ["bad", "http://localhost", 400],
    ] as const
  ) {
    const r =
      (await f.auth.handle(post("/auth/email/start", { email }, "", origin)))!;
    equal(r.status, status);
    await r.text();
  }
  for (let i = 0; i < 6; i++) {
    const r = (await f.auth.handle(
      post("/auth/email/start", {
        email: "limit@example.com",
        intent: "signup",
      }),
    ))!;
    equal(r.status, i < 5 ? 200 : 429);
    await r.text();
  }
  const failed = new AuthService(
    config,
    new MemoryAuthStore(),
    () => Promise.reject(new Error("server-secret")),
  );
  const r = (await failed.handle(
    post("/auth/email/start", { email: "x@example.com" }),
  ))!;
  equal(r.status, 503);
  equal((await r.text()).includes("server-secret"), false);
});
Deno.test("GitHub uses state and PKCE, verified primary email and identity-only scopes", async () => {
  const store = new MemoryAuthStore();
  let requests = 0;
  const auth = new AuthService(config, store, async (input, init) => {
    requests++;
    const url = String(input);
    if (url.includes("access_token")) {
      const body = new URLSearchParams(String(init!.body));
      equal(body.get("client_secret"), "github-secret");
      match(body.get("code_verifier")!, /^[a-f0-9]{64}$/);
      return Response.json({ access_token: "temporary-token" });
    }
    if (url.endsWith("/emails")) {
      return Response.json([{
        email: "github@example.com",
        verified: true,
        primary: true,
      }]);
    }
    return Response.json({ id: 42, name: "GitHub Creator", login: "creator" });
  });
  const start =
      (await auth.handle(post("/auth/github/start", { intent: "signup" })))!,
    binding = cookie(start),
    url = new URL((await start.json()).url);
  equal(url.origin, "https://github.com");
  equal(url.searchParams.get("scope"), "read:user user:email");
  equal(url.searchParams.get("code_challenge_method"), "S256");
  const state = url.searchParams.get("state")!;
  const wrong = (await auth.handle(
    new Request(
      "http://localhost/auth/github/callback?code=code&state=" + state,
      { headers: { Cookie: "df_github=" + randomToken() } },
    ),
  ))!;
  equal(wrong.status, 303);
  equal(requests, 0);
  const callback = (await auth.handle(
    new Request(
      "http://localhost/auth/github/callback?code=code&state=" + state,
      { headers: { Cookie: binding } },
    ),
  ))!;
  equal(callback.headers.get("location"), "/websites");
  const session =
    callback.headers.getSetCookie().find((s) => s.startsWith("df_session="))!
      .split(";")[0];
  equal(
    (await auth.user(
      new Request("http://localhost", { headers: { Cookie: session } }),
    ))!.email,
    "github@example.com",
  );
  equal(requests, 3);
  const replay = (await auth.handle(
    new Request(
      "http://localhost/auth/github/callback?code=code&state=" + state,
      { headers: { Cookie: binding } },
    ),
  ))!;
  match(replay.headers.get("location")!, /github_state/);
  equal(requests, 3);
});
Deno.test("GitHub rejects unverified email and missing configuration fails closed", async () => {
  const auth = new AuthService(
    config,
    new MemoryAuthStore(),
    async (input) =>
      String(input).includes("access_token")
        ? Response.json({ access_token: "token" })
        : String(input).endsWith("/emails")
        ? Response.json([{
          email: "bad@example.com",
          primary: true,
          verified: false,
        }])
        : Response.json({ id: 43, login: "creator" }),
  );
  const start =
      (await auth.handle(post("/auth/github/start", { intent: "signup" })))!,
    binding = cookie(start),
    url = new URL((await start.json()).url);
  const r = (await auth.handle(
    new Request(
      "http://localhost/auth/github/callback?code=code&state=" +
        url.searchParams.get("state"),
      { headers: { Cookie: binding } },
    ),
  ))!;
  match(r.headers.get("location")!, /github_email/);
  const absent = new AuthService({
    ...config,
    postmarkToken: undefined,
    githubClientId: undefined,
    githubClientSecret: undefined,
  }, new MemoryAuthStore());
  equal(
    (await absent.handle(
      post("/auth/email/start", { email: "x@example.com" }),
    ))!.status,
    503,
  );
  equal((await absent.handle(post("/auth/github/start", {})))!.status, 503);
});
Deno.test("production session cookie is host-only, secure and HTTP-only", async () => {
  const auth = new AuthService(
    { ...config, devMode: false, publicOrigin: "https://dragonfruit.studio" },
    new MemoryAuthStore(),
    () => Promise.resolve(Response.json({ ErrorCode: 0 })),
  );
  const r = (await auth.handle(
    new Request("https://dragonfruit.studio/auth/email/start", {
      method: "POST",
      headers: {
        Origin: "https://dragonfruit.studio",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "signup",
        email: "creator@example.com",
      }),
    }),
  ))!;
  match(r.headers.get("set-cookie")!, /^__Host-df_email=/);
  match(r.headers.get("set-cookie")!, /; Secure/);
  equal(r.headers.get("set-cookie")!.includes("Domain="), false);
  await r.text();
});
Deno.test("account identity joins only after email proof; the same verified address shares one account", async () => {
  const s = new MemoryAuthStore(),
    github = await s.resolveUser(
      "github",
      "42",
      "same@example.com",
      "Creator",
      true,
    ),
    email = await s.resolveUser(
      "email",
      "same@example.com",
      "same@example.com",
      "same",
      false,
    );
  equal(github!.id, email!.id);
});
Deno.test("owner-scoped projects, drafts, API tests and jobs never expose another workspace", async () => {
  const base = new MemoryStore(),
    a = new ScopedStore(base, "owner-a"),
    b = new ScopedStore(base, "owner-b");
  const project = await a.createProject(parseProject({ name: "Private idea" }));
  const legacy = await base.createProject(parseProject({ name: "Legacy" }));
  equal((await b.listProjects()).length, 0);
  equal(await b.getProject(project.id), undefined);
  equal(await a.getProject(legacy.id), undefined);
  await rejects(() =>
    b.saveEditor(project.id, 0, project.document!, project.manifest)
  );
  const job = await a.enqueueValidation(project.id, "check");
  equal((await a.listJobs()).length, 1);
  equal((await b.listJobs()).length, 0);
  equal(await b.getJob(job.id), undefined);
  await rejects(() => b.cancel(job.id));
  await rejects(() => b.enqueueValidation(project.id, "stolen"));
  const response = await handleApi(
    post("/api/projects/" + project.id + "/forms/test", {
      document: project.document,
    }),
    b,
  );
  equal(response.status, 404);
  await response.text();
  deepStrictEqual((await a.listProjects()).map((p) => p.id), [project.id]);
});

import type { Config } from "../config.ts";
import type { AuthStore, User } from "./store.ts";
export const POSTMARK_SENDER = "info@dragonfruit.studio";
export const randomToken = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export async function hashToken(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
const tokenPattern = /^[a-f0-9]{64}$/;
const emailPattern = /^[^\s@<>"',;:]{1,64}@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/;
function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k in out) {
      out[k] = "";
      continue;
    }
    out[k] = part.slice(i + 1).trim();
  }
  return out;
}
async function jsonBody(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    throw Error("Invalid request");
  }
  const reader = req.body?.getReader();
  if (!reader) throw Error("Invalid request");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 4096) {
        await reader.cancel();
        throw Error("Invalid request");
      }
      chunks.push(part.value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(result));
  } finally {
    reader.releaseLock();
  }
}
const response = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
export class AuthService {
  constructor(
    readonly config: Config,
    readonly store: AuthStore,
    private fetcher: typeof fetch = fetch,
  ) {}
  private name(kind: string) {
    return (this.config.devMode ? "df_" : "__Host-df_") + kind;
  }
  private cookie(kind: string, value: string, maxAge: number) {
    return this.name(kind) + "=" + value +
      "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAge +
      (this.config.devMode ? "" : "; Secure");
  }
  private origin(req: Request) {
    return this.config.publicOrigin ?? new URL(req.url).origin;
  }
  async user(req: Request): Promise<User | undefined> {
    const raw = cookies(req)[this.name("session")];
    return raw && tokenPattern.test(raw)
      ? await this.store.session(await hashToken(raw))
      : undefined;
  }
  private async signedIn(req: Request, user: User) {
    const old = cookies(req)[this.name("session")];
    if (old && tokenPattern.test(old)) {
      await this.store.revokeSession(await hashToken(old));
    }
    const token = randomToken();
    await this.store.createSession(
      await hashToken(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    return this.cookie("session", token, 7 * 86400);
  }
  private failure(req: Request, code: string) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: this.origin(req) + "/?auth_error=" + code,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  async handle(req: Request): Promise<Response | undefined> {
    const path = new URL(req.url).pathname;
    if (!path.startsWith("/auth/")) return;
    if (
      req.method === "POST" &&
      (req.headers.get("origin") !== this.origin(req) ||
        req.headers.get("sec-fetch-site") === "cross-site")
    ) return response({ error: "Request origin not allowed" }, 403);
    if (path === "/auth/config" && req.method === "GET") {
      return response({
        github: !!this.config.githubClientId &&
          !!this.config.githubClientSecret,
        email: !!this.config.postmarkToken,
        sender: POSTMARK_SENDER,
      });
    }
    if (path === "/auth/logout" && req.method === "POST") {
      const raw = cookies(req)[this.name("session")];
      if (raw && tokenPattern.test(raw)) {
        await this.store.revokeSession(await hashToken(raw));
      }
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": this.cookie("session", "", 0),
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "/auth/email/start" && req.method === "POST") {
      if (!this.config.postmarkToken) {
        return response({ error: "Email sign-in is not configured yet." }, 503);
      }
      let email, intent;
      try {
        const data = await jsonBody(req);
        email = typeof data.email === "string"
          ? data.email.trim().toLowerCase()
          : "";
        intent = data.intent === "signup" ? "signup" : "login";
      } catch {
        return response({ error: "Enter a valid email address." }, 400);
      }
      if (email.length > 254 || !emailPattern.test(email)) {
        return response({ error: "Enter a valid email address." }, 400);
      }
      if (
        !await this.store.allow("email:global", 60, 60000) ||
        !await this.store.allow(
          "email:" + await hashToken(email),
          5,
          15 * 60000,
        )
      ) {
        return response({
          error: "Too many sign-in requests. Please try again later.",
        }, 429);
      }
      const existing = cookies(req)[this.name("email")],
        binding = existing && tokenPattern.test(existing)
          ? existing
          : randomToken(),
        token = randomToken();
      const digest = await hashToken(token);
      await this.store.putChallenge(digest, {
        kind: "email",
        binding: await hashToken(binding),
        expires: Date.now() + 10 * 60000,
        data: { email, intent },
      });
      const link = this.origin(req) + "/auth/email/verify#token=" + token;
      try {
        const sent = await this.fetcher("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Postmark-Server-Token": this.config.postmarkToken,
          },
          body: JSON.stringify({
            From: POSTMARK_SENDER,
            To: email,
            Subject: intent === "signup"
              ? "Create your dragonfruit account"
              : "Your dragonfruit sign-in link",
            TextBody: "Continue to dragonfruit:\n\n" + link +
              "\n\nThis one-use link expires in 10 minutes. Open it in the same browser where you requested it, then choose Continue. If you did not request this email, you can ignore it.",
            TrackOpens: false,
            TrackLinks: "None",
            MessageStream: "outbound",
          }),
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        const result = await sent.json();
        if (!sent.ok || result.ErrorCode !== 0) throw Error("Delivery failed");
      } catch {
        await this.store.consumeChallenge(
          digest,
          "email",
          await hashToken(binding),
        );
        return response({
          error: "We could not send the sign-in email. Please try again later.",
        }, 503);
      }
      const r = response({
        ok: true,
        message:
          "Check your inbox for your one-use sign-in link. It expires in 10 minutes.",
      });
      r.headers.append("Set-Cookie", this.cookie("email", binding, 600));
      return r;
    }
    if (path === "/auth/email/complete" && req.method === "POST") {
      let token;
      try {
        token = (await jsonBody(req)).token;
      } catch {
        return response(
          { error: "This sign-in link is invalid or expired." },
          400,
        );
      }
      const binding = cookies(req)[this.name("email")];
      if (
        typeof token !== "string" || !tokenPattern.test(token) || !binding ||
        !tokenPattern.test(binding)
      ) {
        return response({
          error:
            "Open the latest sign-in link in the same browser where you requested it.",
        }, 400);
      }
      const challenge = await this.store.consumeChallenge(
        await hashToken(token),
        "email",
        await hashToken(binding),
      );
      if (!challenge) {
        return response({
          error:
            "This sign-in link is invalid, expired, or already used. Request a new link.",
        }, 400);
      }
      const { email, intent } = challenge.data,
        user = await this.store.resolveUser(
          "email",
          email,
          email,
          email.split("@")[0],
          intent === "signup",
        );
      if (!user) {
        return response({
          error:
            "No account exists for this address yet. Choose Sign up to create one.",
        }, 400);
      }
      const r = response({ ok: true, redirect: "/websites" });
      r.headers.append("Set-Cookie", await this.signedIn(req, user));
      return r;
    }
    if (path === "/auth/github/start" && req.method === "POST") {
      if (!this.config.githubClientId || !this.config.githubClientSecret) {
        return response(
          { error: "GitHub sign-in is not configured yet." },
          503,
        );
      }
      let intent;
      try {
        intent = (await jsonBody(req)).intent === "signup" ? "signup" : "login";
      } catch {
        return response({ error: "Invalid request" }, 400);
      }
      if (!await this.store.allow("github:global", 120, 60000)) {
        return response({
          error: "Too many sign-in requests. Try again shortly.",
        }, 429);
      }
      const state = randomToken(),
        binding = randomToken(),
        verifier = randomToken();
      const digest = new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
        pkce = btoa(String.fromCharCode(...digest)).replaceAll("+", "-")
          .replaceAll("/", "_").replaceAll("=", "");
      await this.store.putChallenge(await hashToken(state), {
        kind: "github",
        binding: await hashToken(binding),
        expires: Date.now() + 10 * 60000,
        data: { intent, verifier },
      });
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: this.config.githubClientId,
        redirect_uri: this.origin(req) + "/auth/github/callback",
        scope: "read:user user:email",
        state,
        code_challenge: pkce,
        code_challenge_method: "S256",
      }).toString();
      const r = response({ url: url.href });
      r.headers.append("Set-Cookie", this.cookie("github", binding, 600));
      return r;
    }
    if (path === "/auth/github/callback" && req.method === "GET") {
      const url = new URL(req.url),
        state = url.searchParams.get("state"),
        code = url.searchParams.get("code"),
        binding = cookies(req)[this.name("github")];
      if (
        !state || !tokenPattern.test(state) || !binding ||
        !tokenPattern.test(binding)
      ) return this.failure(req, "github_state");
      const challenge = await this.store.consumeChallenge(
        await hashToken(state),
        "github",
        await hashToken(binding),
      );
      if (
        !challenge || !code || code.length > 1000 ||
        !this.config.githubClientSecret || !this.config.githubClientId
      ) return this.failure(req, "github_state");
      try {
        const tokenResponse = await this.fetcher(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: this.config.githubClientId,
              client_secret: this.config.githubClientSecret,
              code,
              code_verifier: challenge.data.verifier,
              redirect_uri: this.origin(req) + "/auth/github/callback",
            }),
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          },
        );
        const access = await tokenResponse.json();
        if (
          !tokenResponse.ok || typeof access.access_token !== "string" ||
          !access.access_token
        ) throw Error("Exchange failed");
        const headers = {
          Authorization: "Bearer " + access.access_token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "dragonfruit-studio",
        };
        const profileResponse = await this.fetcher(
            "https://api.github.com/user",
            { headers, redirect: "error", signal: AbortSignal.timeout(10000) },
          ),
          profile = await profileResponse.json();
        const emailsResponse = await this.fetcher(
            "https://api.github.com/user/emails",
            { headers, redirect: "error", signal: AbortSignal.timeout(10000) },
          ),
          emails = await emailsResponse.json();
        if (
          !profileResponse.ok || !emailsResponse.ok ||
          !Number.isSafeInteger(profile.id) || !Array.isArray(emails)
        ) throw Error("Profile unavailable");
        const verified = emails.find((e) =>
          e.primary === true && e.verified === true &&
          typeof e.email === "string"
        );
        if (
          !verified || verified.email.length > 254 ||
          !emailPattern.test(verified.email)
        ) return this.failure(req, "github_email");
        const email = verified.email.toLowerCase(),
          name = String(profile.name || profile.login || "Creator").slice(
            0,
            120,
          ),
          user = await this.store.resolveUser(
            "github",
            String(profile.id),
            email,
            name,
            challenge.data.intent === "signup",
          );
        if (!user) return this.failure(req, "account_missing");
        const headersOut = new Headers({
          Location: "/websites",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        });
        headersOut.append("Set-Cookie", await this.signedIn(req, user));
        headersOut.append("Set-Cookie", this.cookie("github", "", 0));
        return new Response(null, { status: 303, headers: headersOut });
      } catch {
        return this.failure(req, "github_failed");
      }
    }
    if (path === "/auth/email/verify" && req.method === "GET") return;
    return response({ error: "Not found" }, 404);
  }
}

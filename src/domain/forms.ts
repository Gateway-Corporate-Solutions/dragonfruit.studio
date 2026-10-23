import { ValidationError } from "./manifest.ts";
export type Integration = "preview" | "resend" | "mailchimp" | "webhook";
export interface ApiConnection {
  id: string;
  name: string;
  provider: Integration;
  credentialEnv: string;
  fromEnv: string;
  toEnv: string;
  audienceEnv: string;
  urlEnv: string;
  emailField: string;
  consentField: string;
  subject: string;
  mergeFields: Record<string, string>;
  rateLimit: number;
}
export function newConnection(
  provider: Integration = "preview",
): ApiConnection {
  return {
    id: "api-" + crypto.randomUUID().slice(0, 8),
    name: provider === "preview"
      ? "Preview form"
      : provider === "resend"
      ? "Email notifications"
      : provider === "mailchimp"
      ? "Newsletter signup"
      : "Webhook delivery",
    provider,
    credentialEnv: provider === "mailchimp"
      ? "MAILCHIMP_API_KEY"
      : provider === "webhook"
      ? "WEBHOOK_TOKEN"
      : "RESEND_API_KEY",
    fromEnv: "RESEND_FROM",
    toEnv: "RESEND_TO",
    audienceEnv: "MAILCHIMP_AUDIENCE_ID",
    urlEnv: "WEBHOOK_URL",
    emailField: "email",
    consentField: "consent",
    subject: "New website submission",
    mergeFields: {},
    rateLimit: 30,
  };
}
export function parseConnections(value: unknown): ApiConnection[] {
  if (value === undefined) return [];
  const fail = (s: string): never => {
    throw new ValidationError([s]);
  };
  if (!Array.isArray(value) || value.length > 24) {
    return fail("Use at most 24 API connections");
  }
  const ids = new Set<string>();
  return value.map((v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      return fail("Invalid API connection");
    }
    const c = v as ApiConnection;
    if (
      typeof c.id !== "string" || !/^[a-z][a-z0-9-]{0,70}$/.test(c.id) ||
      ids.has(c.id)
    ) return fail("API IDs must be unique lowercase names");
    ids.add(c.id);
    if (!["preview", "resend", "mailchimp", "webhook"].includes(c.provider)) {
      return fail("Choose a supported integration");
    }
    const d = newConnection(c.provider),
      result = { ...d, id: c.id, provider: c.provider };
    for (
      const k of [
        "name",
        "subject",
        "emailField",
        "consentField",
        "credentialEnv",
        "fromEnv",
        "toEnv",
        "audienceEnv",
        "urlEnv",
      ] as const
    ) {
      const x = c[k] ?? d[k];
      if (typeof x !== "string" || !x.trim() || x.length > 200) {
        return fail("API text must contain 1–200 characters");
      }
      result[k] = x.trim();
    }
    for (
      const k of [
        "credentialEnv",
        "fromEnv",
        "toEnv",
        "audienceEnv",
        "urlEnv",
      ] as const
    ) {
      if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(result[k])) {
        return fail(
          "Store credentials in server environment variables, using names such as RESEND_API_KEY",
        );
      }
    }
    for (const k of ["emailField", "consentField"] as const) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(result[k])) {
        return fail("Choose a valid form field name");
      }
    }
    const mapping = c.mergeFields ?? {};
    if (
      !mapping || typeof mapping !== "object" || Array.isArray(mapping) ||
      Object.keys(mapping).length > 16
    ) return fail("Invalid field mapping");
    result.mergeFields = {};
    for (const [key, field] of Object.entries(mapping)) {
      if (
        !/^[A-Z][A-Z0-9_]{0,19}$/.test(key) || typeof field !== "string" ||
        !/^[a-z][a-z0-9_]{0,39}$/.test(field)
      ) return fail("Merge fields map Mailchimp tags to form field names");
      result.mergeFields[key] = field;
    }
    result.rateLimit = c.rateLimit ?? 30;
    if (
      !Number.isInteger(result.rateLimit) || result.rateLimit < 1 ||
      result.rateLimit > 120
    ) return fail("Rate limit must be 1–120 submissions per minute");
    return result;
  });
}

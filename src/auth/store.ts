// deno-lint-ignore-file require-await -- Memory implementation follows the asynchronous persistence contract.
import type postgres from "postgres";
export interface User {
  id: string;
  email: string;
  name: string;
}
export interface Challenge {
  kind: "email" | "github";
  binding: string;
  data: Record<string, string>;
  expires: number;
}
export interface AuthStore {
  putChallenge(hash: string, value: Challenge): Promise<void>;
  consumeChallenge(
    hash: string,
    kind: string,
    binding: string,
  ): Promise<Challenge | undefined>;
  allow(key: string, limit: number, windowMs: number): Promise<boolean>;
  resolveUser(
    provider: "email" | "github",
    subject: string,
    email: string,
    name: string,
    signup: boolean,
  ): Promise<User | undefined>;
  createSession(hash: string, userId: string, expires: number): Promise<void>;
  session(hash: string): Promise<User | undefined>;
  revokeSession(hash: string): Promise<void>;
}
export class MemoryAuthStore implements AuthStore {
  private challenges = new Map<string, Challenge>();
  private users = new Map<string, User>();
  private identities = new Map<string, string>();
  private sessions = new Map<string, { userId: string; expires: number }>();
  private limits = new Map<string, { count: number; expires: number }>();
  async putChallenge(hash: string, value: Challenge) {
    for (const [key, v] of this.challenges) {
      if (v.expires < Date.now()) this.challenges.delete(key);
    }
    this.challenges.set(hash, structuredClone(value));
  }
  async consumeChallenge(hash: string, kind: string, binding: string) {
    const v = this.challenges.get(hash);
    if (
      !v || v.kind !== kind || v.binding !== binding || v.expires < Date.now()
    ) return;
    this.challenges.delete(hash);
    return structuredClone(v);
  }
  async allow(key: string, limit: number, windowMs: number) {
    for (const [k, v] of this.limits) {
      if (v.expires < Date.now()) this.limits.delete(k);
    }
    const v = this.limits.get(key) ??
      { count: 0, expires: Date.now() + windowMs };
    this.limits.set(key, v);
    return ++v.count <= limit;
  }
  async resolveUser(
    provider: "email" | "github",
    subject: string,
    email: string,
    name: string,
    signup: boolean,
  ) {
    const identity = provider + ":" + subject,
      id = this.identities.get(identity);
    if (id) return structuredClone(this.users.get(id));
    let user = [...this.users.values()].find((u) => u.email === email);
    if (!user && !signup) return;
    user ??= { id: crypto.randomUUID(), email, name };
    this.users.set(user.id, user);
    this.identities.set(identity, user.id);
    return structuredClone(user);
  }
  async createSession(hash: string, userId: string, expires: number) {
    for (const [key, v] of this.sessions) {
      if (v.expires < Date.now()) this.sessions.delete(key);
    }
    this.sessions.set(hash, { userId, expires });
  }
  async session(hash: string) {
    const s = this.sessions.get(hash);
    return s && s.expires > Date.now()
      ? structuredClone(this.users.get(s.userId))
      : undefined;
  }
  async revokeSession(hash: string) {
    this.sessions.delete(hash);
  }
}
export class PostgresAuthStore implements AuthStore {
  constructor(private sql: postgres.Sql) {}
  async putChallenge(hash: string, value: Challenge) {
    await this.sql`DELETE FROM auth_challenges WHERE expires_at<now()`;
    await this.sql`DELETE FROM auth_sessions WHERE expires_at<now()`;
    await this.sql`DELETE FROM auth_rate_limits WHERE expires_at<now()`;
    await this
      .sql`INSERT INTO auth_challenges(token_hash,kind,binding_hash,payload,expires_at) VALUES(${hash},${value.kind},${value.binding},${
      this.sql.json(value.data)
    },${new Date(value.expires)})`;
  }
  async consumeChallenge(hash: string, kind: string, binding: string) {
    const [r] = await this
      .sql`DELETE FROM auth_challenges WHERE token_hash=${hash} AND kind=${kind} AND binding_hash=${binding} AND expires_at>now() RETURNING *`;
    return r
      ? {
        kind: r.kind,
        binding: r.binding_hash,
        data: r.payload,
        expires: new Date(r.expires_at).getTime(),
      } as Challenge
      : undefined;
  }
  async allow(key: string, limit: number, windowMs: number) {
    const [r] = await this
      .sql`INSERT INTO auth_rate_limits(key,count,expires_at) VALUES(${key},1,${new Date(
      Date.now() + windowMs,
    )}) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rate_limits.expires_at<now() THEN 1 ELSE auth_rate_limits.count+1 END, expires_at=CASE WHEN auth_rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END RETURNING count`;
    return Number(r.count) <= limit;
  }
  async resolveUser(
    provider: "email" | "github",
    subject: string,
    email: string,
    name: string,
    signup: boolean,
  ) {
    return await this.sql.begin(async (tx) => {
      // Serialize identity/account creation across concurrent callbacks and providers.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${email},0))`;
      const [identity] =
        await tx`SELECT u.* FROM auth_users u JOIN auth_identities i ON i.user_id=u.id WHERE i.provider=${provider} AND i.subject=${subject}`;
      if (identity) {
        return {
          id: String(identity.id),
          email: String(identity.email),
          name: String(identity.name),
        };
      }
      let [user] = await tx`SELECT * FROM auth_users WHERE email=${email}`;
      if (!user && !signup) return;
      if (!user) {
        [user] =
          await tx`INSERT INTO auth_users(id,email,name) VALUES(${crypto.randomUUID()},${email},${name}) RETURNING *`;
      }
      await tx`INSERT INTO auth_identities(provider,subject,user_id) VALUES(${provider},${subject},${user.id}) ON CONFLICT(provider,subject) DO NOTHING`;
      const [resolved] =
        await tx`SELECT u.* FROM auth_users u JOIN auth_identities i ON i.user_id=u.id WHERE i.provider=${provider} AND i.subject=${subject}`;
      return {
        id: String(resolved.id),
        email: String(resolved.email),
        name: String(resolved.name),
      };
    }) as User | undefined;
  }
  async createSession(hash: string, userId: string, expires: number) {
    await this
      .sql`INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(${hash},${userId},${new Date(
      expires,
    )})`;
  }
  async session(hash: string) {
    const [r] = await this
      .sql`SELECT u.* FROM auth_users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.token_hash=${hash} AND s.expires_at>now()`;
    return r
      ? { id: String(r.id), email: String(r.email), name: String(r.name) }
      : undefined;
  }
  async revokeSession(hash: string) {
    await this.sql`DELETE FROM auth_sessions WHERE token_hash=${hash}`;
  }
}

import postgres from "postgres";

export async function migrate(url: string) {
  const sql = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    const files: string[] = [];
    for await (const entry of Deno.readDir("migrations")) {
      if (/^\d+_.*\.sql$/.test(entry.name)) files.push(entry.name);
    }
    files.sort();
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(734637221)`;
      await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
      for (const file of files) {
        const rows =
          await tx`SELECT name FROM schema_migrations WHERE name = ${file}`;
        if (rows.length) continue;
        await tx.unsafe(await Deno.readTextFile("migrations/" + file));
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
        console.log("Applied", file);
      }
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
if (import.meta.main) {
  const url = Deno.env.get("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is required");
  await migrate(url);
}

import postgres from "postgres";

export type SqlClient = postgres.Sql;

let cachedSql: SqlClient | null = null;

/**
 * Conexao Postgres direta via SUPABASE_DB_URL (ADR-006: schema `finance` fora do PostgREST).
 * `prepare: false` garante compatibilidade com Transaction Pooler (PgBouncer) em producao.
 */
export function getSql(): SqlClient {
  if (cachedSql) return cachedSql;

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    throw new Error("SUPABASE_DB_URL nao configurada");
  }

  cachedSql = postgres(dbUrl, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  return cachedSql;
}

/** Comparacao de segredos em tempo constante para x-app-key e WEBHOOK_TOKEN. */
export function timingSafeEqualStr(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) return false;

  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

/** Serializa qualquer valor JS para parametro `::jsonb` usando `sql.json` (sem dupla codificacao). */
export function toJsonb(
  sql: Pick<SqlClient, "json">,
  value: unknown,
): postgres.Parameter | null {
  if (value === null || value === undefined) return null;
  return sql.json(value as postgres.JSONValue);
}

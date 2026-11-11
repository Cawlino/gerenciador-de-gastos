import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { inferSimilarCriteria, type MatchType } from "../_shared/categorize.ts";
import { getSql, timingSafeEqualStr, toJsonb } from "../_shared/db.ts";
import { PluggyApiError, PluggyClient } from "../_shared/pluggy.ts";
import {
  ConnectTokenRequestSchema,
  CreateRuleSchema,
  PatchTransactionSchema,
  RegisterItemRequestSchema,
  SyncRequestSchema,
  UpdateSettingsSchema,
} from "../_shared/schemas.ts";
import { syncItem } from "../_shared/sync.ts";

const api = new Hono();

api.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-app-key", "Authorization"],
  }),
);

api.get("/health", (c) => c.json({ ok: true, service: "gastos-api" }));

// Autenticacao obrigatoria por x-app-key em todas as demais rotas
api.use("*", async (c, next) => {
  const path = c.req.path;
  if (path === "/health" || path === "/api/health" || c.req.method === "OPTIONS") {
    return await next();
  }

  const expectedKey = Deno.env.get("APP_KEY") ?? "";
  const providedKey = c.req.header("x-app-key");
  if (!expectedKey || !timingSafeEqualStr(providedKey, expectedKey)) {
    return c.json({ error: "unauthorized", message: "x-app-key invalida ou ausente" }, 401);
  }
  return await next();
});

api.get("/dashboard", async (c) => {
  const month = c.req.query("month") ?? null;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return c.json({ error: "invalid_month", message: "Parametro month deve ser YYYY-MM" }, 400);
  }

  const sql = getSql();
  const [row] = await sql<{ data: unknown }[]>`
    SELECT finance.dashboard(${month}) AS data
  `;
  return c.json(row?.data ?? {});
});

api.get("/transactions", async (c) => {
  const month = c.req.query("month") ?? null;
  const type = c.req.query("type") ?? "all"; // all | income | expense | excluded
  const accountId = c.req.query("accountId") ?? null;
  const categoryId = c.req.query("categoryId") ?? null;
  const q = c.req.query("q")?.trim() ?? null;
  const includeExcluded = c.req.query("includeExcluded") !== "false";
  const limitRaw = Number(c.req.query("limit") ?? "100");
  const offsetRaw = Number(c.req.query("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 100;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return c.json({ error: "invalid_month", message: "Parametro month deve ser YYYY-MM" }, 400);
  }

  const sql = getSql();
  const searchPattern = q ? `%${q}%` : null;

  const rows = await sql`
    SELECT
      id, account_id, account_name, account_type, account_subtype,
      occurred_at, occurred_date_sp::text AS occurred_date_sp, month_sp,
      description, description_raw, amount_raw::float8 AS amount_raw, amount_norm::float8 AS amount_norm,
      pluggy_type, operation_type, status, is_pending, kind, paired_tx_id,
      pluggy_category_id, rule_category_id, manual_category_id,
      effective_category_id, category_name_pt, category_group_id, category_group_name_pt,
      category_group_color, effective_excluded, manual_excluded,
      counterparty_name, counterparty_doc, merchant_name, merchant_cnpj,
      credit_card_metadata
    FROM finance.v_transactions_effective
    WHERE (${month}::text IS NULL OR month_sp = ${month})
      AND (${accountId}::uuid IS NULL OR account_id = ${accountId}::uuid)
      AND (${categoryId}::text IS NULL OR effective_category_id = ${categoryId} OR category_group_id = ${categoryId})
      AND (${searchPattern}::text IS NULL OR description ILIKE ${searchPattern} OR COALESCE(merchant_name, '') ILIKE ${searchPattern} OR COALESCE(counterparty_name, '') ILIKE ${searchPattern})
      AND (
        (${type} = 'all' AND (${includeExcluded} OR NOT effective_excluded))
        OR (${type} = 'income' AND NOT effective_excluded AND amount_norm > 0 AND kind <> 'refund')
        OR (${type} = 'expense' AND NOT effective_excluded AND (amount_norm < 0 OR kind = 'refund'))
        OR (${type} = 'excluded' AND effective_excluded)
      )
    ORDER BY occurred_at DESC, id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return c.json({ results: rows, limit, offset });
});

api.get("/transactions/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getSql();
  const [row] = await sql`
    SELECT
      id, account_id, account_name, account_type, account_subtype,
      occurred_at, occurred_date_sp::text AS occurred_date_sp, month_sp,
      description, description_raw, description_norm,
      amount_raw::float8 AS amount_raw, amount_norm::float8 AS amount_norm,
      pluggy_type, operation_type, status, is_pending, kind, paired_tx_id,
      pluggy_category_id, rule_category_id, manual_category_id,
      effective_category_id, category_name_pt, category_group_id, category_group_name_pt,
      category_group_color, effective_excluded, manual_excluded,
      counterparty_name, counterparty_doc, merchant_name, merchant_cnpj,
      payment_data, merchant_data, credit_card_metadata, updated_at
    FROM finance.v_transactions_effective
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!row) {
    return c.json({ error: "not_found", message: "Transacao nao encontrada" }, 404);
  }
  return c.json(row);
});

api.patch("/transactions/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = PatchTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const sql = getSql();
  const [existing] = await sql<{
    id: string;
    description: string;
    description_norm: string;
    merchant_cnpj: string | null;
    counterparty_doc: string | null;
    merchant_name: string | null;
    counterparty_name: string | null;
  }[]>`
    SELECT id, description, description_norm, merchant_cnpj, counterparty_doc, merchant_name, counterparty_name
    FROM finance.transactions
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!existing) {
    return c.json({ error: "not_found", message: "Transacao nao encontrada" }, 404);
  }

  if (parsed.data.categoryId) {
    const [cat] = await sql<{ id: string }[]>`
      SELECT id FROM finance.categories WHERE id = ${parsed.data.categoryId} LIMIT 1
    `;
    if (!cat) {
      return c.json({ error: "invalid_category", message: "Categoria inexistente" }, 400);
    }
  }

  if (parsed.data.categoryId !== undefined) {
    await sql`
      UPDATE finance.transactions
      SET manual_category_id = ${parsed.data.categoryId}
      WHERE id = ${id}
    `;
  }

  if (parsed.data.excluded !== undefined) {
    await sql`
      UPDATE finance.transactions
      SET manual_excluded = ${parsed.data.excluded}
      WHERE id = ${id}
    `;
  }

  let ruleCreated: { id: string; matchType: MatchType; matchValue: string } | null = null;
  let affectedSimilarCount = 0;

  if (parsed.data.applyToSimilar && parsed.data.categoryId) {
    const criteria = inferSimilarCriteria(
      {
        merchantCnpj: existing.merchant_cnpj,
        counterpartyDoc: existing.counterparty_doc,
        descriptionNorm: existing.description_norm,
        description: existing.description,
      },
      parsed.data.matchType,
    );

    if (criteria) {
      const label = existing.merchant_name || existing.counterparty_name || existing.description.slice(0, 60);
      const [rule] = await sql<{ id: string }[]>`
        INSERT INTO finance.categorization_rules (match_type, match_value, category_id, label, active)
        VALUES (${criteria.matchType}, ${criteria.matchValue}, ${parsed.data.categoryId}, ${label}, true)
        ON CONFLICT (match_type, match_value) DO UPDATE SET
          category_id = EXCLUDED.category_id,
          label = EXCLUDED.label,
          active = true
        RETURNING id
      `;

      if (rule?.id) {
        const [applied] = await sql<{ count: number }[]>`
          SELECT finance.apply_rule_to_transactions(${rule.id}::uuid) AS count
        `;
        affectedSimilarCount = Number(applied?.count ?? 0);
        ruleCreated = { id: rule.id, matchType: criteria.matchType, matchValue: criteria.matchValue };
      }
    }
  }

  const [updated] = await sql`
    SELECT
      id, account_id, account_name, account_type, occurred_at, occurred_date_sp::text AS occurred_date_sp,
      month_sp, description, amount_raw::float8 AS amount_raw, amount_norm::float8 AS amount_norm,
      status, is_pending, kind, effective_category_id, category_name_pt, category_group_id,
      category_group_name_pt, effective_excluded, manual_category_id, manual_excluded
    FROM finance.v_transactions_effective
    WHERE id = ${id}
    LIMIT 1
  `;

  return c.json({
    transaction: updated,
    ruleCreated,
    affectedSimilarCount,
  });
});

api.get("/categories", async (c) => {
  const sql = getSql();
  const rows = await sql`
    SELECT id, description, description_pt, parent_id, color, icon, group_id, group_name_pt, group_color, depth
    FROM finance.v_categories_resolved
    ORDER BY id ASC
  `;
  return c.json({ results: rows });
});

api.get("/rules", async (c) => {
  const sql = getSql();
  const rows = await sql`
    SELECT
      r.id, r.match_type, r.match_value, r.category_id, r.priority, r.label, r.active, r.created_at,
      c.description_pt AS category_name_pt
    FROM finance.categorization_rules r
    JOIN finance.categories c ON c.id = r.category_id
    ORDER BY r.priority ASC, r.created_at DESC
  `;
  return c.json({ results: rows });
});

api.post("/rules", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const sql = getSql();
  const [rule] = await sql<{ id: string }[]>`
    INSERT INTO finance.categorization_rules (match_type, match_value, category_id, label, active)
    VALUES (
      ${parsed.data.matchType},
      ${parsed.data.matchValue},
      ${parsed.data.categoryId},
      ${parsed.data.label ?? null},
      true
    )
    ON CONFLICT (match_type, match_value) DO UPDATE SET
      category_id = EXCLUDED.category_id,
      label = EXCLUDED.label,
      active = true
    RETURNING id
  `;

  const [applied] = await sql<{ count: number }[]>`
    SELECT finance.apply_rule_to_transactions(${rule.id}::uuid) AS count
  `;

  return c.json({ id: rule.id, affectedCount: Number(applied?.count ?? 0) }, 201);
});

api.delete("/rules/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getSql();
  const deleted = await sql<{ id: string }[]>`
    DELETE FROM finance.categorization_rules WHERE id = ${id}::uuid RETURNING id
  `;
  if (deleted.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ deleted: true, id });
});

api.get("/settings", async (c) => {
  const sql = getSql();
  const rows = await sql<{ key: string; value: unknown }[]>`
    SELECT key, value FROM finance.app_settings ORDER BY key ASC
  `;
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  return c.json({ settings });
});

api.patch("/settings", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const sql = getSql();
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    await sql`
      INSERT INTO finance.app_settings (key, value)
      VALUES (${key}, ${toJsonb(sql, value)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }

  const rows = await sql<{ key: string; value: unknown }[]>`
    SELECT key, value FROM finance.app_settings ORDER BY key ASC
  `;
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  return c.json({ settings });
});

api.get("/items", async (c) => {
  const sql = getSql();
  const items = await sql`
    SELECT
      id, connector_id, connector_name, connector_color, status, execution_status,
      error_code, error_message, consent_expires_at, last_updated_at, last_synced_at, next_auto_sync_at
    FROM finance.items
    ORDER BY last_synced_at DESC NULLS LAST, updated_at DESC
  `;
  const accounts = await sql`
    SELECT
      id, item_id, type, subtype, name, marketing_name, number_masked,
      balance::float8 AS balance, currency_code, credit_data, updated_at
    FROM finance.accounts
    ORDER BY type ASC, name ASC
  `;
  const syncRuns = await sql`
    SELECT id, item_id, trigger, status, fetched_count, upserted_count, paired_count, error_message, started_at, finished_at
    FROM finance.sync_runs
    ORDER BY started_at DESC
    LIMIT 10
  `;
  return c.json({ items, accounts, syncRuns });
});

api.post("/items/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterItemRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const sql = getSql();
  const pluggy = PluggyClient.fromEnv();

  if (parsed.data.sync) {
    const result = await syncItem(sql, pluggy, {
      itemId: parsed.data.itemId,
      trigger: "manual",
      fullSync: true,
      dateFrom: parsed.data.dateFrom,
    });
    return c.json({ registered: true, sync: result }, 201);
  }

  const item = await pluggy.getItem(parsed.data.itemId);
  await sql`
    INSERT INTO finance.items (
      id, connector_id, connector_name, connector_color, status, execution_status,
      error_code, error_message, consent_expires_at, last_updated_at, next_auto_sync_at, raw
    )
    VALUES (
      ${item.id}, ${item.connector?.id ?? null}, ${item.connector?.name ?? null}, ${item.connector?.primaryColor ?? null},
      ${item.status}, ${item.executionStatus ?? null}, ${item.error?.code ?? null}, ${item.error?.message ?? null},
      ${item.consentExpiresAt ?? null}, ${item.lastUpdatedAt ?? null}, ${item.nextAutoSyncAt ?? null}, ${toJsonb(sql, item)}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      execution_status = EXCLUDED.execution_status,
      consent_expires_at = EXCLUDED.consent_expires_at,
      last_updated_at = EXCLUDED.last_updated_at,
      raw = EXCLUDED.raw
  `;
  return c.json({ registered: true, itemId: item.id }, 201);
});

api.post("/sync", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = SyncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const sql = getSql();
  let itemId = parsed.data.itemId;
  if (!itemId) {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM finance.items ORDER BY last_synced_at DESC NULLS LAST LIMIT 1
    `;
    itemId = row?.id || Deno.env.get("PLUGGY_ITEM_ID") || undefined;
  }

  if (!itemId) {
    return c.json({ error: "missing_item", message: "Nenhum item conectado ainda" }, 400);
  }

  const pluggy = PluggyClient.fromEnv();
  const result = await syncItem(sql, pluggy, {
    itemId,
    trigger: parsed.data.trigger,
    refresh: parsed.data.refresh,
    fullSync: parsed.data.fullSync,
    dateFrom: parsed.data.dateFrom,
  });

  return c.json({ ok: true, sync: result });
});

api.post("/connect-token", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = ConnectTokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const sql = getSql();
  let itemId = parsed.data.itemId;
  if (!itemId) {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM finance.items ORDER BY last_synced_at DESC NULLS LAST LIMIT 1
    `;
    itemId = row?.id || undefined;
  }

  const pluggy = PluggyClient.fromEnv();
  const token = await pluggy.createConnectToken({
    itemId,
    clientUserId: parsed.data.clientUserId,
    webhookUrl: parsed.data.webhookUrl,
  });

  return c.json(token);
});

api.onError((err, c) => {
  console.error("API unhandled error:", err instanceof Error ? err.message : String(err));
  if (err instanceof PluggyApiError) {
    return c.json({ error: "pluggy_error", status: err.status, message: err.message }, 502);
  }
  return c.json({ error: "internal_error", message: err instanceof Error ? err.message : "Erro interno" }, 500);
});

const rootApp = new Hono();
rootApp.route("/api", api);
rootApp.route("/", api);

Deno.serve(rootApp.fetch);

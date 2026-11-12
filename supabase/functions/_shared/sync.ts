import { toJsonb, type SqlClient } from "./db.ts";
import { matchCategorizationRule, type CategorizationRule } from "./categorize.ts";
import { PluggyClient } from "./pluggy.ts";
import {
  applyBillPairingAndRefunds,
  normalizePluggyTransaction,
  type AccountType,
  type NormalizedTransaction,
} from "./rules.ts";
import type { PluggyCategory } from "./schemas.ts";

export interface SyncOptions {
  itemId: string;
  trigger?: "manual" | "pull_to_refresh" | "webhook" | "cron";
  refresh?: boolean;
  fullSync?: boolean;
  dateFrom?: string;
}

export interface SyncResult {
  itemId: string;
  syncRunId: string;
  accountsSynced: number;
  categoriesSynced: number;
  fetchedCount: number;
  upsertedCount: number;
  pairedCount: number;
  lastSyncedAt: string;
}

function maskAccountNumber(num?: string | null): string | null {
  if (!num) return null;
  const trimmed = num.trim();
  if (trimmed.length <= 4) return trimmed;
  return `****${trimmed.slice(-4)}`;
}

function defaultDateFrom(fullSync: boolean): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (fullSync ? 365 : 14));
  return d.toISOString().slice(0, 10);
}

function sortCategoriesParentsFirst(cats: PluggyCategory[]): PluggyCategory[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const depthOf = (cat: PluggyCategory): number => {
    let depth = 0;
    let cur: PluggyCategory | undefined = cat;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      depth += 1;
      cur = byId.get(cur.parentId);
    }
    return depth;
  };
  return cats.slice().sort((a, b) => depthOf(a) - depthOf(b) || a.id.localeCompare(b.id));
}

async function upsertCategories(sql: SqlClient, cats: PluggyCategory[]): Promise<Set<string>> {
  if (cats.length > 0) {
    const sorted = sortCategoriesParentsFirst(cats);
    const payload = sorted.map((c) => ({
      id: c.id,
      description: c.description,
      description_pt: c.descriptionTranslated ?? c.description,
      parent_id: c.parentId ?? null,
      parent_description: c.parentDescription ?? null,
    }));

    // Passo 1 em lote: garante todos os IDs antes de vincular parent_id
    await sql`
      INSERT INTO finance.categories (id, description, description_pt, parent_id, parent_description)
      SELECT r.id, r.description, r.description_pt, NULL, r.parent_description
      FROM jsonb_to_recordset(${toJsonb(sql, payload)}::jsonb) AS r(
        id text,
        description text,
        description_pt text,
        parent_id text,
        parent_description text
      )
      ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        description_pt = EXCLUDED.description_pt,
        parent_description = EXCLUDED.parent_description
    `;

    // Passo 2 em lote: atualiza hierarquia parent_id sem round-trips por linha
    await sql`
      UPDATE finance.categories AS c
      SET parent_id = CASE
        WHEN r.parent_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM finance.categories p WHERE p.id = r.parent_id)
        THEN r.parent_id
        ELSE NULL
      END
      FROM jsonb_to_recordset(${toJsonb(sql, payload)}::jsonb) AS r(
        id text,
        parent_id text
      )
      WHERE c.id = r.id
    `;
  }

  const rows = await sql<{ id: string }[]>`SELECT id FROM finance.categories`;
  return new Set(rows.map((r) => r.id));
}

/**
 * Sincronizacao idempotente completa de um Item da Pluggy para o schema `finance`:
 * 1. Sincroniza /categories (R8)
 * 2. Busca (e opcionalmente dispara PATCH refresh em) /items/:id
 * 3. Sincroniza /accounts (saldo conta + creditData GOLD para R10)
 * 4. Busca /v2/transactions com paginacao por cursor `next`
 * 5. Aplica regras R1..R6, pareamento R2/estorno R3 (inclusive contra base recente) e regras R9
 * 6. Upsert idempotente preservando `manual_category_id` e `manual_excluded` (R7, R9)
 */
export async function syncItem(
  sql: SqlClient,
  pluggy: PluggyClient,
  opts: SyncOptions,
): Promise<SyncResult> {
  const trigger = opts.trigger ?? "manual";
  const effectiveDateFrom = opts.dateFrom ?? defaultDateFrom(Boolean(opts.fullSync));

  // Garante registro do item antes de abrir sync_run (FK em sync_runs.item_id)
  if (opts.refresh) {
    await pluggy.refreshItem(opts.itemId).catch((err) => {
      console.warn("PATCH /items warning (continuing with GET):", err instanceof Error ? err.message : String(err));
    });
  }

  const item = await pluggy.getItem(opts.itemId);
  await sql`
    INSERT INTO finance.items (
      id, connector_id, connector_name, connector_color, status, execution_status,
      error_code, error_message, consent_expires_at, last_updated_at, next_auto_sync_at, raw
    )
    VALUES (
      ${item.id},
      ${item.connector?.id ?? null},
      ${item.connector?.name ?? null},
      ${item.connector?.primaryColor ?? null},
      ${item.status},
      ${item.executionStatus ?? null},
      ${item.error?.code ?? null},
      ${item.error?.message ?? null},
      ${item.consentExpiresAt ?? null},
      ${item.lastUpdatedAt ?? null},
      ${item.nextAutoSyncAt ?? null},
      ${toJsonb(sql, item)}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      connector_id = COALESCE(EXCLUDED.connector_id, finance.items.connector_id),
      connector_name = COALESCE(EXCLUDED.connector_name, finance.items.connector_name),
      connector_color = COALESCE(EXCLUDED.connector_color, finance.items.connector_color),
      status = EXCLUDED.status,
      execution_status = EXCLUDED.execution_status,
      error_code = EXCLUDED.error_code,
      error_message = EXCLUDED.error_message,
      consent_expires_at = EXCLUDED.consent_expires_at,
      last_updated_at = EXCLUDED.last_updated_at,
      next_auto_sync_at = EXCLUDED.next_auto_sync_at,
      raw = EXCLUDED.raw
  `;

  const [runRow] = await sql<{ id: string }[]>`
    INSERT INTO finance.sync_runs (item_id, trigger, status)
    VALUES (${item.id}, ${trigger}, 'running')
    RETURNING id
  `;

  try {
    const categories = await pluggy.getCategories();
    const knownCategoryIds = await upsertCategories(sql, categories);

    const accounts = await pluggy.getAccounts(item.id);
    for (const acc of accounts) {
      await sql`
        INSERT INTO finance.accounts (
          id, item_id, type, subtype, name, marketing_name, number_masked,
          balance, currency_code, bank_data, credit_data
        )
        VALUES (
          ${acc.id},
          ${acc.itemId},
          ${acc.type},
          ${acc.subtype},
          ${acc.name},
          ${acc.marketingName ?? null},
          ${maskAccountNumber(acc.number)},
          ${acc.balance},
          ${acc.currencyCode},
          ${toJsonb(sql, acc.bankData)}::jsonb,
          ${toJsonb(sql, acc.creditData)}::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type,
          subtype = EXCLUDED.subtype,
          name = EXCLUDED.name,
          marketing_name = EXCLUDED.marketing_name,
          number_masked = EXCLUDED.number_masked,
          balance = EXCLUDED.balance,
          currency_code = EXCLUDED.currency_code,
          bank_data = EXCLUDED.bank_data,
          credit_data = EXCLUDED.credit_data
      `;
    }

    const rawTxs: Array<{ accType: AccountType; raw: Awaited<ReturnType<PluggyClient["listTransactionsV2"]>>[number] }> = [];
    for (const acc of accounts) {
      const list = await pluggy.listTransactionsV2({
        accountId: acc.id,
        dateFrom: effectiveDateFrom,
      });
      for (const tx of list) {
        rawTxs.push({ accType: acc.type, raw: tx });
      }
    }

    const incoming: NormalizedTransaction[] = rawTxs.map(({ accType, raw }) => {
      const norm = normalizePluggyTransaction(raw, accType);
      if (norm.pluggyCategoryId && !knownCategoryIds.has(norm.pluggyCategoryId)) {
        norm.pluggyCategoryId = "99999999";
      }
      return norm;
    });

    // Carrega configuracoes R2 e regras ativas R9
    const settingRows = await sql<{ key: string; value: unknown }[]>`
      SELECT key, value FROM finance.app_settings
      WHERE key IN ('bill_match_window_days', 'bill_match_tolerance')
    `;
    const settingsMap = new Map(settingRows.map((r) => [r.key, Number(r.value)]));
    const windowDays = Number.isFinite(settingsMap.get("bill_match_window_days"))
      ? Number(settingsMap.get("bill_match_window_days"))
      : 5;
    const tolerance = Number.isFinite(settingsMap.get("bill_match_tolerance"))
      ? Number(settingsMap.get("bill_match_tolerance"))
      : 0.01;

    const ruleRows = await sql<{
      id: string;
      match_type: CategorizationRule["matchType"];
      match_value: string;
      category_id: string;
      priority: number;
      active: boolean;
    }[]>`
      SELECT id, match_type, match_value, category_id, priority, active
      FROM finance.categorization_rules
      WHERE active = true
    `;
    const rules: CategorizationRule[] = ruleRows.map((r) => ({
      id: r.id,
      matchType: r.match_type,
      matchValue: r.match_value,
      categoryId: r.category_id,
      priority: r.priority,
      active: r.active,
    }));

    // Inclui candidatas recentes ja persistidas para pareamento R2 entre syncs incrementais
    const incomingIds = new Set(incoming.map((t) => t.id));
    const incomingList = Array.from(incomingIds);
    const existingCandidates = await sql<{
      id: string;
      account_id: string;
      account_type: AccountType;
      occurred_at: string;
      occurred_date_sp: string;
      month_sp: string;
      description: string;
      description_norm: string;
      amount_raw: string;
      amount_norm: string;
      pluggy_type: "DEBIT" | "CREDIT";
      operation_type: string | null;
      status: "PENDING" | "POSTED";
      kind: NormalizedTransaction["kind"];
      excluded: boolean;
      paired_tx_id: string | null;
      pluggy_category_id: string | null;
    }[]>`
      SELECT
        t.id, t.account_id, a.type AS account_type, t.occurred_at::text, t.occurred_date_sp::text,
        t.month_sp, t.description, t.description_norm, t.amount_raw::text, t.amount_norm::text,
        t.pluggy_type, t.operation_type, t.status, t.kind, t.excluded, t.paired_tx_id, t.pluggy_category_id
      FROM finance.transactions t
      JOIN finance.accounts a ON a.id = t.account_id
      WHERE a.item_id = ${item.id}
        AND t.occurred_at >= (${effectiveDateFrom}::date - (${windowDays} || ' days')::interval)
        AND (t.paired_tx_id IS NULL OR t.paired_tx_id IN ${sql(incomingList.length ? incomingList : ["__none__"])})
        AND (
          (a.type = 'BANK' AND t.pluggy_type = 'DEBIT' AND t.kind IN ('normal', 'bill_payment'))
          OR (a.type = 'CREDIT' AND t.pluggy_type = 'CREDIT')
        )
    `;

    const existingStubs: NormalizedTransaction[] = existingCandidates
      .filter((r) => !incomingIds.has(r.id))
      .map((r) => ({
        id: r.id,
        accountId: r.account_id,
        accountType: r.account_type,
        occurredAt: r.occurred_at,
        occurredDateSp: r.occurred_date_sp.slice(0, 10),
        monthSp: r.month_sp,
        description: r.description,
        descriptionRaw: null,
        descriptionNorm: r.description_norm,
        amountRaw: Number(r.amount_raw),
        amountNorm: Number(r.amount_norm),
        pluggyType: r.pluggy_type,
        operationType: r.operation_type,
        status: r.status,
        kind: r.paired_tx_id && incomingIds.has(r.paired_tx_id) ? "normal" : r.kind,
        excluded: r.paired_tx_id && incomingIds.has(r.paired_tx_id) ? false : r.excluded,
        pairedTxId: r.paired_tx_id && incomingIds.has(r.paired_tx_id) ? null : r.paired_tx_id,
        pluggyCategoryId: r.pluggy_category_id,
        counterpartyName: null,
        counterpartyDoc: null,
        merchantName: null,
        merchantCnpj: null,
        providerId: null,
        currencyCode: "BRL",
        paymentData: null,
        merchantData: null,
        creditCardMetadata: null,
        raw: {},
      }));

    const mergedForPairing = [...incoming, ...existingStubs];
    const { pairedCount } = applyBillPairingAndRefunds(mergedForPairing, { windowDays, tolerance });

    const preparedIncoming = incoming.map((n) => {
      const matchedRule = matchCategorizationRule(n, rules);
      return {
        id: n.id,
        account_id: n.accountId,
        occurred_at: n.occurredAt,
        occurred_date_sp: n.occurredDateSp,
        month_sp: n.monthSp,
        description: n.description,
        description_raw: n.descriptionRaw ?? null,
        description_norm: n.descriptionNorm,
        amount_raw: n.amountRaw,
        amount_norm: n.amountNorm,
        pluggy_type: n.pluggyType,
        operation_type: n.operationType ?? null,
        status: n.status,
        kind: n.kind,
        excluded: n.excluded,
        pluggy_category_id: n.pluggyCategoryId ?? null,
        rule_category_id: matchedRule ? matchedRule.categoryId : null,
        counterparty_name: n.counterpartyName ?? null,
        counterparty_doc: n.counterpartyDoc ?? null,
        merchant_name: n.merchantName ?? null,
        merchant_cnpj: n.merchantCnpj ?? null,
        provider_id: n.providerId ?? null,
        currency_code: n.currencyCode,
        payment_data: n.paymentData ?? null,
        merchant_data: n.merchantData ?? null,
        credit_card_metadata: n.creditCardMetadata ?? null,
        raw: n.raw ?? {},
      };
    });

    const pairedRows = mergedForPairing
      .filter((n) => Boolean(n.pairedTxId))
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        excluded: n.excluded,
        paired_tx_id: n.pairedTxId,
      }));

    await sql.begin(async (txSql) => {
      // Passo 1 em lotes: evita centenas de round-trips individuais no pooler em syncs de 12 meses.
      // CRITICO (R9): NUNCA sobrescreve `manual_category_id` nem `manual_excluded`.
      const BATCH_SIZE = 80;
      for (let i = 0; i < preparedIncoming.length; i += BATCH_SIZE) {
        const batch = preparedIncoming.slice(i, i + BATCH_SIZE);
        await txSql`
          INSERT INTO finance.transactions (
            id, account_id, occurred_at, occurred_date_sp, month_sp,
            description, description_raw, description_norm,
            amount_raw, amount_norm, pluggy_type, operation_type, status,
            kind, excluded, paired_tx_id,
            pluggy_category_id, rule_category_id,
            counterparty_name, counterparty_doc, merchant_name, merchant_cnpj,
            provider_id, currency_code, payment_data, merchant_data, credit_card_metadata, raw
          )
          SELECT
            r.id, r.account_id, r.occurred_at, r.occurred_date_sp, r.month_sp,
            r.description, r.description_raw, r.description_norm,
            r.amount_raw, r.amount_norm, r.pluggy_type, r.operation_type, r.status,
            r.kind, r.excluded, NULL,
            r.pluggy_category_id, r.rule_category_id,
            r.counterparty_name, r.counterparty_doc, r.merchant_name, r.merchant_cnpj,
            r.provider_id, r.currency_code, r.payment_data, r.merchant_data, r.credit_card_metadata, r.raw
          FROM jsonb_to_recordset(${toJsonb(txSql, batch)}::jsonb) AS r(
            id text,
            account_id uuid,
            occurred_at timestamptz,
            occurred_date_sp date,
            month_sp text,
            description text,
            description_raw text,
            description_norm text,
            amount_raw numeric(14,2),
            amount_norm numeric(14,2),
            pluggy_type text,
            operation_type text,
            status text,
            kind text,
            excluded boolean,
            pluggy_category_id text,
            rule_category_id text,
            counterparty_name text,
            counterparty_doc text,
            merchant_name text,
            merchant_cnpj text,
            provider_id text,
            currency_code text,
            payment_data jsonb,
            merchant_data jsonb,
            credit_card_metadata jsonb,
            raw jsonb
          )
          ON CONFLICT (id) DO UPDATE SET
            account_id = EXCLUDED.account_id,
            occurred_at = EXCLUDED.occurred_at,
            description = EXCLUDED.description,
            description_raw = EXCLUDED.description_raw,
            amount_raw = EXCLUDED.amount_raw,
            amount_norm = EXCLUDED.amount_norm,
            pluggy_type = EXCLUDED.pluggy_type,
            operation_type = EXCLUDED.operation_type,
            status = EXCLUDED.status,
            kind = EXCLUDED.kind,
            excluded = EXCLUDED.excluded,
            pluggy_category_id = EXCLUDED.pluggy_category_id,
            rule_category_id = COALESCE(EXCLUDED.rule_category_id, finance.transactions.rule_category_id),
            counterparty_name = EXCLUDED.counterparty_name,
            counterparty_doc = EXCLUDED.counterparty_doc,
            merchant_name = EXCLUDED.merchant_name,
            merchant_cnpj = EXCLUDED.merchant_cnpj,
            provider_id = EXCLUDED.provider_id,
            currency_code = EXCLUDED.currency_code,
            payment_data = EXCLUDED.payment_data,
            merchant_data = EXCLUDED.merchant_data,
            credit_card_metadata = EXCLUDED.credit_card_metadata,
            raw = EXCLUDED.raw
        `;
      }

      // Passo 2 em lote: atualiza pareamentos R2/R3 agora que todas as transacoes existem
      for (let i = 0; i < pairedRows.length; i += BATCH_SIZE) {
        const pairBatch = pairedRows.slice(i, i + BATCH_SIZE);
        await txSql`
          UPDATE finance.transactions AS t
          SET kind = u.kind, excluded = u.excluded, paired_tx_id = u.paired_tx_id
          FROM jsonb_to_recordset(${toJsonb(txSql, pairBatch)}::jsonb) AS u(
            id text,
            kind text,
            excluded boolean,
            paired_tx_id text
          )
          WHERE t.id = u.id
        `;
      }
    });

    const finishedAt = new Date().toISOString();
    await sql`
      UPDATE finance.items
      SET last_synced_at = ${finishedAt}
      WHERE id = ${item.id}
    `;

    await sql`
      UPDATE finance.sync_runs
      SET
        status = 'success',
        fetched_count = ${rawTxs.length},
        upserted_count = ${incoming.length},
        paired_count = ${pairedCount},
        finished_at = ${finishedAt}
      WHERE id = ${runRow.id}
    `;

    return {
      itemId: item.id,
      syncRunId: runRow.id,
      accountsSynced: accounts.length,
      categoriesSynced: categories.length,
      fetchedCount: rawTxs.length,
      upsertedCount: incoming.length,
      pairedCount,
      lastSyncedAt: finishedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE finance.sync_runs
      SET status = 'error', error_message = ${msg.slice(0, 500)}, finished_at = now()
      WHERE id = ${runRow.id}
    `;
    throw err;
  }
}

export async function handleTransactionsDeleted(sql: SqlClient, transactionIds: string[]): Promise<number> {
  if (transactionIds.length === 0) return 0;
  // Remove referencias pareadas antes de apagar as transacoes removidas na origem
  await sql`
    UPDATE finance.transactions
    SET paired_tx_id = NULL, kind = CASE WHEN kind = 'bill_payment' THEN 'normal' ELSE kind END
    WHERE paired_tx_id IN ${sql(transactionIds)}
  `;
  const deleted = await sql<{ id: string }[]>`
    DELETE FROM finance.transactions
    WHERE id IN ${sql(transactionIds)}
    RETURNING id
  `;
  return deleted.length;
}

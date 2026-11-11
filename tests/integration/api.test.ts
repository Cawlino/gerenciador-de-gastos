import { describe, expect, it } from "vitest";

const API_BASE = process.env.T5_API_BASE ?? "http://127.0.0.1:54321/functions/v1";
const MOCK_URL = process.env.T5_MOCK_URL ?? "http://127.0.0.1:4010";
const APP_KEY = process.env.T5_APP_KEY ?? "t5-local-integration-app-key";
const WEBHOOK_TOKEN = process.env.T5_WEBHOOK_TOKEN ?? "t5-local-integration-webhook-token";

const SYNTHETIC_ITEM_ID = "11111111-1111-4111-8111-111111111111";
const BANK_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const CARD_ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

async function apiFetch(path: string, init: RequestInit = {}, includeAppKey = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (includeAppKey && !headers.has("x-app-key")) {
    headers.set("x-app-key", APP_KEY);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${API_BASE}/api${path}`, { ...init, headers });
}

describe("T5 — Edge Functions Integration (Mock Pluggy v2 + Postgres local)", () => {
  it("responde GET /api/health sem autenticacao e bloqueia rotas protegidas sem x-app-key valido (401)", async () => {
    const health = await apiFetch("/health", { method: "GET" }, false);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, service: "gastos-api" });

    const missingKey = await apiFetch("/dashboard?month=2026-11", { method: "GET" }, false);
    expect(missingKey.status).toBe(401);

    const wrongKey = await apiFetch("/dashboard?month=2026-11", {
      method: "GET",
      headers: { "x-app-key": "invalid-app-key" },
    }, false);
    expect(wrongKey.status).toBe(401);
  });

  it("valida payloads invalidos com HTTP 400", async () => {
    const res = await apiFetch("/items/register", {
      method: "POST",
      body: JSON.stringify({ itemId: "nao-e-uuid", sync: true }),
    });
    expect(res.status).toBe(400);

    const badMonth = await apiFetch("/dashboard?month=2026-13");
    expect(badMonth.status).toBe(400);
  });

  it("registra item sintetico, pagina /v2/transactions por cursor e calcula dashboard R1..R10 de 2026-11", async () => {
    const regRes = await apiFetch("/items/register", {
      method: "POST",
      body: JSON.stringify({ itemId: SYNTHETIC_ITEM_ID, sync: true }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    expect(regData.registered).toBe(true);
    expect(regData.sync.fetchedCount).toBe(14);
    expect(regData.sync.upsertedCount).toBe(14);
    expect(regData.sync.pairedCount).toBe(1);

    const itemsRes = await apiFetch("/items");
    expect(itemsRes.status).toBe(200);
    const itemsData = await itemsRes.json();
    expect(itemsData.items).toHaveLength(1);
    expect(itemsData.items[0].id).toBe(SYNTHETIC_ITEM_ID);
    expect(itemsData.accounts).toHaveLength(2);
    const bankAcc = itemsData.accounts.find((a: { id: string }) => a.id === BANK_ACCOUNT_ID);
    const cardAcc = itemsData.accounts.find((a: { id: string }) => a.id === CARD_ACCOUNT_ID);
    expect(bankAcc?.number_masked).toBe("****34-5");
    expect(cardAcc?.balance).toBe(412.3);
    expect(itemsData.syncRuns.length).toBeGreaterThanOrEqual(1);

    const dashRes = await apiFetch("/dashboard?month=2026-11");
    expect(dashRes.status).toBe(200);
    const dash = await dashRes.json();

    expect(dash.month).toBe("2026-11");
    expect(dash.checking_balance).toBe(2384.9);
    expect(dash.income_total).toBe(6120);
    expect(dash.expense_total).toBe(2155.8);
    expect(dash.net_total).toBe(3964.2);
    expect(dash.pending_count).toBe(1);
    expect(dash.pending_expense_total).toBe(27.4);
    expect(dash.excluded_count).toBe(4);
    expect(dash.credit_card.credit_limit).toBe(2050);
    expect(dash.credit_card.available_credit_limit).toBe(1637.7);
    expect(dash.credit_card.invoice_balance).toBe(412.3);

    const shopping = dash.categories.find((c: { category_id: string }) => c.category_id === "08000000");
    expect(shopping).toBeTruthy();
    expect(shopping.total).toBe(160);
  });

  it("respeita timezone America/Sao_Paulo (R6) e filtros de GET /api/transactions", async () => {
    const octRes = await apiFetch("/transactions?month=2026-10&includeExcluded=false");
    expect(octRes.status).toBe(200);
    const octData = await octRes.json();
    const octIds = octData.results.map((r: { id: string }) => r.id).sort();
    expect(octIds).toEqual(["tx-bank-007", "tx-bank-008"]);

    const exclRes = await apiFetch("/transactions?month=2026-11&type=excluded");
    expect(exclRes.status).toBe(200);
    const exclData = await exclRes.json();
    expect(exclData.results).toHaveLength(4);

    const searchRes = await apiFetch("/transactions?month=2026-11&q=mercadinho");
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    expect(searchData.results.map((r: { id: string }) => r.id)).toEqual(["tx-bank-006"]);
  });

  it("aplica recategorizacao manual com regra semelhante por CNPJ (R9) e gerencia /api/rules", async () => {
    const patchRes = await apiFetch("/transactions/tx-bank-006", {
      method: "PATCH",
      body: JSON.stringify({ categoryId: "10000000", applyToSimilar: true }),
    });
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.transaction.effective_category_id).toBe("10000000");
    expect(patchData.transaction.manual_category_id).toBe("10000000");
    expect(patchData.ruleCreated).toMatchObject({
      matchType: "cnpj",
      matchValue: "55444333000122",
    });
    expect(patchData.affectedSimilarCount).toBe(1);

    const similarRes = await apiFetch("/transactions/tx-bank-007");
    expect(similarRes.status).toBe(200);
    const similarTx = await similarRes.json();
    expect(similarTx.manual_category_id).toBeNull();
    expect(similarTx.rule_category_id).toBe("10000000");
    expect(similarTx.effective_category_id).toBe("10000000");

    const rulesRes = await apiFetch("/rules");
    expect(rulesRes.status).toBe(200);
    const rulesData = await rulesRes.json();
    expect(rulesData.results.some((r: { match_value: string }) => r.match_value === "55444333000122")).toBe(true);

    const createRuleRes = await apiFetch("/rules", {
      method: "POST",
      body: JSON.stringify({
        matchType: "description_norm",
        matchValue: "COMPRA BARROS EIRELI",
        categoryId: "08000000",
        label: "Barros teste",
      }),
    });
    expect(createRuleRes.status).toBe(201);
    const createdRule = await createRuleRes.json();
    expect(createdRule.affectedCount).toBe(1);

    const delRuleRes = await apiFetch(`/rules/${createdRule.id}`, { method: "DELETE" });
    expect(delRuleRes.status).toBe(200);
  });

  it("garante idempotencia no sync 2x, promove PENDING -> POSTED e preserva overrides manuais", async () => {
    const promoteRes = await fetch(`${MOCK_URL}/__admin/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ promotePendingCardTx: true }),
    });
    expect(promoteRes.status).toBe(200);

    const syncRes = await apiFetch("/sync", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(syncRes.status).toBe(200);
    const syncBody = await syncRes.json();
    expect(syncBody.ok).toBe(true);
    expect(syncBody.sync.fetchedCount).toBe(14);
    expect(syncBody.sync.upsertedCount).toBe(14);

    const allTxRes = await apiFetch("/transactions?includeExcluded=true&limit=100");
    expect(allTxRes.status).toBe(200);
    const allTx = await allTxRes.json();
    expect(allTx.results).toHaveLength(14);

    const card002Res = await apiFetch("/transactions/tx-card-002");
    expect(card002Res.status).toBe(200);
    const card002 = await card002Res.json();
    expect(card002.status).toBe("POSTED");
    expect(card002.is_pending).toBe(false);

    const dashRes = await apiFetch("/dashboard?month=2026-11");
    expect(dashRes.status).toBe(200);
    const dash = await dashRes.json();
    expect(dash.pending_count).toBe(0);
    expect(dash.expense_total).toBe(2155.8);

    const bank006Res = await apiFetch("/transactions/tx-bank-006");
    expect(bank006Res.status).toBe(200);
    const bank006 = await bank006Res.json();
    expect(bank006.manual_category_id).toBe("10000000");
    expect(bank006.effective_category_id).toBe("10000000");
  });

  it("permite alternar /api/settings (R4) e emite /api/connect-token", async () => {
    const getSettings = await apiFetch("/settings");
    expect(getSettings.status).toBe(200);
    const current = await getSettings.json();
    expect(current.settings.exclude_own_transfers).toBe(true);

    const patchOff = await apiFetch("/settings", {
      method: "PATCH",
      body: JSON.stringify({ exclude_own_transfers: false }),
    });
    expect(patchOff.status).toBe(200);

    const dashWithOwn = await apiFetch("/dashboard?month=2026-11");
    expect((await dashWithOwn.json()).expense_total).toBe(2655.8);

    const patchOn = await apiFetch("/settings", {
      method: "PATCH",
      body: JSON.stringify({ exclude_own_transfers: true }),
    });
    expect(patchOn.status).toBe(200);

    const tokenRes = await apiFetch("/connect-token", {
      method: "POST",
      body: JSON.stringify({ clientUserId: "t5-demo-user" }),
    });
    expect(tokenRes.status).toBe(200);
    const tokenData = await tokenRes.json();
    expect(tokenData.accessToken).toBe("mock-connect-token-0000000000");
  });

  it("protege /pluggy-webhook (401 sem token) e processa transactions/deleted + resync (200)", async () => {
    const unauth = await fetch(`${API_BASE}/pluggy-webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "transactions/deleted", eventId: "evt-1", transactionIds: ["tx-card-006"] }),
    });
    expect(unauth.status).toBe(401);

    const badPayload = await fetch(`${API_BASE}/pluggy-webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-token": WEBHOOK_TOKEN,
      },
      body: JSON.stringify({ invalid: true }),
    });
    expect(badPayload.status).toBe(400);

    const delEvent = await fetch(`${API_BASE}/pluggy-webhook?sync=1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-token": WEBHOOK_TOKEN,
      },
      body: JSON.stringify({
        event: "transactions/deleted",
        eventId: "evt-del-1",
        transactionIds: ["tx-card-006"],
      }),
    });
    expect(delEvent.status).toBe(200);

    const checkDeleted = await apiFetch("/transactions/tx-card-006");
    expect(checkDeleted.status).toBe(404);

    const resyncEvent = await fetch(`${API_BASE}/pluggy-webhook?sync=1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-token": WEBHOOK_TOKEN,
      },
      body: JSON.stringify({
        event: "transactions/created",
        eventId: "evt-sync-1",
        itemId: SYNTHETIC_ITEM_ID,
      }),
    });
    expect(resyncEvent.status).toBe(200);

    const checkRestored = await apiFetch("/transactions/tx-card-006");
    expect(checkRestored.status).toBe(200);
  });
});

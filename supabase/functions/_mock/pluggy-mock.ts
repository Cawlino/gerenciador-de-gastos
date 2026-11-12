/**
 * Servidor Mock local da API v2 da Pluggy alimentado por `fixtures/synthetic/*.json`.
 * Utilizado pela suite T5 (Integracao API) para simular `/auth`, `/items/:id`,
 * `PATCH /items/:id`, `/accounts`, `/categories`, `/v2/transactions` (com cursor `next`)
 * e `/connect_token` sem acessar a rede externa.
 *
 * Uso direto:
 *   deno run --allow-net --allow-read --allow-env supabase/functions/_mock/pluggy-mock.ts
 */
import { dirname, fromFileUrl, resolve } from "@std/path";

const PORT = Number(Deno.env.get("MOCK_PLUGGY_PORT") ?? "4010");
const HOST = Deno.env.get("MOCK_PLUGGY_HOST") ?? "127.0.0.1";
const MOCK_API_KEY = "mock-pluggy-api-key-0000000000";

const here = dirname(fromFileUrl(import.meta.url));
const defaultFixturesDir = resolve(here, "..", "..", "..", "fixtures", "synthetic");
const fixturesDir = Deno.env.get("MOCK_FIXTURES_DIR") || defaultFixturesDir;

function loadFixture<T>(name: string): T {
  const txt = Deno.readTextFileSync(resolve(fixturesDir, name));
  return JSON.parse(txt) as T;
}

interface MockState {
  promotePendingCardTx: boolean;
  itemStatus: string | null;
}

const state: MockState = {
  promotePendingCardTx: false,
  itemStatus: null,
};

const server = Deno.serve({ port: PORT, hostname: HOST }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/__health") {
    return Response.json({ ok: true, fixturesDir });
  }

  if (path === "/__admin/state" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (typeof body.promotePendingCardTx === "boolean") {
      state.promotePendingCardTx = body.promotePendingCardTx;
    }
    if (typeof body.itemStatus === "string" || body.itemStatus === null) {
      state.itemStatus = body.itemStatus;
    }
    return Response.json({ ok: true, state });
  }

  if (path === "/auth" && req.method === "POST") {
    return Response.json({ apiKey: MOCK_API_KEY });
  }

  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== MOCK_API_KEY) {
    return Response.json({ code: 403, message: "Missing or invalid authorization token" }, { status: 403 });
  }

  if (path.startsWith("/items/") && req.method === "GET") {
    const item = loadFixture<Record<string, unknown>>("item.json");
    const requestedId = path.slice("/items/".length);
    if (requestedId !== item.id) {
      return Response.json({ code: 404, message: "item not found" }, { status: 404 });
    }
    if (state.itemStatus) {
      return Response.json({ ...item, status: state.itemStatus });
    }
    return Response.json(item);
  }

  if (path.startsWith("/items/") && req.method === "PATCH") {
    const item = loadFixture<Record<string, unknown>>("item.json");
    return Response.json({ ...item, lastUpdatedAt: new Date().toISOString() });
  }

  if (path === "/accounts" && req.method === "GET") {
    const data = loadFixture<{ results: Array<Record<string, unknown>> }>("accounts.json");
    const itemId = url.searchParams.get("itemId");
    const results = itemId ? data.results.filter((a) => a.itemId === itemId) : data.results;
    return Response.json({ results });
  }

  if (path === "/categories" && req.method === "GET") {
    return Response.json(loadFixture("categories.json"));
  }

  // Paginacao v2 real por cursor `next` (paginas de 3 itens para exercitar loop de cursor)
  if (path === "/v2/transactions" && req.method === "GET") {
    const accountId = url.searchParams.get("accountId") ?? "";
    const afterRaw = Number(url.searchParams.get("after") ?? "0");
    const pageSize = 3;

    const bank = loadFixture<{ results: Array<Record<string, unknown>> }>("transactions_bank.json").results;
    const card = loadFixture<{ results: Array<Record<string, unknown>> }>("transactions_card.json").results;
    let all = [...bank, ...card].filter((t) => t.accountId === accountId);

    if (state.promotePendingCardTx) {
      all = all.map((t) => (t.id === "tx-card-002" ? { ...t, status: "POSTED" } : t));
    }

    const offset = Number.isFinite(afterRaw) && afterRaw >= 0 ? afterRaw : 0;
    const slice = all.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const next =
      nextOffset < all.length
        ? `?accountId=${encodeURIComponent(accountId)}&after=${nextOffset}`
        : null;

    return Response.json({ results: slice, next });
  }

  if (path === "/connect_token" && req.method === "POST") {
    return Response.json({
      accessToken: "mock-connect-token-0000000000",
    });
  }

  return Response.json({ code: 404, message: `Mock route not found: ${path}` }, { status: 404 });
});

console.log(`[pluggy-mock] Listening on http://${HOST}:${server.addr.port} (fixtures: ${fixturesDir})`);

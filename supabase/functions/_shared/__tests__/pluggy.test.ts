import { assertEquals, assertRejects } from "@std/assert";
import { PluggyApiError, PluggyClient } from "../pluggy.ts";

const ACC_ID = "22222222-2222-4222-8222-222222222222";

function makeMockTx(id: string) {
  return {
    id,
    accountId: ACC_ID,
    date: "2026-11-10T12:00:00.000Z",
    description: `TX ${id}`,
    amount: -10,
    type: "DEBIT",
    status: "POSTED",
  };
}

Deno.test("PluggyClient: percorre cursor v2 completo e reutiliza apiKey em cache", async () => {
  let authCalls = 0;
  const visitedUrls: string[] = [];

  const fetchMock: typeof fetch = (input) => {
    const url = String(input);
    visitedUrls.push(url);

    if (url.endsWith("/auth")) {
      authCalls += 1;
      return Promise.resolve(Response.json({ apiKey: "api-key-0000000000" }));
    }
    if (url.includes("after=cursor2")) {
      return Promise.resolve(Response.json({ results: [makeMockTx("t3")], next: null }));
    }
    if (url.includes("after=cursor1")) {
      return Promise.resolve(
        Response.json({
          results: [makeMockTx("t2")],
          next: `/v2/transactions?accountId=${ACC_ID}&after=cursor2`,
        }),
      );
    }
    if (url.includes("/v2/transactions")) {
      return Promise.resolve(
        Response.json({
          results: [makeMockTx("t1")],
          next: `?accountId=${ACC_ID}&after=cursor1`,
        }),
      );
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  };

  const client = new PluggyClient({
    clientId: "cid-1",
    clientSecret: "csecret-demo-never-leak",
    baseUrl: "http://pluggy.test",
    fetchFn: fetchMock,
  });

  const txs = await client.listTransactionsV2({ accountId: ACC_ID, dateFrom: "2026-11-01" });
  assertEquals(txs.map((t) => t.id), ["t1", "t2", "t3"]);
  assertEquals(authCalls, 1);
  assertEquals(visitedUrls.length, 4);
});

Deno.test("PluggyClient: reautentica automaticamente quando recebe 401 e propaga erro tipado em falha real", async () => {
  let authCalls = 0;
  let attempts = 0;

  const fetchMock: typeof fetch = (input) => {
    const url = String(input);
    if (url.endsWith("/auth")) {
      authCalls += 1;
      return Promise.resolve(Response.json({ apiKey: `key-attempt-${authCalls}-000000` }));
    }
    if (url.includes("/categories")) {
      attempts += 1;
      if (attempts === 1) {
        return Promise.resolve(new Response("expired", { status: 401 }));
      }
      return Promise.resolve(Response.json({ results: [] }));
    }
    return Promise.resolve(new Response("server error", { status: 500 }));
  };

  const client = new PluggyClient({
    clientId: "cid-1",
    clientSecret: "csecret-demo",
    baseUrl: "http://pluggy.test",
    fetchFn: fetchMock,
  });

  const cats = await client.getCategories();
  assertEquals(cats, []);
  assertEquals(authCalls, 2);

  await assertRejects(() => client.getItem("11111111-1111-4111-8111-111111111111"), PluggyApiError);
});

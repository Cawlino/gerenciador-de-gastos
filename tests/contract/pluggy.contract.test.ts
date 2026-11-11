import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  PluggyAccountSchema,
  PluggyAuthResponseSchema,
  PluggyCategorySchema,
  PluggyItemSchema,
  PluggyV2TransactionsPageSchema,
} from "../../supabase/functions/_shared/schemas";

const BASE_URL = process.env.PLUGGY_BASE_URL ?? "https://api.pluggy.ai";
const CLIENT_ID = process.env.PLUGGY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET ?? "";
const ITEM_ID = process.env.PLUGGY_ITEM_ID ?? "";
const IS_CI = process.env.CI === "true";

const hasCreds = Boolean(CLIENT_ID && CLIENT_SECRET && ITEM_ID);
const shouldSkipOnCi = IS_CI && !hasCreds;

if (!hasCreds && !IS_CI) {
  throw new Error(
    "[T6] PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_ID sao obrigatorios localmente via .env.",
  );
}

describe.skipIf(shouldSkipOnCi)("T6 — Pluggy API v2 Read-Only Contract", () => {
  let apiKey = "";
  let accountIds: string[] = [];

  async function pluggyGet(path: string): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
      },
    });
    expect(res.ok, `Pluggy GET ${path} retornou HTTP ${res.status}`).toBe(true);
    return res.json();
  }

  beforeAll(async () => {
    const authRes = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      }),
    });
    expect(authRes.ok, `Pluggy POST /auth retornou HTTP ${authRes.status}`).toBe(true);
    const parsedAuth = PluggyAuthResponseSchema.parse(await authRes.json());
    apiKey = parsedAuth.apiKey;
  });

  it("valida contrato GET /items/:id", async () => {
    const raw = await pluggyGet(`/items/${encodeURIComponent(ITEM_ID)}`);
    const item = PluggyItemSchema.parse(raw);
    expect(item.id).toBe(ITEM_ID);
    expect(item.status.length).toBeGreaterThan(0);
  });

  it("valida contrato GET /accounts?itemId=...", async () => {
    const raw = await pluggyGet(`/accounts?itemId=${encodeURIComponent(ITEM_ID)}`);
    const payload = z.object({ results: z.array(PluggyAccountSchema) }).parse(raw);
    expect(payload.results.length).toBeGreaterThan(0);

    for (const acc of payload.results) {
      expect(acc.itemId).toBe(ITEM_ID);
      expect(["BANK", "CREDIT"]).toContain(acc.type);
    }
    accountIds = payload.results.map((a) => a.id);
  });

  it("valida contrato GET /categories", async () => {
    const raw = await pluggyGet("/categories");
    const payload = z.object({ results: z.array(PluggyCategorySchema) }).parse(raw);
    expect(payload.results.length).toBeGreaterThan(50);
  });

  it("valida contrato GET /v2/transactions e cursor opaco `next` (somente leitura)", async () => {
    expect(accountIds.length).toBeGreaterThan(0);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (const accId of accountIds) {
      const firstRaw = await pluggyGet(
        `/v2/transactions?accountId=${encodeURIComponent(accId)}&dateFrom=${ninetyDaysAgo}`,
      );
      const firstPage = PluggyV2TransactionsPageSchema.parse(firstRaw);
      expect(Array.isArray(firstPage.results)).toBe(true);

      if (firstPage.next) {
        const nextUrl = firstPage.next.startsWith("http")
          ? new URL(firstPage.next).pathname + new URL(firstPage.next).search
          : firstPage.next.startsWith("/")
          ? firstPage.next
          : `/v2/transactions${firstPage.next.startsWith("?") ? firstPage.next : `?${firstPage.next}`}`;

        const secondRaw = await pluggyGet(nextUrl);
        const secondPage = PluggyV2TransactionsPageSchema.parse(secondRaw);
        expect(Array.isArray(secondPage.results)).toBe(true);
      }
    }
  });
});

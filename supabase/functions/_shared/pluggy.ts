import {
  PluggyAccountSchema,
  PluggyAuthResponseSchema,
  PluggyCategorySchema,
  PluggyConnectTokenResponseSchema,
  PluggyItemSchema,
  PluggyV2TransactionsPageSchema,
  type PluggyAccount,
  type PluggyCategory,
  type PluggyItem,
  type PluggyTransaction,
} from "./schemas.ts";

export class PluggyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly path: string,
  ) {
    super(`Pluggy API error ${status} on ${path}: ${detail}`);
    this.name = "PluggyApiError";
  }
}

export interface PluggyClientOptions {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Cliente para a Pluggy API v2:
 * - Autenticacao via POST /auth com cache de X-API-KEY (~100 min) e retry automatico em 401/403
 * - Paginacao v2 por cursor opaco (`next`) em GET /v2/transactions
 */
export class PluggyClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private apiKey: string | null = null;
  private apiKeyExpiresAt = 0;

  constructor(opts: PluggyClientOptions) {
    if (!opts.clientId || !opts.clientSecret) {
      throw new Error("PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET sao obrigatorios");
    }
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.baseUrl = (opts.baseUrl || Deno.env.get("PLUGGY_BASE_URL") || "https://api.pluggy.ai").replace(/\/+$/, "");
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  static fromEnv(): PluggyClient {
    const clientId = Deno.env.get("PLUGGY_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET") ?? "";
    const baseUrl = Deno.env.get("PLUGGY_BASE_URL") || undefined;
    return new PluggyClient({ clientId, clientSecret, baseUrl });
  }

  async authenticate(force = false): Promise<string> {
    if (!force && this.apiKey && Date.now() < this.apiKeyExpiresAt) {
      return this.apiKey;
    }

    const res = await this.fetchFn(`${this.baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new PluggyApiError(res.status, txt.slice(0, 200), "/auth");
    }

    const parsed = PluggyAuthResponseSchema.parse(await res.json());
    this.apiKey = parsed.apiKey;
    // Token da Pluggy dura 2h; renova com folga apos 100 minutos
    this.apiKeyExpiresAt = Date.now() + 100 * 60 * 1000;
    return this.apiKey;
  }

  private async requestJson(path: string, init: RequestInit = {}, retried = false): Promise<unknown> {
    const token = await this.authenticate();
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        "X-API-KEY": token,
      },
    });

    if ((res.status === 401 || res.status === 403) && !retried) {
      this.apiKey = null;
      this.apiKeyExpiresAt = 0;
      await this.authenticate(true);
      return this.requestJson(path, init, true);
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new PluggyApiError(res.status, txt.slice(0, 200), path);
    }

    if (res.status === 204) return null;
    return await res.json();
  }

  async getItem(itemId: string): Promise<PluggyItem> {
    const data = await this.requestJson(`/items/${encodeURIComponent(itemId)}`);
    return PluggyItemSchema.parse(data);
  }

  async refreshItem(itemId: string, body: Record<string, unknown> = {}): Promise<PluggyItem> {
    const data = await this.requestJson(`/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return PluggyItemSchema.parse(data);
  }

  async getAccounts(itemId: string): Promise<PluggyAccount[]> {
    const data = (await this.requestJson(`/accounts?itemId=${encodeURIComponent(itemId)}`)) as {
      results?: unknown[];
    };
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((a) => PluggyAccountSchema.parse(a));
  }

  async getCategories(): Promise<PluggyCategory[]> {
    const data = (await this.requestJson("/categories")) as { results?: unknown[] };
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((c) => PluggyCategorySchema.parse(c));
  }

  /**
   * Lista todas as transacoes via GET /v2/transactions seguindo o cursor opaco `next`
   * conforme especificacao oficial da Pluggy.
   */
  async listTransactionsV2(params: {
    accountId: string;
    dateFrom?: string;
    dateTo?: string;
    createdAtFrom?: string;
    ids?: string[];
    maxPages?: number;
  }): Promise<PluggyTransaction[]> {
    const search = new URLSearchParams({ accountId: params.accountId });
    if (params.ids && params.ids.length > 0) {
      search.set("ids", params.ids.join(","));
    } else {
      if (params.createdAtFrom) {
        search.set("createdAtFrom", params.createdAtFrom);
      } else if (params.dateFrom) {
        search.set("dateFrom", params.dateFrom);
      }
      if (params.dateTo) {
        search.set("dateTo", params.dateTo);
      }
    }

    let nextPath: string | null = `/v2/transactions?${search.toString()}`;
    const seen = new Set<string>();
    const all: PluggyTransaction[] = [];
    const maxPages = params.maxPages ?? 200;

    for (let page = 0; page < maxPages && nextPath; page++) {
      if (seen.has(nextPath)) break;
      seen.add(nextPath);

      const raw = await this.requestJson(nextPath);
      const parsed = PluggyV2TransactionsPageSchema.parse(raw);
      all.push(...parsed.results);

      const next = parsed.next ?? null;
      if (!next) {
        nextPath = null;
      } else if (next.startsWith("?")) {
        nextPath = `/v2/transactions${next}`;
      } else if (next.startsWith("/v2/transactions")) {
        nextPath = next;
      } else if (next.startsWith("http://") || next.startsWith("https://")) {
        const u = new URL(next);
        nextPath = `${u.pathname}${u.search}`;
      } else {
        const nextSearch = new URLSearchParams({ accountId: params.accountId, after: next });
        nextPath = `/v2/transactions?${nextSearch.toString()}`;
      }
    }

    return all;
  }

  async createConnectToken(params: {
    itemId?: string;
    clientUserId?: string;
    webhookUrl?: string;
  } = {}): Promise<{ accessToken: string }> {
    const options: Record<string, unknown> = { avoidDuplicates: true };
    if (params.clientUserId) options.clientUserId = params.clientUserId;
    if (params.webhookUrl) options.webhookUrl = params.webhookUrl;

    const payload: Record<string, unknown> = { options };
    if (params.itemId) payload.itemId = params.itemId;

    const data = await this.requestJson("/connect_token", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return PluggyConnectTokenResponseSchema.parse(data);
  }
}

import { getSql, timingSafeEqualStr } from "../_shared/db.ts";
import { PluggyClient } from "../_shared/pluggy.ts";
import { PluggyWebhookPayloadSchema, type PluggyWebhookPayload } from "../_shared/schemas.ts";
import { handleTransactionsDeleted, syncItem } from "../_shared/sync.ts";

declare const EdgeRuntime:
  | {
    waitUntil?: (promise: Promise<unknown>) => void;
  }
  | undefined;

function extractToken(req: Request): string | null {
  const url = new URL(req.url);
  const headerToken = req.headers.get("x-webhook-token");
  if (headerToken) return headerToken.trim();

  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const queryToken = url.searchParams.get("token");
  return queryToken ? queryToken.trim() : null;
}

async function processWebhookEvent(payload: PluggyWebhookPayload): Promise<void> {
  const sql = getSql();
  const pluggy = PluggyClient.fromEnv();

  if (payload.event === "transactions/deleted") {
    const ids = payload.transactionIds ?? [];
    await handleTransactionsDeleted(sql, ids);
    return;
  }

  if (payload.event === "item/deleted" && payload.itemId) {
    await sql`
      UPDATE finance.items
      SET status = 'DELETED', execution_status = 'DELETED'
      WHERE id = ${payload.itemId}
    `;
    return;
  }

  if (!payload.itemId) {
    return;
  }

  if (
    payload.event === "item/error" ||
    payload.event === "item/waiting_user_input" ||
    payload.event === "item/waiting_user_action"
  ) {
    const item = await pluggy.getItem(payload.itemId).catch(() => null);
    await sql`
      UPDATE finance.items
      SET
        status = ${item?.status ?? (payload.event === "item/error" ? "LOGIN_ERROR" : "WAITING_USER_INPUT")},
        execution_status = ${item?.executionStatus ?? null},
        error_code = ${item?.error?.code ?? payload.error?.code ?? null},
        error_message = ${item?.error?.message ?? payload.error?.message ?? null}
      WHERE id = ${payload.itemId}
    `;
    return;
  }

  if (
    payload.event === "item/updated" ||
    payload.event === "item/created" ||
    payload.event === "transactions/created" ||
    payload.event === "transactions/updated"
  ) {
    // Registra/atualiza somente se o item pertence a este app ou corresponde ao PLUGGY_ITEM_ID configurado
    const [known] = await sql<{ id: string }[]>`
      SELECT id FROM finance.items WHERE id = ${payload.itemId} LIMIT 1
    `;
    const configuredItemId = Deno.env.get("PLUGGY_ITEM_ID");
    if (!known && payload.itemId !== configuredItemId) {
      console.warn("Webhook ignorado para itemId desconhecido:", payload.itemId);
      return;
    }

    await syncItem(sql, pluggy, {
      itemId: payload.itemId,
      trigger: "webhook",
      fullSync: payload.event === "item/created",
    });
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const expectedToken = Deno.env.get("WEBHOOK_TOKEN") ?? "";
  const providedToken = extractToken(req);
  if (!expectedToken || !timingSafeEqualStr(providedToken, expectedToken)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = PluggyWebhookPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    // Documentacao Pluggy: 400 nao tem retry; valido so para payloads irreconheciveis
    return Response.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });
  }

  const payload = parsed.data;
  const expectedClientId = Deno.env.get("PLUGGY_CLIENT_ID");
  if (payload.clientId && expectedClientId && payload.clientId !== expectedClientId) {
    return Response.json({ ok: true, ignored: true, reason: "client_mismatch" }, { status: 202 });
  }

  const url = new URL(req.url);
  const waitSync = url.searchParams.get("sync") === "1";

  const job = processWebhookEvent(payload).catch((err) => {
    console.error("Webhook background error:", err instanceof Error ? err.message : String(err));
  });

  if (!waitSync && typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(job);
    return Response.json({ ok: true, queued: true, event: payload.event }, { status: 200 });
  }

  await job;
  return Response.json({ ok: true, processed: true, event: payload.event }, { status: 200 });
});

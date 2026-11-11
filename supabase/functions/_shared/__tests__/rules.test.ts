import { assertEquals } from "@std/assert";
import {
  applyBillPairingAndRefunds,
  getSaoPauloDateInfo,
  normalizeAmount,
  normalizePluggyTransaction,
} from "../rules.ts";
import type { PluggyTransaction } from "../schemas.ts";

Deno.test("R1: normaliza sinal de conta corrente e inverte sinal do cartao", () => {
  assertEquals(normalizeAmount(6120, "BANK"), 6120);
  assertEquals(normalizeAmount(-1800, "BANK"), -1800);
  // Cartao na Pluggy vem invertido: compra DEBIT positiva -> negativa; credito negativo -> positivo
  assertEquals(normalizeAmount(48.9, "CREDIT"), -48.9);
  assertEquals(normalizeAmount(-50.0, "CREDIT"), 50.0);
  assertEquals(Object.is(normalizeAmount(0, "CREDIT"), 0), true);
});

Deno.test("R6: corte de dia e mes respeita America/Sao_Paulo", () => {
  // 01/11 01:30Z = 31/10 22:30 BRT
  assertEquals(getSaoPauloDateInfo("2026-11-01T01:30:00.000Z"), {
    dateSp: "2026-10-31",
    monthSp: "2026-10",
  });
  // 01/11 03:00Z = 01/11 00:00 BRT
  assertEquals(getSaoPauloDateInfo("2026-11-01T03:00:00.000Z"), {
    dateSp: "2026-11-01",
    monthSp: "2026-11",
  });
});

Deno.test("R2 + R3: pareia pagamento de fatura (<=5 dias e <=0.01) e marca estorno sem par como refund", () => {
  const bankRaw: PluggyTransaction = {
    id: "b-pay",
    accountId: "22222222-2222-4222-8222-222222222222",
    date: "2026-11-10T15:35:28.000Z",
    description: "PAGAMENTO BOLETO BANCO INTER",
    amount: -318.29,
    type: "DEBIT",
    operationType: "BOLETO",
    status: "POSTED",
    categoryId: "05000000",
  };
  const cardPayRaw: PluggyTransaction = {
    id: "c-pay",
    accountId: "33333333-3333-4333-8333-333333333333",
    date: "2026-11-12T03:00:00.000Z", // 2 dias depois
    description: "PAGAMENTO ON LINE",
    amount: -318.28, // dentro da tolerancia 0.01
    type: "CREDIT",
    operationType: "PAGAMENTO",
    status: "POSTED",
    categoryId: "08000000",
  };
  const cardRefundRaw: PluggyTransaction = {
    id: "c-refund",
    accountId: "33333333-3333-4333-8333-333333333333",
    date: "2026-11-04T03:00:00.000Z",
    description: "ESTORNO LOJA DEMO",
    amount: -50.0,
    type: "CREDIT",
    operationType: "PAGAMENTO",
    status: "POSTED",
    categoryId: "08000000",
  };
  const farBankRaw: PluggyTransaction = {
    id: "b-far",
    accountId: "22222222-2222-4222-8222-222222222222",
    date: "2026-11-25T12:00:00.000Z", // > 5 dias de c-refund
    description: "PIX QUALQUER",
    amount: -50.0,
    type: "DEBIT",
    operationType: "PIX",
    status: "POSTED",
    categoryId: "05070000",
  };

  const txs = [
    normalizePluggyTransaction(bankRaw, "BANK"),
    normalizePluggyTransaction(farBankRaw, "BANK"),
    normalizePluggyTransaction(cardPayRaw, "CREDIT"),
    normalizePluggyTransaction(cardRefundRaw, "CREDIT"),
  ];

  const { pairedCount } = applyBillPairingAndRefunds(txs);
  assertEquals(pairedCount, 1);

  const byId = new Map(txs.map((t) => [t.id, t]));
  assertEquals(byId.get("b-pay")?.kind, "bill_payment");
  assertEquals(byId.get("b-pay")?.excluded, true);
  assertEquals(byId.get("b-pay")?.pairedTxId, "c-pay");

  assertEquals(byId.get("c-pay")?.kind, "bill_payment");
  assertEquals(byId.get("c-pay")?.excluded, true);
  assertEquals(byId.get("c-pay")?.pairedTxId, "b-pay");

  assertEquals(byId.get("c-refund")?.kind, "refund");
  assertEquals(byId.get("c-refund")?.excluded, false);
  assertEquals(byId.get("c-refund")?.amountNorm, 50.0);

  assertEquals(byId.get("b-far")?.kind, "normal");
  assertEquals(byId.get("b-far")?.excluded, false);
});

Deno.test("R4 e R5: exclui transferencia mesma titularidade (04*) e investimentos em conta (03*)", () => {
  const own = normalizePluggyTransaction(
    {
      id: "own-1",
      accountId: "22222222-2222-4222-8222-222222222222",
      date: "2026-11-08T10:15:00.000Z",
      description: "PIX MESMA TITULARIDADE",
      amount: -500,
      type: "DEBIT",
      status: "POSTED",
      categoryId: "04000000",
    },
    "BANK",
  );
  assertEquals(own.kind, "own_transfer");
  assertEquals(own.excluded, true);

  const invBank = normalizePluggyTransaction(
    {
      id: "inv-1",
      accountId: "22222222-2222-4222-8222-222222222222",
      date: "2026-11-09T11:00:00.000Z",
      description: "APLICACAO CDB",
      amount: -400,
      type: "DEBIT",
      status: "POSTED",
      categoryId: "03000000",
    },
    "BANK",
  );
  assertEquals(invBank.kind, "investment");
  assertEquals(invBank.excluded, true);
});

Deno.test("R1..R7 contra fixtures/synthetic completas", async () => {
  const bankUrl = new URL("../../../../fixtures/synthetic/transactions_bank.json", import.meta.url);
  const cardUrl = new URL("../../../../fixtures/synthetic/transactions_card.json", import.meta.url);
  const bankJson = JSON.parse(await Deno.readTextFile(bankUrl));
  const cardJson = JSON.parse(await Deno.readTextFile(cardUrl));

  const all = [
    ...(bankJson.results as PluggyTransaction[]).map((t) => normalizePluggyTransaction(t, "BANK")),
    ...(cardJson.results as PluggyTransaction[]).map((t) => normalizePluggyTransaction(t, "CREDIT")),
  ];

  const { pairedCount } = applyBillPairingAndRefunds(all);
  assertEquals(pairedCount, 1);

  const novNonExcluded = all.filter((t) => t.monthSp === "2026-11" && !t.excluded);
  const income = novNonExcluded
    .filter((t) => t.amountNorm > 0 && t.kind !== "refund")
    .reduce((acc, t) => acc + t.amountNorm, 0);
  const netExpense = -novNonExcluded
    .filter((t) => t.amountNorm < 0 || t.kind === "refund")
    .reduce((acc, t) => acc + t.amountNorm, 0);

  assertEquals(Math.round(income * 100) / 100, 6120.0);
  assertEquals(Math.round(netExpense * 100) / 100, 2155.8);
});

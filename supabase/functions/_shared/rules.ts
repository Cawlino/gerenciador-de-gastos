import type { PluggyTransaction } from "./schemas.ts";

export type AccountType = "BANK" | "CREDIT";
export type TransactionKind = "normal" | "bill_payment" | "refund" | "own_transfer" | "investment";

export interface NormalizedTransaction {
  id: string;
  accountId: string;
  accountType: AccountType;
  occurredAt: string;
  occurredDateSp: string;
  monthSp: string;
  description: string;
  descriptionRaw: string | null;
  descriptionNorm: string;
  amountRaw: number;
  amountNorm: number;
  pluggyType: "DEBIT" | "CREDIT";
  operationType: string | null;
  status: "PENDING" | "POSTED";
  kind: TransactionKind;
  excluded: boolean;
  pairedTxId: string | null;
  pluggyCategoryId: string | null;
  counterpartyName: string | null;
  counterpartyDoc: string | null;
  merchantName: string | null;
  merchantCnpj: string | null;
  providerId: string | null;
  currencyCode: string;
  paymentData: Record<string, unknown> | null;
  merchantData: Record<string, unknown> | null;
  creditCardMetadata: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}

const spDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Normaliza texto em caixa alta com espacos colapsados (compativel com finance.normalize_text SQL). */
export function normalizeText(input?: string | null): string {
  if (!input) return "";
  return input.trim().toUpperCase().replace(/\s+/g, " ");
}

/** R6: Converte ISO UTC para dia (YYYY-MM-DD) e mes (YYYY-MM) no fuso America/Sao_Paulo. */
export function getSaoPauloDateInfo(isoDate: string): { dateSp: string; monthSp: string } {
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`Invalid transaction date: ${isoDate}`);
  }
  const dateSp = spDateFmt.format(dt); // YYYY-MM-DD
  return { dateSp, monthSp: dateSp.slice(0, 7) };
}

/** R1: Conta mantem o sinal; cartao inverte (DEBIT + fica -, CREDIT - fica +). */
export function normalizeAmount(amount: number, accountType: AccountType): number {
  const signed = accountType === "CREDIT" ? -amount : amount;
  return round2(signed);
}

/** R4: Transferencias entre contas proprias (04xxxxxx). */
export function isOwnTransferCategory(categoryId?: string | null): boolean {
  return Boolean(categoryId && categoryId.startsWith("04"));
}

/** R5: Investimentos na conta corrente (03xxxxxx). */
export function isInvestmentCategory(categoryId?: string | null, accountType?: AccountType): boolean {
  return accountType === "BANK" && Boolean(categoryId && categoryId.startsWith("03"));
}

function daysBetweenSp(dateASp: string, dateBSp: string): number {
  const a = Date.parse(`${dateASp}T00:00:00Z`);
  const b = Date.parse(`${dateBSp}T00:00:00Z`);
  return Math.abs(a - b) / 86_400_000;
}

function digitsOnly(val?: string | null): string | null {
  if (!val) return null;
  const cleaned = val.replace(/\D/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function extractCounterparty(tx: PluggyTransaction): { name: string | null; doc: string | null } {
  const pd = tx.paymentData;
  if (!pd) return { name: null, doc: null };
  // Para saidas (DEBIT), interessa quem recebeu; para entradas (CREDIT), quem pagou.
  const party = tx.type === "CREDIT" ? (pd.payer ?? pd.receiver) : (pd.receiver ?? pd.payer);
  return {
    name: party?.name?.trim() || null,
    doc: digitsOnly(party?.documentNumber?.value),
  };
}

/** Normaliza uma transacao crua da Pluggy aplicando R1, R4, R5 e R6 antes do pareamento R2/R3. */
export function normalizePluggyTransaction(
  tx: PluggyTransaction,
  accountType: AccountType,
): NormalizedTransaction {
  const { dateSp, monthSp } = getSaoPauloDateInfo(tx.date);
  const amountNorm = normalizeAmount(tx.amount, accountType);
  const catId = tx.categoryId ?? null;
  const party = extractCounterparty(tx);

  let kind: TransactionKind = "normal";
  let excluded = false;

  if (isOwnTransferCategory(catId)) {
    kind = "own_transfer";
    excluded = true;
  } else if (isInvestmentCategory(catId, accountType)) {
    kind = "investment";
    excluded = true;
  }

  return {
    id: tx.id,
    accountId: tx.accountId,
    accountType,
    occurredAt: new Date(tx.date).toISOString(),
    occurredDateSp: dateSp,
    monthSp,
    description: tx.description,
    descriptionRaw: tx.descriptionRaw ?? null,
    descriptionNorm: normalizeText(tx.description),
    amountRaw: round2(tx.amount),
    amountNorm,
    pluggyType: tx.type,
    operationType: tx.operationType ?? null,
    status: tx.status ?? "POSTED",
    kind,
    excluded,
    pairedTxId: null,
    pluggyCategoryId: catId,
    counterpartyName: party.name,
    counterpartyDoc: party.doc,
    merchantName: tx.merchant?.businessName?.trim() || tx.merchant?.name?.trim() || null,
    merchantCnpj: digitsOnly(tx.merchant?.cnpj),
    providerId: tx.providerId ?? null,
    currencyCode: tx.currencyCode ?? "BRL",
    paymentData: (tx.paymentData as Record<string, unknown> | null) ?? null,
    merchantData: (tx.merchant as Record<string, unknown> | null) ?? null,
    creditCardMetadata: (tx.creditCardMetadata as Record<string, unknown> | null) ?? null,
    raw: tx as unknown as Record<string, unknown>,
  };
}

export interface PairingOptions {
  windowDays?: number;
  tolerance?: number;
}

/**
 * R2 + R3:
 * - Pareia credito no cartao (CREDIT) com debito na conta corrente (DEBIT) de mesmo valor
 *   (<= tolerance) dentro da janela de dias SP (<= windowDays): marca ambos `bill_payment` + `excluded=true`.
 * - Creditos no cartao sem par na conta viram `refund` (`excluded=false`) para abater despesa (R3).
 */
export function applyBillPairingAndRefunds(
  transactions: NormalizedTransaction[],
  opts: PairingOptions = {},
): { transactions: NormalizedTransaction[]; pairedCount: number } {
  const windowDays = opts.windowDays ?? 5;
  const tolerance = opts.tolerance ?? 0.01;

  const bankDebits = transactions.filter(
    (t) =>
      t.accountType === "BANK" &&
      t.pluggyType === "DEBIT" &&
      t.amountNorm < 0 &&
      t.kind === "normal" &&
      t.pairedTxId === null,
  );

  const cardCredits = transactions.filter(
    (t) => t.accountType === "CREDIT" && t.pluggyType === "CREDIT" && t.amountNorm > 0,
  );

  const usedBankIds = new Set<string>();
  let pairedCount = 0;

  for (const cardTx of cardCredits) {
    // Se ja estava pareada em sync anterior e o par segue valido, mantem
    if (cardTx.pairedTxId) {
      usedBankIds.add(cardTx.pairedTxId);
      continue;
    }

    const targetAbs = Math.abs(cardTx.amountNorm);

    const candidates = bankDebits
      .filter((b) => !usedBankIds.has(b.id))
      .map((b) => {
        const diffAmount = Math.abs(Math.abs(b.amountNorm) - targetAbs);
        const diffDays = daysBetweenSp(b.occurredDateSp, cardTx.occurredDateSp);
        const boletoOrTransferScore =
          b.operationType === "BOLETO" ||
            b.pluggyCategoryId?.startsWith("05") ||
            /FATURA|CARTAO|PAGAMENTO BOLETO/i.test(b.descriptionNorm)
            ? 0
            : 1;
        return { bankTx: b, diffAmount, diffDays, boletoOrTransferScore };
      })
      .filter((c) => c.diffAmount <= tolerance + 1e-9 && c.diffDays <= windowDays)
      .sort(
        (a, b) =>
          a.diffDays - b.diffDays ||
          a.boletoOrTransferScore - b.boletoOrTransferScore ||
          a.diffAmount - b.diffAmount,
      );

    if (candidates.length > 0) {
      const best = candidates[0].bankTx;
      usedBankIds.add(best.id);

      best.kind = "bill_payment";
      best.excluded = true;
      best.pairedTxId = cardTx.id;

      cardTx.kind = "bill_payment";
      cardTx.excluded = true;
      cardTx.pairedTxId = best.id;

      pairedCount += 1;
    } else if (cardTx.kind === "normal") {
      // R3: Credito no cartao sem par na conta e estorno e abate a categoria
      cardTx.kind = "refund";
      cardTx.excluded = false;
    }
  }

  return { transactions, pairedCount };
}

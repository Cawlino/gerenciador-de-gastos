import { normalizeText } from "./rules.ts";

export type MatchType = "cnpj" | "receiver_doc" | "description_norm";

export interface CategorizationRule {
  id: string;
  matchType: MatchType;
  matchValue: string;
  categoryId: string;
  priority: number;
  active: boolean;
}

export interface CategorizableTransaction {
  merchantCnpj?: string | null;
  counterpartyDoc?: string | null;
  descriptionNorm?: string | null;
  description?: string | null;
}

const MATCH_SPECIFICITY: Record<MatchType, number> = {
  cnpj: 0,
  receiver_doc: 1,
  description_norm: 2,
};

/**
 * R9: Encontra a regra ativa mais especifica que casa com a transacao.
 * Ordem de desempate: priority ASC, especificidade (`cnpj` > `receiver_doc` > `description_norm`).
 */
export function matchCategorizationRule(
  tx: CategorizableTransaction,
  rules: CategorizationRule[],
): CategorizationRule | null {
  const activeRules = rules
    .filter((r) => r.active)
    .slice()
    .sort((a, b) => a.priority - b.priority || MATCH_SPECIFICITY[a.matchType] - MATCH_SPECIFICITY[b.matchType]);

  const txDescNorm = normalizeText(tx.descriptionNorm || tx.description);

  for (const rule of activeRules) {
    if (rule.matchType === "cnpj" && tx.merchantCnpj && tx.merchantCnpj === rule.matchValue) {
      return rule;
    }
    if (rule.matchType === "receiver_doc" && tx.counterpartyDoc && tx.counterpartyDoc === rule.matchValue) {
      return rule;
    }
    if (
      rule.matchType === "description_norm" &&
      txDescNorm &&
      txDescNorm === normalizeText(rule.matchValue)
    ) {
      return rule;
    }
  }

  return null;
}

/** Infere o melhor criterio para "aplicar a semelhantes" a partir de uma transacao. */
export function inferSimilarCriteria(
  tx: CategorizableTransaction,
  preferredType?: MatchType,
): { matchType: MatchType; matchValue: string } | null {
  const descNorm = normalizeText(tx.descriptionNorm || tx.description);

  if (preferredType === "cnpj" && tx.merchantCnpj) {
    return { matchType: "cnpj", matchValue: tx.merchantCnpj };
  }
  if (preferredType === "receiver_doc" && tx.counterpartyDoc) {
    return { matchType: "receiver_doc", matchValue: tx.counterpartyDoc };
  }
  if (preferredType === "description_norm" && descNorm) {
    return { matchType: "description_norm", matchValue: descNorm };
  }

  if (tx.merchantCnpj) {
    return { matchType: "cnpj", matchValue: tx.merchantCnpj };
  }
  if (tx.counterpartyDoc) {
    return { matchType: "receiver_doc", matchValue: tx.counterpartyDoc };
  }
  if (descNorm) {
    return { matchType: "description_norm", matchValue: descNorm };
  }
  return null;
}

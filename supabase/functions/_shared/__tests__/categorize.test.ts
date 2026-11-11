import { assertEquals } from "@std/assert";
import { inferSimilarCriteria, matchCategorizationRule, type CategorizationRule } from "../categorize.ts";
import { normalizeText } from "../rules.ts";

Deno.test("normalizeText colapsa espacos e padroniza maiusculas", () => {
  assertEquals(normalizeText("  pix   enviado  Mercadinho "), "PIX ENVIADO MERCADINHO");
  assertEquals(normalizeText(null), "");
});

Deno.test("R9: matchCategorizationRule respeita prioridade e especificidade cnpj > receiver_doc > description_norm", () => {
  const rules: CategorizationRule[] = [
    {
      id: "r-desc",
      matchType: "description_norm",
      matchValue: "PIX ENVIADO MERCADINHO",
      categoryId: "05070000",
      priority: 100,
      active: true,
    },
    {
      id: "r-doc",
      matchType: "receiver_doc",
      matchValue: "55444333000122",
      categoryId: "11000000",
      priority: 100,
      active: true,
    },
    {
      id: "r-cnpj",
      matchType: "cnpj",
      matchValue: "55444333000122",
      categoryId: "10000000",
      priority: 100,
      active: true,
    },
    {
      id: "r-inactive",
      matchType: "cnpj",
      matchValue: "55444333000122",
      categoryId: "99999999",
      priority: 1,
      active: false,
    },
  ];

  const matched = matchCategorizationRule(
    {
      merchantCnpj: "55444333000122",
      counterpartyDoc: "55444333000122",
      description: "pix enviado mercadinho",
    },
    rules,
  );

  assertEquals(matched?.id, "r-cnpj");
  assertEquals(matched?.categoryId, "10000000");
});

Deno.test("R9: inferSimilarCriteria prioriza cnpj, depois receiver_doc e por fim description_norm", () => {
  assertEquals(
    inferSimilarCriteria({
      merchantCnpj: "14380200000121",
      counterpartyDoc: "999",
      description: "IFOOD *DEMO",
    }),
    { matchType: "cnpj", matchValue: "14380200000121" },
  );

  assertEquals(
    inferSimilarCriteria({
      merchantCnpj: null,
      counterpartyDoc: "98765432000110",
      description: "PIX ENVIADO ALUGUEL",
    }),
    { matchType: "receiver_doc", matchValue: "98765432000110" },
  );

  assertEquals(
    inferSimilarCriteria({
      merchantCnpj: null,
      counterpartyDoc: null,
      description: "  compra   padaria  ",
    }),
    { matchType: "description_norm", matchValue: "COMPRA PADARIA" },
  );
});

#!/usr/bin/env node
/**
 * Gera fixtures 100% sintéticas (sem dados reais ou PII) no formato exato da API v2 da Pluggy.
 * Usadas nas suítes T3, T4, T5 e T7 e seguras para versionamento no Git.
 *
 * Uso: node scripts/gen-fixtures.mjs
 */
import { fakerPT_BR as faker } from "@faker-js/faker";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

faker.seed(20261111);

const outDir = resolve(process.cwd(), "fixtures", "synthetic");
mkdirSync(outDir, { recursive: true });

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const BANK_ACC_ID = "22222222-2222-4222-8222-222222222222";
const CARD_ACC_ID = "33333333-3333-4333-8333-333333333333";

const item = {
  id: ITEM_ID,
  connector: {
    id: 200,
    name: "MeuPluggy",
    primaryColor: "ef294b",
    institutionUrl: "https://meu.pluggy.ai/",
    country: "BR",
    type: "PERSONAL_BANK",
    oauth: true,
    isSandbox: false,
  },
  status: "UPDATED",
  executionStatus: "SUCCESS",
  lastUpdatedAt: "2026-11-11T16:51:23.615Z",
  nextAutoSyncAt: "2026-11-12T16:47:54.199Z",
  consentExpiresAt: "2027-11-11T16:51:22.832Z",
};

const accounts = [
  {
    id: BANK_ACC_ID,
    itemId: ITEM_ID,
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    name: "BANCO INTER",
    number: "0001234-5",
    balance: 2384.9,
    currencyCode: "BRL",
    owner: "Usuário Demo",
    taxNumber: "00000000000",
    bankData: {
      closingBalance: 2384.9,
      automaticallyInvestedBalance: 0,
      overdraftContractedLimit: 0,
    },
    creditData: null,
  },
  {
    id: CARD_ACC_ID,
    itemId: ITEM_ID,
    type: "CREDIT",
    subtype: "CREDIT_CARD",
    name: "GOLD",
    number: "0000",
    balance: 412.3,
    currencyCode: "BRL",
    owner: "Usuário Demo",
    taxNumber: "00000000000",
    bankData: null,
    creditData: {
      level: "GOLD",
      brand: "MASTERCARD",
      balanceCloseDate: "2026-12-05T03:00:00.000Z",
      balanceDueDate: "2026-12-15T03:00:00.000Z",
      creditLimit: 2050,
      availableCreditLimit: 1637.7,
      minimumPayment: 61.85,
      status: "ACTIVE",
    },
  },
];

// Categorias base representativas da API /categories (PT-BR oficial da Pluggy)
const categories = [
  { id: "01000000", description: "Income", descriptionTranslated: "Renda" },
  { id: "01010000", description: "Salary", descriptionTranslated: "Salário", parentId: "01000000", parentDescription: "Income" },
  { id: "03000000", description: "Investments", descriptionTranslated: "Investimentos" },
  { id: "04000000", description: "Same person transfer", descriptionTranslated: "Transferência mesma titularidade" },
  { id: "05000000", description: "Transfers", descriptionTranslated: "Transferências" },
  { id: "05070000", description: "Transfer - PIX", descriptionTranslated: "Transferência - PIX", parentId: "05000000", parentDescription: "Transfers" },
  { id: "05100000", description: "Credit card payment", descriptionTranslated: "Pagamento de cartão de crédito", parentId: "05000000", parentDescription: "Transfers" },
  { id: "07000000", description: "Services", descriptionTranslated: "Serviços" },
  { id: "08000000", description: "Shopping", descriptionTranslated: "Compras" },
  { id: "09000000", description: "Digital services", descriptionTranslated: "Serviços digitais" },
  { id: "10000000", description: "Groceries", descriptionTranslated: "Supermercado" },
  { id: "11000000", description: "Food and drinks", descriptionTranslated: "Alimentos e bebidas" },
  { id: "11010000", description: "Eating out", descriptionTranslated: "Restaurantes", parentId: "11000000", parentDescription: "Food and drinks" },
  { id: "15030000", description: "Tax on financial operations", descriptionTranslated: "IOF", parentId: "15000000", parentDescription: "Taxes" },
  { id: "15000000", description: "Taxes", descriptionTranslated: "Impostos" },
  { id: "16000000", description: "Bank fees", descriptionTranslated: "Taxas bancárias" },
  { id: "17000000", description: "Housing", descriptionTranslated: "Moradia" },
  { id: "18000000", description: "Healthcare", descriptionTranslated: "Saúde" },
  { id: "19000000", description: "Transport", descriptionTranslated: "Transporte" },
  { id: "19010000", description: "Taxi and ride-hailing", descriptionTranslated: "Táxi e transporte por app", parentId: "19000000", parentDescription: "Transport" },
  { id: "99999999", description: "Other", descriptionTranslated: "Outros" },
];

// Transações sintéticas cobrindo TODAS as regras R1..R9
const bankTransactions = [
  // Salário (entrada)
  {
    id: "tx-bank-001",
    accountId: BANK_ACC_ID,
    date: "2026-11-05T12:00:00.000Z",
    description: "PIX RECEBIDO EMPRESA DEMO LTDA",
    amount: 6120.0,
    type: "CREDIT",
    operationType: "PIX",
    status: "POSTED",
    categoryId: "01010000",
    category: "Salary",
    paymentData: { payer: { name: "Empresa Demo Ltda", documentNumber: { value: "12345678000199" } } },
    merchant: null,
  },
  // Aluguel (saída Moradia)
  {
    id: "tx-bank-002",
    accountId: BANK_ACC_ID,
    date: "2026-11-06T14:20:00.000Z",
    description: "PIX ENVIADO IMOBILIARIA CENTRAL",
    amount: -1800.0,
    type: "DEBIT",
    operationType: "PIX",
    status: "POSTED",
    categoryId: "17000000",
    category: "Housing",
    paymentData: { receiver: { name: "Imobiliária Central", documentNumber: { value: "98765432000110" } } },
    merchant: null,
  },
  // Pagamento de fatura do cartão via BOLETO classificado pela Pluggy como Transfers (R2!)
  {
    id: "tx-bank-003",
    accountId: BANK_ACC_ID,
    date: "2026-11-10T15:35:28.000Z",
    description: "PAGAMENTO BOLETO BANCO INTER",
    amount: -318.29,
    type: "DEBIT",
    operationType: "BOLETO",
    status: "POSTED",
    categoryId: "05000000",
    category: "Transfers",
    paymentData: { paymentMethod: "BOLETO" },
    merchant: null,
  },
  // Transferência mesma titularidade (R4)
  {
    id: "tx-bank-004",
    accountId: BANK_ACC_ID,
    date: "2026-11-08T10:15:00.000Z",
    description: "PIX MESMA TITULARIDADE",
    amount: -500.0,
    type: "DEBIT",
    operationType: "PIX",
    status: "POSTED",
    categoryId: "04000000",
    category: "Same person transfer",
    paymentData: { receiver: { name: "Usuário Demo", documentNumber: { value: "00000000000" } } },
    merchant: null,
  },
  // Investimento CDB (R5)
  {
    id: "tx-bank-005",
    accountId: BANK_ACC_ID,
    date: "2026-11-09T11:00:00.000Z",
    description: "APLICACAO CDB INTER",
    amount: -400.0,
    type: "DEBIT",
    operationType: "OUTROS",
    status: "POSTED",
    categoryId: "03000000",
    category: "Investments",
    paymentData: null,
    merchant: null,
  },
  // PIX genérico para testar R9 (recategorização + aplicar a semelhantes)
  {
    id: "tx-bank-006",
    accountId: BANK_ACC_ID,
    date: "2026-11-11T13:10:00.000Z",
    description: "PIX ENVIADO MERCADINHO DO BAIRRO",
    amount: -84.5,
    type: "DEBIT",
    operationType: "PIX",
    status: "POSTED",
    categoryId: "05070000",
    category: "Transfer - PIX",
    paymentData: { receiver: { name: "Mercadinho do Bairro", documentNumber: { value: "55444333000122" } } },
    merchant: { businessName: "Mercadinho do Bairro", cnpj: "55444333000122" },
  },
  // Outro PIX semelhante (mesmo CNPJ/recebedor) para testar regra R9
  {
    id: "tx-bank-007",
    accountId: BANK_ACC_ID,
    date: "2026-10-25T16:00:00.000Z",
    description: "PIX ENVIADO MERCADINHO DO BAIRRO",
    amount: -62.0,
    type: "DEBIT",
    operationType: "PIX",
    status: "POSTED",
    categoryId: "05070000",
    category: "Transfer - PIX",
    paymentData: { receiver: { name: "Mercadinho do Bairro", documentNumber: { value: "55444333000122" } } },
    merchant: { businessName: "Mercadinho do Bairro", cnpj: "55444333000122" },
  },
  // Transação às 01:30 UTC de 01/11 = 22:30 de 31/10 em Brasília (R6 fuso horário!)
  {
    id: "tx-bank-008",
    accountId: BANK_ACC_ID,
    date: "2026-11-01T01:30:00.000Z",
    description: "IFOOD *LANCHONETE NOTURNA",
    amount: -55.0,
    type: "DEBIT",
    operationType: "PIX",
    status: "POSTED",
    categoryId: "11010000",
    category: "Eating out",
    paymentData: null,
    merchant: { businessName: "iFood", cnpj: "14380200000121" },
  },
];

// Transações do cartão (R1: sinal invertido no Pluggy — DEBIT positivo, CREDIT negativo!)
const cardTransactions = [
  // Compra Restaurante (DEBIT vem positivo +48.90)
  {
    id: "tx-card-001",
    accountId: CARD_ACC_ID,
    date: "2026-11-11T03:00:00.000Z",
    description: "IFOOD *RESTAURANTE DEMO",
    amount: 48.9,
    type: "DEBIT",
    operationType: "PAGAMENTO",
    status: "POSTED",
    categoryId: "11010000",
    category: "Eating out",
    merchant: { businessName: "iFood", cnpj: "14380200000121" },
    creditCardMetadata: { cardNumber: "0000", paymentType: "SINGLE", billForecastDate: "2026-11" },
  },
  // Compra Uber (pendente R7)
  {
    id: "tx-card-002",
    accountId: CARD_ACC_ID,
    date: "2026-11-11T03:00:00.000Z",
    description: "UBER *VIAGEM DEMO",
    amount: 27.4,
    type: "DEBIT",
    operationType: "PAGAMENTO",
    status: "PENDING",
    categoryId: "19010000",
    category: "Taxi and ride-hailing",
    merchant: { businessName: "Uber", cnpj: "17895646000187" },
    creditCardMetadata: { cardNumber: "0000", paymentType: "SINGLE", billForecastDate: "2026-11" },
  },
  // Pagamento de fatura no cartão (CREDIT vem negativo -318.29 e Pluggy marca Shopping — pareia com tx-bank-003!)
  {
    id: "tx-card-003",
    accountId: CARD_ACC_ID,
    date: "2026-11-10T03:00:00.000Z",
    description: "PAGAMENTO ON LINE",
    amount: -318.29,
    type: "CREDIT",
    operationType: "PAGAMENTO",
    status: "POSTED",
    categoryId: "08000000",
    category: "Shopping",
    merchant: null,
    creditCardMetadata: { cardNumber: "0000", paymentType: "SINGLE", billForecastDate: "2026-11" },
  },
  // Estorno no cartão sem par na conta (R3: CREDIT negativo, deve abater despesa de Compras)
  {
    id: "tx-card-004",
    accountId: CARD_ACC_ID,
    date: "2026-11-04T03:00:00.000Z",
    description: "ESTORNO LOJA DEMO",
    amount: -50.0,
    type: "CREDIT",
    operationType: "PAGAMENTO",
    status: "POSTED",
    categoryId: "08000000",
    category: "Shopping",
    merchant: null,
    creditCardMetadata: { cardNumber: "0000", paymentType: "SINGLE", billForecastDate: "2026-11" },
  },
  // Compra Compras
  {
    id: "tx-card-005",
    accountId: CARD_ACC_ID,
    date: "2026-11-03T03:00:00.000Z",
    description: "AMAZON BR DEMO",
    amount: 210.0,
    type: "DEBIT",
    operationType: "PAGAMENTO",
    status: "POSTED",
    categoryId: "08000000",
    category: "Shopping",
    merchant: { businessName: "Amazon", cnpj: "15436940000103" },
    creditCardMetadata: { cardNumber: "0000", paymentType: "SINGLE", billForecastDate: "2026-11" },
  },
  // Transação sem categoria (null -> Outros)
  {
    id: "tx-card-006",
    accountId: CARD_ACC_ID,
    date: "2026-11-02T03:00:00.000Z",
    description: `COMPRA ${faker.company.name().toUpperCase()}`,
    amount: 35.0,
    type: "DEBIT",
    operationType: "OUTROS",
    status: "POSTED",
    categoryId: null,
    category: null,
    merchant: null,
    creditCardMetadata: { cardNumber: "0000", paymentType: "SINGLE", billForecastDate: "2026-11" },
  },
];

writeFileSync(resolve(outDir, "item.json"), JSON.stringify(item, null, 2));
writeFileSync(resolve(outDir, "accounts.json"), JSON.stringify({ results: accounts }, null, 2));
writeFileSync(resolve(outDir, "categories.json"), JSON.stringify({ results: categories }, null, 2));
writeFileSync(resolve(outDir, "transactions_bank.json"), JSON.stringify({ results: bankTransactions, next: null }, null, 2));
writeFileSync(resolve(outDir, "transactions_card.json"), JSON.stringify({ results: cardTransactions, next: null }, null, 2));

console.log(`Fixtures sintéticas geradas em ${outDir} (${bankTransactions.length} conta, ${cardTransactions.length} cartão).`);

import { z } from "zod";

export const PluggyAuthResponseSchema = z.object({
  apiKey: z.string().min(10),
});

export const PluggyConnectorSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    primaryColor: z.string().nullish(),
    type: z.string().nullish(),
    country: z.string().nullish(),
  })
  .passthrough();

export const PluggyItemSchema = z
  .object({
    id: z.string().uuid(),
    connector: PluggyConnectorSchema.nullish(),
    status: z.string(),
    executionStatus: z.string().nullish(),
    error: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    lastUpdatedAt: z.string().nullish(),
    nextAutoSyncAt: z.string().nullish(),
    consentExpiresAt: z.string().nullish(),
  })
  .passthrough();

export const PluggyAccountSchema = z
  .object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
    type: z.enum(["BANK", "CREDIT"]),
    subtype: z.string(),
    name: z.string(),
    marketingName: z.string().nullish(),
    number: z.string().nullish(),
    balance: z.number(),
    currencyCode: z.string().default("BRL"),
    bankData: z.record(z.unknown()).nullish(),
    creditData: z.record(z.unknown()).nullish(),
  })
  .passthrough();

export const PluggyCategorySchema = z
  .object({
    id: z.string().min(1),
    description: z.string(),
    descriptionTranslated: z.string().nullish(),
    parentId: z.string().nullish(),
    parentDescription: z.string().nullish(),
  })
  .passthrough();

export const PluggyPartySchema = z
  .object({
    name: z.string().nullish(),
    documentNumber: z
      .object({
        type: z.string().nullish(),
        value: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const PluggyTransactionSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().uuid(),
    date: z.string(),
    description: z.string(),
    descriptionRaw: z.string().nullish(),
    amount: z.number(),
    currencyCode: z.string().nullish(),
    type: z.enum(["DEBIT", "CREDIT"]),
    operationType: z.string().nullish(),
    status: z.enum(["PENDING", "POSTED"]).default("POSTED"),
    category: z.string().nullish(),
    categoryId: z.string().nullish(),
    providerId: z.string().nullish(),
    paymentData: z
      .object({
        payer: PluggyPartySchema.nullish(),
        receiver: PluggyPartySchema.nullish(),
        paymentMethod: z.string().nullish(),
        reason: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    merchant: z
      .object({
        name: z.string().nullish(),
        businessName: z.string().nullish(),
        cnpj: z.string().nullish(),
        cnae: z.string().nullish(),
        category: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    creditCardMetadata: z.record(z.unknown()).nullish(),
  })
  .passthrough();

export const PluggyV2TransactionsPageSchema = z.object({
  results: z.array(PluggyTransactionSchema),
  next: z.string().nullable().optional(),
});

export const PluggyConnectTokenResponseSchema = z.object({
  accessToken: z.string().min(10),
});

export const PluggyWebhookPayloadSchema = z
  .object({
    event: z.string().min(1),
    eventId: z.string().optional(),
    clientId: z.string().optional(),
    itemId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    transactionIds: z.array(z.string()).optional(),
    transactionsCreatedAtFrom: z.string().optional(),
    error: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const RegisterItemRequestSchema = z.object({
  itemId: z.string().uuid(),
  sync: z.boolean().optional().default(true),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const SyncRequestSchema = z.object({
  itemId: z.string().uuid().optional(),
  refresh: z.boolean().optional().default(false),
  fullSync: z.boolean().optional().default(false),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  trigger: z.enum(["manual", "pull_to_refresh", "webhook", "cron"]).optional().default("manual"),
});

export const PatchTransactionSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  excluded: z.boolean().nullable().optional(),
  applyToSimilar: z.boolean().optional().default(false),
  matchType: z.enum(["cnpj", "receiver_doc", "description_norm"]).optional(),
});

export const CreateRuleSchema = z.object({
  matchType: z.enum(["cnpj", "receiver_doc", "description_norm"]),
  matchValue: z.string().min(1),
  categoryId: z.string().min(1),
  label: z.string().optional(),
});

export const UpdateSettingsSchema = z.object({
  exclude_own_transfers: z.boolean().optional(),
  exclude_investments: z.boolean().optional(),
});

export const ConnectTokenRequestSchema = z.object({
  itemId: z.string().uuid().optional(),
  clientUserId: z.string().optional(),
  webhookUrl: z.string().url().optional(),
});

export type PluggyItem = z.infer<typeof PluggyItemSchema>;
export type PluggyAccount = z.infer<typeof PluggyAccountSchema>;
export type PluggyCategory = z.infer<typeof PluggyCategorySchema>;
export type PluggyTransaction = z.infer<typeof PluggyTransactionSchema>;
export type PluggyWebhookPayload = z.infer<typeof PluggyWebhookPayloadSchema>;

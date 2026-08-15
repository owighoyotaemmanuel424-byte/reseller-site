import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  products: defineTable({
    name: v.string(), description: v.optional(v.string()), providerProductId: v.optional(v.string()),
    priceKobo: v.number(), active: v.boolean(), category: v.optional(v.string()), updatedAt: v.number(),
  }).index("by_active", ["active"]).index("by_provider_id", ["providerProductId"]),
  wallets: defineTable({ userId: v.string(), balanceKobo: v.number(), updatedAt: v.number() }).index("by_user", ["userId"]),
  walletTransactions: defineTable({
    userId: v.string(), type: v.union(v.literal("credit"), v.literal("debit")), amountKobo: v.number(), description: v.string(),
    reference: v.string(), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("failed")), createdAt: v.number(),
  }).index("by_user", ["userId"]).index("by_reference", ["reference"]),
  fundingRequests: defineTable({
    userId: v.string(), amountKobo: v.number(), reference: v.string(), status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
    createdAt: v.number(), completedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]).index("by_reference", ["reference"]),
  orders: defineTable({
    userId: v.string(), productId: v.id("products"), productName: v.string(), qty: v.number(), unitPriceKobo: v.number(), totalKobo: v.number(),
    providerOrderId: v.optional(v.string()), productDetails: v.optional(v.array(v.string())),
    status: v.union(v.literal("processing"), v.literal("completed"), v.literal("failed"), v.literal("reported"), v.literal("replaced")),
    reportReason: v.optional(v.string()), reportedAt: v.optional(v.number()), replacementNote: v.optional(v.string()), createdAt: v.number(),
  }).index("by_user", ["userId"]).index("by_created", ["createdAt"]),
  // Webhook events table to ensure idempotent webhook processing
  webhookEvents: defineTable({ eventId: v.string(), createdAt: v.number(), raw: v.optional(v.any()) }).index("by_eventId", ["eventId"]),
  // Wallet ledger entries: canonical source of truth for balance changes
  walletLedger: defineTable({
    userId: v.string(), type: v.union(v.literal("credit"), v.literal("debit")), amountKobo: v.number(), reference: v.optional(v.string()),
    eventId: v.optional(v.string()), description: v.optional(v.string()), createdAt: v.number(),
  }).index("by_eventId", ["eventId"]).index("by_reference", ["reference"]).index("by_user", ["userId"]),
});

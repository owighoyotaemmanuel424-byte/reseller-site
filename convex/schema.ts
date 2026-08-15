import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({ userId: v.string(), email: v.optional(v.string()), role: v.optional(v.string()) }).index("by_userId", ["userId"]),
  products: defineTable({ name: v.string(), description: v.optional(v.string()), providerProductId: v.optional(v.string()), priceKobo: v.number(), active: v.boolean(), category: v.optional(v.string()), updatedAt: v.number() }).index("by_active", ["active"]).index("by_provider_id", ["providerProductId"]),
  wallets: defineTable({ userId: v.string(), balanceKobo: v.number(), updatedAt: v.number() }).index("by_user", ["userId"]),
  walletTransactions: defineTable({ userId: v.string(), type: v.union(v.literal("credit"), v.literal("debit")), amountKobo: v.number(), description: v.string(), reference: v.string(), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("failed")), createdAt: v.number() }).index("by_user", ["userId"]).index("by_reference", ["reference"]),
  fundingRequests: defineTable({ userId: v.string(), amountKobo: v.number(), reference: v.string(), status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")), createdAt: v.number(), completedAt: v.optional(v.number()) }).index("by_user", ["userId"]).index("by_reference", ["reference"]),
  orders: defineTable({ userId: v.string(), productId: v.id("products"), productName: v.string(), qty: v.number(), unitPriceKobo: v.number(), totalKobo: v.number(), status: v.union(v.literal("processing"), v.literal("completed"), v.literal("failed"), v.literal("reported"), v.literal("replaced")), createdAt: v.number() }).index("by_user", ["userId"]),
  webhookEvents: defineTable({ eventId: v.string(), reference: v.optional(v.string()), eventType: v.string(), processedAt: v.number(), createdAt: v.number() }).index("by_eventId", ["eventId"]).index("by_reference", ["reference"]),
  walletLedger: defineTable({ userId: v.string(), walletId: v.id("wallets"), type: v.union(v.literal("credit"), v.literal("debit")), amountKobo: v.number(), currency: v.string(), status: v.string(), reference: v.string(), eventId: v.optional(v.string()), description: v.optional(v.string()), createdAt: v.number() }).index("by_eventId", ["eventId"]).index("by_reference", ["reference"]).index("by_walletId", ["walletId"]).index("by_user", ["userId"]),
});

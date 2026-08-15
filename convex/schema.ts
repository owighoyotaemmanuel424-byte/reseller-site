import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Schema restored to a compatible structure. Additional authorization
// checks should be implemented inside Convex queries and mutations.
export default defineSchema({
  users: defineTable({
    email: v.string(),
    role: v.optional(v.string()),
  }).index("by_email", ["email"]),
  wallets: defineTable({
    userId: v.string(),
    balance: v.number(),
  }).index("by_user", ["userId"]),
  orders: defineTable({
    userId: v.string(),
    status: v.string(),
    total: v.number(),
  }).index("by_user", ["userId"]),
  transactions: defineTable({
    userId: v.string(),
    type: v.string(),
    amount: v.number(),
    status: v.string(),
  }).index("by_user", ["userId"]),
});

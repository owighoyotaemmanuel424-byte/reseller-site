import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", identity.subject)).unique();
}});

export const ensure = mutation({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required");
  const existing = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", identity.subject)).unique();
  if (existing) return existing;
  const id = await ctx.db.insert("wallets", { userId: identity.subject, balanceKobo: 0, updatedAt: Date.now() });
  return await ctx.db.get(id);
}});

export const transactions = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  return await ctx.db.query("walletTransactions").withIndex("by_user", (q) => q.eq("userId", identity.subject)).order("desc").take(100);
}});

export const requestFunding = mutation({
  args: { amountKobo: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    if (!Number.isSafeInteger(args.amountKobo) || args.amountKobo < 10000) throw new Error("Minimum funding is ₦100");
    const reference = `MKX-${crypto.randomUUID()}`;
    const now = Date.now();
    await ctx.db.insert("fundingRequests", { userId: identity.subject, amountKobo: args.amountKobo, reference, status: "pending", createdAt: now });
    await ctx.db.insert("walletTransactions", { userId: identity.subject, type: "credit", amountKobo: args.amountKobo, description: "Wallet funding request", reference, status: "pending", createdAt: now });
    return reference;
  },
});

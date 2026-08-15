import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db.query("wallets").withIndex("by_user", q => q.eq("userId", identity.subject)).unique();
}});

export const ensure = mutation({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required");
  const existing = await ctx.db.query("wallets").withIndex("by_user", q => q.eq("userId", identity.subject)).unique();
  if (existing) return existing;
  const id = await ctx.db.insert("wallets", { userId: identity.subject, balanceKobo: 0, updatedAt: Date.now() });
  return await ctx.db.get(id);
}});

export const transactions = query({ args: {}, handler: async ctx => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  return await ctx.db.query("walletTransactions").withIndex("by_user", q => q.eq("userId", identity.subject)).order("desc").take(100);
}});

export const withdraw = mutation({
  args: { amountKobo: v.number(), destination: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    if (!Number.isSafeInteger(args.amountKobo) || args.amountKobo <= 0) throw new Error("Invalid amount");

    const wallet = await ctx.db.query("wallets").withIndex("by_user", q => q.eq("userId", identity.subject)).unique();
    if (!wallet) throw new Error("Wallet not initialized");
    if (wallet.balanceKobo < args.amountKobo) throw new Error("Insufficient funds");

    const now = Date.now();
    const reference = `WD-${crypto.randomUUID()}`;

    await ctx.db.insert("walletLedger", {
      userId: identity.subject,
      walletId: wallet._id,
      amountKobo: args.amountKobo,
      currency: "NGN",
      type: "debit",
      status: "confirmed",
      reference,
      createdAt: now,
      description: `Withdrawal to ${args.destination}`,
    });

    await ctx.db.patch(wallet._id, { balanceKobo: wallet.balanceKobo - args.amountKobo, updatedAt: now });

    await ctx.db.insert("walletTransactions", {
      userId: identity.subject,
      type: "debit",
      amountKobo: args.amountKobo,
      description: `Withdrawal to ${args.destination}`,
      reference,
      status: "confirmed",
      createdAt: now,
    });

    return { success: true, reference };
  },
});

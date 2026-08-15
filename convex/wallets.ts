import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * get - fetch wallet for authenticated user
 */
export const get = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", identity.subject)).unique();
}});

/**
 * ensure - create wallet if missing
 */
export const ensure = mutation({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required");
  const existing = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", identity.subject)).unique();
  if (existing) return existing;
  const id = await ctx.db.insert("wallets", { userId: identity.subject, balanceKobo: 0, updatedAt: Date.now() });
  return await ctx.db.get(id);
}});

/**
 * transactions - list walletTransactions for authenticated user
 */
export const transactions = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  return await ctx.db.query("walletTransactions").withIndex("by_user", (q) => q.eq("userId", identity.subject)).order("desc").take(100);
}});

/**
 * requestFunding - user requests to fund wallet (creates fundingRequest + pending tx)
 */
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

/**
 * Example: withdraw or transfer (debit) - ledger-first approach
 * Note: this is an example skeleton; adapt to actual app semantics.
 */
export const withdraw = mutation({
  args: { amountKobo: v.number(), destination: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    if (!Number.isSafeInteger(args.amountKobo) || args.amountKobo <= 0) throw new Error("Invalid amount");

    const wallet = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", identity.subject)).unique();
    if (!wallet) throw new Error("Wallet not initialized");

    if (wallet.balanceKobo < args.amountKobo) throw new Error("Insufficient funds");

    const now = Date.now();

    // 1) Insert ledger debit — canonical record
    const ledgerId = await ctx.db.insert("walletLedger", {
      userId: identity.subject,
      type: "debit",
      amountKobo: args.amountKobo,
      reference: `WD-${crypto.randomUUID()}`,
      eventId: null,
      description: `Withdrawal to ${args.destination}`,
      createdAt: now,
    });

    // 2) Patch wallet balance
    await ctx.db.patch(wallet._id, { balanceKobo: wallet.balanceKobo - args.amountKobo, updatedAt: now });

    // 3) Create a transaction record referencing the ledger
    await ctx.db.insert("walletTransactions", {
      userId: identity.subject,
      type: "debit",
      amountKobo: args.amountKobo,
      description: `Withdrawal to ${args.destination}`,
      reference: `WD-${crypto.randomUUID()}`,
      status: "confirmed",
      createdAt: now,
    });

    return { success: true };
  },
});

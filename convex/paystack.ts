import { action, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const PAYSTACK_API = "https://api.paystack.co";

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

export const createFundingRequest = mutation({
  args: { amountKobo: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    if (!Number.isSafeInteger(args.amountKobo) || args.amountKobo < 10000) throw new Error("Minimum funding is ₦100");
    const reference = `MKX-${crypto.randomUUID()}`;
    const now = Date.now();
    await ctx.db.insert("fundingRequests", {
      userId: identity.subject,
      amountKobo: args.amountKobo,
      reference,
      status: "pending",
      createdAt: now,
    });
    await ctx.db.insert("walletTransactions", {
      userId: identity.subject,
      type: "credit",
      amountKobo: args.amountKobo,
      description: "Paystack wallet funding",
      reference,
      status: "pending",
      createdAt: now,
    });
    return reference;
  },
});

export const initialize = action({
  args: { amountKobo: v.number() },
  handler: async (ctx, args): Promise<{ authorizationUrl: string; reference: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const email = identity.email;
    if (!email) throw new Error("Your Clerk account needs an email address before payment");
    if (!Number.isSafeInteger(args.amountKobo) || args.amountKobo < 10000) throw new Error("Minimum funding is ₦100");

    const reference = await ctx.runMutation(internal.paystack.createFundingRequestForUser, {
      userId: identity.subject,
      amountKobo: args.amountKobo,
    });

    const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: String(args.amountKobo),
        currency: "NGN",
        reference,
        callback_url: siteUrl() ? `${siteUrl()}/wallet` : undefined,
        metadata: { reference, userId: identity.subject, product: "MultiKartX wallet" },
      }),
    });
    const payload = await response.json() as { status?: boolean; message?: string; data?: { authorization_url?: string } };
    if (!response.ok || !payload.status || !payload.data?.authorization_url) {
      await ctx.runMutation(internal.paystack.markFailed, { reference });
      throw new Error(payload.message ?? `Paystack returned HTTP ${response.status}`);
    }
    return { authorizationUrl: payload.data.authorization_url, reference };
  },
});

export const verify = action({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<{ status: string; reference: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const response = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(args.reference)}`, {
      headers: { Authorization: `Bearer ${secretKey()}` },
    });
    const payload = await response.json() as { status?: boolean; message?: string; data?: { status?: string; reference?: string; amount?: number; currency?: string } };
    if (!response.ok || !payload.status || !payload.data) throw new Error(payload.message ?? "Unable to verify payment");
    if (payload.data.currency && payload.data.currency !== "NGN") throw new Error("Unexpected payment currency");
    await ctx.runMutation(internal.paystack.applyVerifiedPayment, {
      userId: identity.subject,
      reference: payload.data.reference ?? args.reference,
      amountKobo: Number(payload.data.amount ?? 0),
      successful: payload.data.status === "success",
    });
    return { status: payload.data.status ?? "unknown", reference: payload.data.reference ?? args.reference };
  },
});

export const createFundingRequestForUser = internalMutation({
  args: { userId: v.string(), amountKobo: v.number() },
  handler: async (ctx, args) => {
    const reference = `MKX-${crypto.randomUUID()}`;
    const now = Date.now();
    await ctx.db.insert("fundingRequests", { userId: args.userId, amountKobo: args.amountKobo, reference, status: "pending", createdAt: now });
    await ctx.db.insert("walletTransactions", { userId: args.userId, type: "credit", amountKobo: args.amountKobo, description: "Paystack wallet funding", reference, status: "pending", createdAt: now });
    return reference;
  },
});

export const applyVerifiedPayment = internalMutation({
  args: { userId: v.string(), reference: v.string(), amountKobo: v.number(), successful: v.boolean() },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("fundingRequests").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
    if (!request || request.userId !== args.userId) throw new Error("Funding request not found");
    if (request.status === "completed") return;
    if (!args.successful) {
      await ctx.db.patch(request._id, { status: "failed" });
      const tx = await ctx.db.query("walletTransactions").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
      if (tx) await ctx.db.patch(tx._id, { status: "failed" });
      return;
    }
    if (args.amountKobo !== request.amountKobo) throw new Error("Payment amount does not match funding request");
    const wallet = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (!wallet) throw new Error("Wallet is not initialized");
    const now = Date.now();
    await ctx.db.patch(wallet._id, { balanceKobo: wallet.balanceKobo + request.amountKobo, updatedAt: now });
    await ctx.db.patch(request._id, { status: "completed", completedAt: now });
    const tx = await ctx.db.query("walletTransactions").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
    if (tx) await ctx.db.patch(tx._id, { status: "confirmed", description: "Paystack wallet funding confirmed" });
  },
});

export const applyWebhookPayment = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), successful: v.boolean() },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("fundingRequests").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
    if (!request || request.status === "completed") return;
    if (!args.successful || args.amountKobo !== request.amountKobo) {
      await ctx.db.patch(request._id, { status: "failed" });
      const tx = await ctx.db.query("walletTransactions").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
      if (tx) await ctx.db.patch(tx._id, { status: "failed" });
      return;
    }
    const wallet = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", request.userId)).unique();
    if (!wallet) throw new Error("Wallet is not initialized");
    const now = Date.now();
    await ctx.db.patch(wallet._id, { balanceKobo: wallet.balanceKobo + request.amountKobo, updatedAt: now });
    await ctx.db.patch(request._id, { status: "completed", completedAt: now });
    const tx = await ctx.db.query("walletTransactions").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
    if (tx) await ctx.db.patch(tx._id, { status: "confirmed", description: "Paystack wallet funding confirmed" });
  },
});

export const markFailed = internalMutation({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("fundingRequests").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
    if (!request || request.status !== "pending") return;
    await ctx.db.patch(request._id, { status: "failed" });
    const tx = await ctx.db.query("walletTransactions").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
    if (tx) await ctx.db.patch(tx._id, { status: "failed" });
  },
});

import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const baseUrl = () => (process.env.RESELLER_API_BASE_URL ?? "").replace(/\/$/, "");
const apiKey = () => process.env.RESELLER_API_KEY ?? "";
const markup = () => Number(process.env.MARKUP_PERCENT ?? "10");

function requireAdmin(identity: { email?: string | null } | null) {
  if (!identity) throw new Error("Authentication required");
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!identity.email || !allowed.includes(identity.email.toLowerCase())) throw new Error("Admin access required");
}

export const syncProducts = action({
  args: {},
  handler: async (ctx) => {
    requireAdmin(await ctx.auth.getUserIdentity());
    if (!baseUrl() || !apiKey()) throw new Error("Reseller provider is not configured");
    const response = await fetch(`${baseUrl()}/api/reseller/products`, { headers: { "X-Api-Key": apiKey() }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    const payload = await response.json() as { success?: boolean; data?: Array<{ id: number; name: string; description?: string; reseller_price?: number; category?: string }> };
    if (!payload.success || !payload.data) throw new Error("Provider returned an invalid product response");
    const products = payload.data.map((p) => ({ providerProductId: String(p.id), name: p.name, description: p.description, category: p.category, priceKobo: Math.round(Number(p.reseller_price ?? 0) * 100 * (1 + markup() / 100)), active: true, updatedAt: Date.now() })).filter((p) => p.priceKobo > 0);
    return await ctx.runMutation(internal.provider.replaceProducts, { products });
  },
});

export const replaceProducts = internalMutation({
  args: { products: v.array(v.object({ providerProductId: v.string(), name: v.string(), description: v.optional(v.string()), category: v.optional(v.string()), priceKobo: v.number(), active: v.boolean(), updatedAt: v.number() })) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("products").collect();
    for (const product of existing) await ctx.db.patch(product._id, { active: false, updatedAt: Date.now() });
    for (const product of args.products) await ctx.db.insert("products", product);
    return args.products.length;
  },
});

export const reserveWallet = internalMutation({
  args: { userId: v.string(), productId: v.id("products"), qty: v.number() },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product || !product.active || !product.providerProductId) throw new Error("Product is unavailable");
    const wallet = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (!wallet) throw new Error("Wallet is not initialized");
    const totalKobo = product.priceKobo * args.qty;
    if (wallet.balanceKobo < totalKobo) throw new Error("Insufficient wallet balance");
    const now = Date.now();
    await ctx.db.patch(wallet._id, { balanceKobo: wallet.balanceKobo - totalKobo, updatedAt: now });
    const orderId = await ctx.db.insert("orders", { userId: args.userId, productId: product._id, productName: product.name, qty: args.qty, unitPriceKobo: product.priceKobo, totalKobo, status: "processing", createdAt: now });
    return { orderId, providerProductId: product.providerProductId };
  },
});

export const completeOrder = internalMutation({
  args: { orderId: v.id("orders"), providerOrderId: v.optional(v.string()), details: v.array(v.string()) },
  handler: async (ctx, args) => { await ctx.db.patch(args.orderId, { status: "completed", providerOrderId: args.providerOrderId, productDetails: args.details }); },
});

export const failAndRefund = internalMutation({
  args: { orderId: v.id("orders"), reason: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order || order.status !== "processing") return;
    const wallet = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", order.userId)).unique();
    if (!wallet) throw new Error("Wallet missing during refund");
    await ctx.db.patch(wallet._id, { balanceKobo: wallet.balanceKobo + order.totalKobo, updatedAt: Date.now() });
    await ctx.db.patch(order._id, { status: "failed", replacementNote: args.reason });
    await ctx.db.insert("walletTransactions", { userId: order.userId, type: "credit", amountKobo: order.totalKobo, description: `Refund for failed order #${order._id}`, reference: `refund-${order._id}`, status: "confirmed", createdAt: Date.now() });
  },
});

export const placeOrder = action({
  args: { productId: v.id("products"), qty: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    if (!Number.isSafeInteger(args.qty) || args.qty < 1 || args.qty > 1000) throw new Error("Invalid quantity");
    if (!baseUrl() || !apiKey()) throw new Error("Reseller provider is not configured");
    const reservation = await ctx.runMutation(internal.provider.reserveWallet, { userId: identity.subject, productId: args.productId, qty: args.qty });
    try {
      const response = await fetch(`${baseUrl()}/api/reseller/order`, { method: "POST", headers: { "X-Api-Key": apiKey(), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ product_id: Number(reservation.providerProductId), qty: args.qty, api_key: apiKey() }), signal: AbortSignal.timeout(30000) });
      const payload = await response.json() as { success?: boolean; message?: string; order_id?: string | number; delivered?: Array<{ details?: string }> };
      if (!response.ok || !payload.success) throw new Error(payload.message || `Provider returned HTTP ${response.status}`);
      const details = Array.isArray(payload.delivered) ? payload.delivered.map((d) => String(d.details ?? "")).filter(Boolean) : [];
      await ctx.runMutation(internal.provider.completeOrder, { orderId: reservation.orderId, providerOrderId: payload.order_id == null ? undefined : String(payload.order_id), details });
      return { orderId: reservation.orderId };
    } catch (error) {
      await ctx.runMutation(internal.provider.failAndRefund, { orderId: reservation.orderId, reason: error instanceof Error ? error.message : "Provider order failed" });
      throw error;
    }
  },
});

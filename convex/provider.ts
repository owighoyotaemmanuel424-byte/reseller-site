import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const JEJELAYE_BASE_URL = "https://jejelayegct.com.ng/api/v1";

function baseUrl() {
  return (process.env.JEJELAYE_API_BASE_URL || JEJELAYE_BASE_URL).replace(/\/$/, "");
}

function apiToken() {
  return process.env.JEJELAYE_API_TOKEN || "";
}

function markupPercent() {
  const value = Number(process.env.MARKUP_PERCENT ?? "10");
  return Number.isFinite(value) && value >= 0 ? value : 10;
}

function moneyToKobo(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid provider price");
  return Math.round(amount * 100);
}

function sellingPriceKobo(providerPriceKobo: number) {
  return Math.round(providerPriceKobo * (1 + markupPercent() / 100));
}

async function jejelaye(path: string, init: RequestInit = {}) {
  const token = apiToken();
  if (!token) throw new Error("JEJELAYE_API_TOKEN is not configured");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
  if (!response.ok) {
    throw new Error(String(payload?.message || `JejeLaye returned HTTP ${response.status}`));
  }
  return { status: response.status, payload };
}

function extractServices(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export const syncProducts = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.auth.requireAdmin, {});
    const { payload } = await jejelaye("/services");
    const services = extractServices(payload);
    if (!services.length) throw new Error("JejeLaye returned no services");

    const products = services
      .filter((service) => service?.id != null && service?.name && service?.is_active !== false)
      .map((service) => {
        const providerPriceKobo = moneyToKobo(service.selling_price ?? 0);
        const metadata = service.metadata && typeof service.metadata === "object" ? service.metadata : {};
        const type = String(service.type || service.category?.slug || "digital");
        return {
          providerProductId: String(service.id),
          provider: "jejelayelaye",
          serviceType: type,
          name: String(service.name),
          description: JSON.stringify(metadata),
          metadataJson: JSON.stringify(metadata),
          category: String(service.category?.slug || type),
          priceKobo: sellingPriceKobo(providerPriceKobo),
          minAmountKobo: service.min_amount == null ? undefined : moneyToKobo(service.min_amount),
          maxAmountKobo: service.max_amount == null ? undefined : moneyToKobo(service.max_amount),
          active: true,
          updatedAt: Date.now(),
        };
      });

    return await ctx.runMutation(internal.provider.replaceProducts, { products });
  },
});

export const replaceProducts = internalMutation({
  args: {
    products: v.array(v.object({
      providerProductId: v.string(),
      provider: v.string(),
      serviceType: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      metadataJson: v.optional(v.string()),
      category: v.optional(v.string()),
      priceKobo: v.number(),
      minAmountKobo: v.optional(v.number()),
      maxAmountKobo: v.optional(v.number()),
      active: v.boolean(),
      updatedAt: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("products").collect();
    for (const product of existing) {
      await ctx.db.patch(product._id, { active: false, updatedAt: Date.now() });
    }
    for (const product of args.products) {
      const old = await ctx.db.query("products").withIndex("by_provider_id", (q) => q.eq("providerProductId", product.providerProductId)).unique();
      if (old) await ctx.db.patch(old._id, product);
      else await ctx.db.insert("products", product);
    }
    return args.products.length;
  },
});

export const reserveWallet = internalMutation({
  args: { userId: v.string(), productId: v.id("products"), qty: v.number(), purchaseDataJson: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product || !product.active || !product.providerProductId) throw new Error("Product is unavailable");
    if (!Number.isSafeInteger(args.qty) || args.qty < 1 || args.qty > 1000000) throw new Error("Invalid quantity");

    const wallet = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (!wallet) throw new Error("Wallet is not initialized");

    let totalKobo = product.priceKobo * args.qty;
    if (args.purchaseDataJson) {
      try {
        const data = JSON.parse(args.purchaseDataJson) as { amount?: unknown; quantity?: unknown };
        if (product.serviceType === "airtime" || product.serviceType === "electricity") {
          const amount = Number(data.amount);
          if (!Number.isFinite(amount) || amount <= 0) throw new Error("A valid amount is required");
          totalKobo = Math.round(amount * 100 * (1 + markupPercent() / 100));
        } else if (product.serviceType === "social_boost" || product.serviceType === "print_card") {
          const quantity = Number(data.quantity ?? args.qty);
          if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Invalid quantity");
          totalKobo = product.priceKobo * quantity;
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error("Invalid purchase details");
      }
    }
    if (!Number.isSafeInteger(totalKobo) || totalKobo <= 0) throw new Error("Invalid order amount");
    if (wallet.balanceKobo < totalKobo) throw new Error("Insufficient wallet balance");

    const now = Date.now();
    await ctx.db.patch(wallet._id, { balanceKobo: wallet.balanceKobo - totalKobo, updatedAt: now });

    const orderId = await ctx.db.insert("orders", {
      userId: args.userId,
      productId: product._id,
      productName: product.name,
      qty: args.qty,
      unitPriceKobo: product.priceKobo,
      totalKobo,
      status: "processing",
      provider: product.provider || "jejelayelaye",
      purchaseDataJson: args.purchaseDataJson,
      createdAt: now,
    });

    await ctx.db.insert("walletTransactions", {
      userId: args.userId,
      type: "debit",
      amountKobo: totalKobo,
      description: `Purchase: ${product.name}`,
      reference: `ORDER-${orderId}`,
      status: "confirmed",
      createdAt: now,
    });

    return { orderId, providerProductId: product.providerProductId, product };
  },
});

export const completeOrder = internalMutation({
  args: { orderId: v.id("orders"), providerOrderId: v.optional(v.string()), details: v.array(v.string()), final: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      status: args.final ? "completed" : "processing",
      providerOrderId: args.providerOrderId,
      productDetails: args.details,
    });
  },
});

export const failAndRefund = internalMutation({
  args: { orderId: v.id("orders"), reason: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order || order.status !== "processing") return;
    const wallet = await ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", order.userId)).unique();
    if (!wallet) throw new Error("Wallet missing during refund");
    const now = Date.now();
    await ctx.db.patch(wallet._id, { balanceKobo: wallet.balanceKobo + order.totalKobo, updatedAt: now });
    await ctx.db.patch(order._id, { status: "failed", replacementNote: args.reason });
    await ctx.db.insert("walletTransactions", {
      userId: order.userId,
      type: "credit",
      amountKobo: order.totalKobo,
      description: `Refund for failed order #${order._id}`,
      reference: `REFUND-${order._id}`,
      status: "confirmed",
      createdAt: now,
    });
  },
});

export const placeOrder = action({
  args: {
    productId: v.id("products"),
    qty: v.number(),
    purchaseData: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    let purchaseData: Record<string, unknown> = {};
    if (args.purchaseData) {
      try {
        const parsed = JSON.parse(args.purchaseData);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        purchaseData = parsed;
      } catch {
        throw new Error("Invalid purchase details");
      }
    }

    const reservation = await ctx.runMutation(internal.provider.reserveWallet, {
      userId: identity.subject,
      productId: args.productId,
      qty: args.qty,
      purchaseDataJson: args.purchaseData,
    });

    try {
      const path = `/services/${encodeURIComponent(reservation.providerProductId)}/purchase`;
      const { status, payload } = await jejelaye(path, {
        method: "POST",
        body: JSON.stringify(purchaseData),
      });

      const transaction = payload?.transaction;
      const providerReference = transaction?.reference != null ? String(transaction.reference) : undefined;
      const providerStatus = String(transaction?.status || "").toLowerCase();
      const successful = providerStatus === "successful" || providerStatus === "success" || status === 200 && payload?.message?.toLowerCase?.().includes("completed");
      const accepted = status === 202 || providerStatus === "pending" || providerStatus === "processing";

      if (!successful && !accepted) {
        throw new Error(String(payload?.message || transaction?.api_response || "JejeLaye purchase failed"));
      }

      const details: string[] = [];
      if (transaction?.api_response) details.push(String(transaction.api_response));
      if (Array.isArray(payload?.meta?.fulfillment_items)) details.push(...payload.meta.fulfillment_items.map((item: unknown) => JSON.stringify(item)));

      await ctx.runMutation(internal.provider.completeOrder, {
        orderId: reservation.orderId,
        providerOrderId: providerReference,
        details,
        final: successful,
      });

      return {
        orderId: reservation.orderId,
        status: successful ? "completed" : "processing",
        providerReference,
        message: payload?.message || transaction?.api_response || "Purchase accepted",
      };
    } catch (error) {
      await ctx.runMutation(internal.provider.failAndRefund, {
        orderId: reservation.orderId,
        reason: error instanceof Error ? error.message : "JejeLaye purchase failed",
      });
      throw error;
    }
  },
});

import { action, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";


const PAYSTACK_API = "https://api.paystack.co";

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return key;
}

export async function verifyPaystackSignature(payload: string, signature: string | null) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey()),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

export const createFundingRequest = mutation({
  args: {
    amountKobo: v.number(),
  },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Authentication required");
    }

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
  args: {
    amountKobo: v.number(),
  },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Authentication required");
    }

    if (!identity.email) {
      throw new Error("Your account needs an email address before payment.");
    }

    const reference = await ctx.runMutation(
      internal.paystack.createFundingRequestForUser,
      {
        userId: identity.subject,
        amountKobo: args.amountKobo,
      }
    );

    const response = await fetch(
      `${PAYSTACK_API}/transaction/initialize`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: identity.email,
          amount: String(args.amountKobo),
          currency: "NGN",
          reference,
          callback_url: siteUrl()
            ? `${siteUrl()}/wallet`
            : undefined,
        }),
      }
    );

    const payload = await response.json() as {
      status?: boolean;
      message?: string;
      data?: {
        authorization_url?: string;
      };
    };

    if (
      !response.ok ||
      !payload.status ||
      !payload.data?.authorization_url
    ) {
      throw new Error(
        payload.message ?? "Paystack initialization failed"
      );
    }

    return {
      authorizationUrl: payload.data.authorization_url,
      reference,
    };
  },
});


export const createFundingRequestForUser = internalMutation({
  args: {
    userId: v.string(),
    amountKobo: v.number(),
  },

  handler: async (ctx, args) => {
    const reference = `MKX-${crypto.randomUUID()}`;
    const now = Date.now();

    await ctx.db.insert("fundingRequests", {
      userId: args.userId,
      amountKobo: args.amountKobo,
      reference,
      status: "pending",
      createdAt: now,
    });

    await ctx.db.insert("walletTransactions", {
      userId: args.userId,
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


export const applyWebhookPayment = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    reference: v.string(),
    amountKobo: v.number(),
    currency: v.string(),
    successful: v.boolean(),
  },

  handler: async (ctx, args) => {

    const existingEvent = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", args.eventId)
      )
      .unique();

    if (existingEvent) {
      return;
    }


    if (!args.reference) {
      throw new Error("Missing payment reference");
    }

    if (!args.successful) {
      throw new Error("Payment was not successful");
    }

    if (args.currency !== "NGN") {
      throw new Error("Invalid payment currency");
    }


    const request = await ctx.db
      .query("fundingRequests")
      .withIndex("by_reference", (q) =>
        q.eq("reference", args.reference)
      )
      .unique();


    if (!request) {
      throw new Error("Funding request not found");
    }


    if (request.amountKobo !== args.amountKobo) {
      throw new Error("Payment amount mismatch");
    }


    const duplicateLedger = await ctx.db
      .query("walletLedger")
      .withIndex("by_reference", (q) =>
        q.eq("reference", args.reference)
      )
      .unique();


    if (duplicateLedger) {
      return;
    }


    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) =>
        q.eq("userId", request.userId)
      )
      .unique();


    if (!wallet) {
      throw new Error("Wallet not initialized");
    }


    const now = Date.now();


    await ctx.db.insert("webhookEvents", {
      eventId: args.eventId,
      reference: args.reference,
      eventType: args.eventType,
      processedAt: now,
      createdAt: now,
    });


    await ctx.db.insert("walletLedger", {
      userId: request.userId,
      walletId: wallet._id,
      amountKobo: request.amountKobo,
      currency: args.currency,
      type: "credit",
      status: "confirmed",
      reference: args.reference,
      eventId: args.eventId,
      createdAt: now,
    });


    await ctx.db.patch(wallet._id, {
      balanceKobo:
        wallet.balanceKobo + request.amountKobo,
      updatedAt: now,
    });


    await ctx.db.patch(request._id, {
      status: "completed",
      completedAt: now,
    });


    const transaction = await ctx.db
      .query("walletTransactions")
      .withIndex("by_reference", (q) =>
        q.eq("reference", args.reference)
      )
      .unique();


    if (transaction) {
      await ctx.db.patch(transaction._id, {
        status: "confirmed",
        description:
          "Paystack wallet funding confirmed",
      });
    }
  },
});


export const markFailed = internalMutation({
  args: {
    reference: v.string(),
  },

  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("fundingRequests")
      .withIndex("by_reference", (q) =>
        q.eq("reference", args.reference)
      )
      .unique();

    if (!request) return;

    await ctx.db.patch(request._id, {
      status: "failed",
    });
  },
});
export const verify = action({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const response = await fetch(PAYSTACK_API + "/transaction/verify/" + encodeURIComponent(args.reference), {
      headers: { Authorization: "Bearer " + secretKey(), Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json() as {
      status?: boolean;
      message?: string;
      data?: { id?: number; status?: string; amount?: number; currency?: string; reference?: string };
    };

    if (!response.ok || !payload.status || !payload.data) {
      throw new Error(payload.message || "Paystack verification failed");
    }

    if (String(payload.data.status).toLowerCase() !== "success") {
      await ctx.runMutation(internal.paystack.markFailed, { reference: args.reference });
      throw new Error("Payment has not been confirmed by Paystack");
    }

    await ctx.runMutation(internal.paystack.applyWebhookPayment, {
      eventId: "manual-verify-" + String(payload.data.id ?? args.reference),
      eventType: "charge.success",
      reference: args.reference,
      amountKobo: Number(payload.data.amount ?? 0),
      currency: String(payload.data.currency ?? "NGN"),
      successful: true,
    });

    return { success: true, reference: args.reference };
  },
});

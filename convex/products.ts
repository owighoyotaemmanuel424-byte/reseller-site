import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("products").withIndex("by_active", (q) => q.eq("active", true)).collect(),
});

export const seed = mutation({
  args: { products: v.array(v.object({ name: v.string(), description: v.optional(v.string()), priceKobo: v.number(), category: v.optional(v.string()) })) },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.auth.requireAdmin, {});
    const now = Date.now();
    for (const product of args.products) await ctx.db.insert("products", { ...product, active: true, updatedAt: now });
  },
});

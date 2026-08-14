import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function requireAdmin(identity: { email?: string | null } | null) {
  if (!identity) throw new Error("Authentication required");
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!identity.email || !allowed.includes(identity.email.toLowerCase())) throw new Error("Admin access required");
}

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("products").withIndex("by_active", (q) => q.eq("active", true)).collect(),
});

export const seed = mutation({
  args: { products: v.array(v.object({ name: v.string(), description: v.optional(v.string()), priceKobo: v.number(), category: v.optional(v.string()) })) },
  handler: async (ctx, args) => {
    requireAdmin(await ctx.auth.getUserIdentity());
    const now = Date.now();
    for (const product of args.products) await ctx.db.insert("products", { ...product, active: true, updatedAt: now });
  },
});

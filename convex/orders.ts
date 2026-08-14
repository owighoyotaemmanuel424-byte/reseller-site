import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  return await ctx.db.query("orders").withIndex("by_user", (q) => q.eq("userId", identity.subject)).order("desc").take(100);
}});

export const report = mutation({
  args: { orderId: v.id("orders"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== identity.subject) throw new Error("Order not found");
    if (Date.now() - order.createdAt > 2 * 60 * 60 * 1000) throw new Error("Orders can only be reported within 2 hours");
    if (order.reportedAt) throw new Error("Order already reported");
    await ctx.db.patch(order._id, { status: "reported", reportedAt: Date.now(), reportReason: args.reason?.slice(0, 500) });
  },
});

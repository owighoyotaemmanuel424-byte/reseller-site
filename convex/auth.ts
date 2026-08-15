import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const requireAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const user = await ctx.db.query("users").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).unique();
    if (!user || user.role !== "admin") throw new Error("Admin access required");
    return true;
  },
});

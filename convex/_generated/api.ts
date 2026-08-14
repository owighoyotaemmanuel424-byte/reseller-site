// Temporary checked-in fallback for CI/frontend builds when Convex codegen is not run locally.
// Convex's `anyApi` creates valid function references at runtime. Production Convex
// deployments still run codegen via `npx convex deploy`.
export { anyApi as api, anyApi as internal } from "convex/server";

// Temporary checked-in fallback for CI/Vercel builds when Convex codegen is not
// materialized in the repository. `convex deploy` performs the real codegen for
// the production deployment; these exports keep Next.js typechecking working
// before generated files are available on disk.
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";

export const query = queryGeneric;
export const internalQuery = internalQueryGeneric;
export const mutation = mutationGeneric;
export const internalMutation = internalMutationGeneric;
export const action = actionGeneric;
export const internalAction = internalActionGeneric;
export const httpAction = httpActionGeneric;

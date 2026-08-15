"use client";

import { useConvexAuth } from "convex/react";

export function useAuth() {
  const { isAuthenticated } = useConvexAuth();
  return {
    user: isAuthenticated ? { authenticated: true } : null,
  };
}

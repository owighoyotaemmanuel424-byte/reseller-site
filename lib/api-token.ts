import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db";

export function createApiToken() {
  return `mkx_${randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getApiUser(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const hash = hashApiToken(match[1].trim());
  const rows = await sql`SELECT id,email,role FROM users WHERE api_token_hash=${hash} LIMIT 1`;
  return rows[0] || null;
}

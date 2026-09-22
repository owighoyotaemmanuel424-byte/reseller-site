import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createApiToken, hashApiToken } from "@/lib/api-token";
import { sql } from "@/lib/db";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const token = createApiToken();
  await sql`UPDATE users SET api_token_hash=${hashApiToken(token)} WHERE id=${user.id}`;
  return NextResponse.json({ apiToken: token });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const w = await sql`SELECT id,balance_kobo AS "balanceKobo" FROM wallets WHERE user_id=${u.id}`;
  const t = await sql`SELECT type,amount_kobo AS "amountKobo",description,reference,status,created_at AS "createdAt" FROM wallet_transactions WHERE user_id=${u.id} ORDER BY created_at DESC LIMIT 100`;
  return NextResponse.json({ wallet:w[0] ?? null, transactions:t });
}

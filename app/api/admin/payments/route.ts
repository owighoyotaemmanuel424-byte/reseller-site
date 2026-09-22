import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const [funding, transactions, webhooks] = await Promise.all([
    sql`
      SELECT f.id, f.user_id AS "userId", u.email, f.amount_kobo AS "amountKobo",
             f.reference, f.status, f.created_at AS "createdAt", f.completed_at AS "completedAt"
      FROM funding_requests f JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC LIMIT 500
    `,
    sql`
      SELECT t.id, t.user_id AS "userId", u.email, t.type, t.amount_kobo AS "amountKobo",
             t.description, t.reference, t.status, t.created_at AS "createdAt"
      FROM wallet_transactions t JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC LIMIT 500
    `,
    sql`
      SELECT id, event_id AS "eventId", reference, event_type AS "eventType", processed_at AS "processedAt"
      FROM webhook_events ORDER BY processed_at DESC LIMIT 500
    `,
  ]);

  return NextResponse.json({
    funding: funding.map((row) => ({ ...row, amountKobo: Number(row.amountKobo) })),
    transactions: transactions.map((row) => ({ ...row, amountKobo: Number(row.amountKobo) })),
    webhooks,
  });
}

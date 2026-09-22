import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const rows = await sql`
    SELECT
      o.id,
      o.user_id AS "userId",
      u.email,
      o.product_name AS "productName",
      o.qty,
      o.total_kobo AS "totalKobo",
      o.status,
      o.provider_order_id AS "providerOrderId",
      o.created_at AS "createdAt",
      o.report_reason AS "reportReason"
    FROM orders o
    JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
    LIMIT 500
  `;

  return NextResponse.json(rows.map((row) => ({ ...row, totalKobo: Number(row.totalKobo) })));
}

export async function PATCH(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json();
  const allowed = ["pending", "processing", "completed", "failed", "reported", "refunded"];
  if (!body.orderId || !allowed.includes(body.status)) {
    return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
  }

  const rows = await sql`
    UPDATE orders SET status = ${body.status}
    WHERE id = ${body.orderId}
    RETURNING id, status
  `;
  if (!rows[0]) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  await audit(user.id, "order.status_updated", "order", body.orderId, { status: body.status });
  return NextResponse.json(rows[0]);
}

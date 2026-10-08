import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, audit } from '@/lib/admin';
import { sql } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const rows = await sql`
    SELECT
      o.id, o.user_id AS "userId", u.email, o.product_name AS "productName",
      o.qty, o.total_kobo AS "totalKobo", o.amount_cost AS "amountCost",
      o.amount_sold AS "amountSold", o.profit, o.status, o.provider_order_id AS "providerOrderId",
      o.provider_ref AS "providerRef", o.provider_session AS "providerSession",
      o.request_payload AS "requestPayload", o.response_payload AS "responsePayload",
      o.api_response AS "apiResponse", o.failure_reason AS "failureReason",
      o.customer_ref AS "customerRef", o.created_at AS "createdAt", o.updated_at AS "updatedAt",
      o.report_reason AS "reportReason", o.reported_at AS "reportedAt"
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.id = ${id}
    LIMIT 1
  `;

  if (!rows[0]) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const row = rows[0];
  return NextResponse.json({
    data: {
      ...row,
      totalKobo: Number(row.totalKobo),
      amountCost: Number(row.amountCost),
      amountSold: Number(row.amountSold),
      profit: Number(row.profit),
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
      reportedAt: row.reportedAt?.toISOString(),
    },
  });
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const body = z.object({
    status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'reported']),
  }).parse(await _req.json());

  const result = await sql`
    UPDATE orders SET status = ${body.status}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, status
  `;

  if (!result[0]) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  await audit(admin.id, 'order.status_updated', 'order', id, { status: body.status });

  return NextResponse.json({ data: { id: result[0].id, status: result[0].status } });
}

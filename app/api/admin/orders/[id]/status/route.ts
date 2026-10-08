import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { sql } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const rows = await sql`
    SELECT id, status, provider_order_id AS "providerOrderId", provider_ref AS "providerRef",
           failure_reason AS "failureReason", report_reason AS "reportReason",
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM orders WHERE id = ${id} LIMIT 1
  `;

  if (!rows[0]) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const row = rows[0];
  return NextResponse.json({
    data: {
      ...row,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    },
    status: row.status,
  });
}

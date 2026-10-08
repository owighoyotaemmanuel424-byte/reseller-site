import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/admin';
import { sql } from '@/lib/db';

export async function GET(_req: Request) {
  const admin = await requireAdminPermission('tickets.view');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { searchParams } = new URL(_req.url);
  const status = searchParams.get('status');
  const category = searchParams.get('category');

  let whereClause = '1=1';
  const params: any[] = [];

  if (status) {
    whereClause += ' AND t.status = $' + (params.length + 1);
    params.push(status);
  }
  if (category) {
    whereClause += ' AND t.category = $' + (params.length + 1);
    params.push(category);
  }

  const rows = await sql`
    SELECT t.id, t.subject, t.category, t.status, t.priority, t.user_id AS "userId",
           u.email, u.full_name AS "fullName", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
           (SELECT COUNT(*)::int FROM support_messages WHERE ticket_id = t.id) AS messageCount
    FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    WHERE ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json({
    data: rows.map(r => ({
      ...r,
      createdAt: r.createdAt?.toISOString(),
      updatedAt: r.updatedAt?.toISOString(),
    })),
  });
}

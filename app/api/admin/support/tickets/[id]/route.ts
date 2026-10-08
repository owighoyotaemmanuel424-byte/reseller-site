import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, requireAdminPermission, audit } from '@/lib/admin';
import { sql } from '@/lib/db';
import { randomUUID } from 'node:crypto';

const replyBody = z.object({
  message: z.string().min(1).max(5000),
  status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;

  const [ticket, messages] = await Promise.all([
    sql`
      SELECT t.id, t.subject, t.category, t.status, t.priority, t.user_id AS "userId",
             u.email, u.full_name AS "fullName", t.created_at AS "createdAt", t.updated_at AS "updatedAt"
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = ${id} LIMIT 1
    `,
    sql`
      SELECT sm.id, sm.ticket_id AS "ticketId", sm.admin_id AS "adminId", sm.user_id AS "userId",
             sm.message, sm.created_at AS "createdAt",
             u.email AS "userEmail", a.email AS "adminEmail"
      FROM support_messages sm
      LEFT JOIN users u ON u.id = sm.user_id
      LEFT JOIN users a ON a.id = sm.admin_id
      WHERE sm.ticket_id = ${id}
      ORDER BY sm.created_at ASC
    `,
  ]);

  if (!ticket[0]) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

  const row = ticket[0];
  return NextResponse.json({
    data: {
      ...row,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
      messages: messages.map(m => ({
        ...m,
        createdAt: m.createdAt?.toISOString(),
        userEmail: m.userEmail || 'customer',
        adminEmail: m.adminEmail || null,
      })),
    },
  });
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const body = replyBody.parse(await _req.json());

  const existing = await sql`
    SELECT id, status FROM support_tickets WHERE id = ${id} LIMIT 1
  `;

  if (!existing[0]) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

  if (body.status) {
    await sql`
      UPDATE support_tickets SET status = ${body.status}, updated_at = now()
      WHERE id = ${id}
    `;
  }

  const messageId = randomUUID();
  await sql`
    INSERT INTO support_messages(id, ticket_id, admin_id, message, created_at)
    VALUES(${messageId}, ${id}, ${admin.id}, ${body.message}, now())
  `;

  await audit(admin.id, 'ticket.reply', 'ticket', id, {
    subject: existing[0]?.subject,
    status: body.status || existing[0]?.status,
  });

  return NextResponse.json({
    ok: true,
    messageId,
  });
}

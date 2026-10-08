import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAdminPermission, audit } from '@/lib/admin';
import { sql } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminPermission('payments.view');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;

  const [fundingRow, transactions] = await Promise.all([
    sql`
      SELECT f.id, f.user_id AS "userId", u.email, f.amount_kobo AS "amountKobo",
             f.reference, f.status, f.created_at AS "createdAt", f.completed_at AS "completedAt"
      FROM funding_requests f
      JOIN users u ON u.id = f.user_id
      WHERE f.id = ${id} OR f.reference = ${id}
      LIMIT 1
    `,
    sql`
      SELECT t.id, t.user_id AS "userId", u.email, t.type, t.amount_kobo AS "amountKobo",
             t.description, t.reference, t.status, t.created_at AS "createdAt"
      FROM wallet_transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.reference = ${id} OR t.id = ${id}
      ORDER BY t.created_at DESC
    `,
  ]);

  if (!fundingRow[0]) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  const row = fundingRow[0];
  return NextResponse.json({
    data: {
      ...row,
      amountKobo: Number(row.amountKobo),
      createdAt: row.createdAt?.toISOString(),
      completedAt: row.completedAt?.toISOString(),
    },
    transactions: transactions.map(t => ({
      ...t,
      amountKobo: Number(t.amountKobo),
      createdAt: t.createdAt?.toISOString(),
    })),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission('payments.manage');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const body = z.object({
    action: z.enum(['verify', 'refund']),
    reason: z.string().min(3).max(500).optional(),
  }).parse(await _req.json());

  if (body.action === 'verify') {
    const rows = await sql`
      SELECT f.id, f.user_id AS "userId", f.amount_kobo AS "amountKobo", f.reference, f.status
      FROM funding_requests f
      WHERE f.id = ${id} OR f.reference = ${id}
      LIMIT 1
    `;

    if (!rows[0]) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

    await audit(admin.id, 'payment.verified', 'payment', id, {
      reference: rows[0].reference,
      status: rows[0].status,
    });

    return NextResponse.json({
      data: {
        id: rows[0].id,
        reference: rows[0].reference,
        amountKobo: Number(rows[0].amountKobo),
        status: rows[0].status,
        verified: true,
      },
    });
  }

  if (body.action === 'refund') {
    const rows = await sql`
      SELECT f.id, f.user_id AS "userId", f.amount_kobo AS "amountKobo", f.reference, f.status
      FROM funding_requests f
      WHERE f.id = ${id} OR f.reference = ${id}
      LIMIT 1
    `;

    if (!rows[0]) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    if (rows[0].status === 'refunded') return NextResponse.json({ error: 'Already refunded' }, { status: 400 });
    if (rows[0].status !== 'completed') {
      return NextResponse.json({ error: 'Only completed payments can be refunded' }, { status: 400 });
    }

    const refundRef = `REF-${randomUUID()}`;
    const reason = body.reason || 'Funding refund';

    // Reverse the credit atomically: mark the request refunded, debit the wallet,
    // and record matching transaction + ledger entries in a single statement.
    const refunded = await sql`
      WITH target AS (
        UPDATE funding_requests SET status='refunded', completed_at=now()
        WHERE id=${rows[0].id} AND status='completed'
        RETURNING user_id, amount_kobo
      ), debited AS (
        UPDATE wallets w SET balance_kobo=w.balance_kobo-t.amount_kobo, updated_at=now()
        FROM target t WHERE w.user_id=t.user_id AND w.balance_kobo>=t.amount_kobo
        RETURNING w.id, w.user_id, t.amount_kobo
      ), tx AS (
        INSERT INTO wallet_transactions(user_id,type,amount_kobo,description,reference,status)
        SELECT user_id,'debit',amount_kobo,${reason},${refundRef},'confirmed' FROM debited
      ), ledger AS (
        INSERT INTO wallet_ledger(user_id,wallet_id,type,amount_kobo,currency,status,reference,description)
        SELECT user_id,id,'debit',amount_kobo,'NGN','confirmed',${refundRef},${reason} FROM debited
      ) SELECT user_id, amount_kobo FROM debited
    `;

    if (!refunded[0]) {
      // Wallet was short (already spent) — roll the request back to completed.
      await sql`
        UPDATE funding_requests SET status='completed'
        WHERE id=${rows[0].id} AND status='refunded'
      `;
      return NextResponse.json({ error: 'Insufficient wallet balance to reverse this funding' }, { status: 400 });
    }

    await audit(admin.id, 'payment.refunded', 'payment', id, {
      reference: rows[0].reference,
      amountKobo: Number(refunded[0].amount_kobo),
      reason,
    });

    return NextResponse.json({
      ok: true,
      reference: refundRef,
      amountKobo: Number(refunded[0].amount_kobo),
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

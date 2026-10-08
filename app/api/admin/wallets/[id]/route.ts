import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAdminPermission, audit } from '@/lib/admin';
import { sql } from '@/lib/db';

const adjustBody = z.object({
  amountKobo: z.number().int().positive().max(100000000000),
  type: z.enum(['credit', 'debit']),
  reason: z.string().min(3).max(500),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminPermission('wallets.view');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;

  const [walletRow, transactions, ledger] = await Promise.all([
    sql`
      SELECT w.id, w.user_id AS "userId", w.balance_kobo AS "balanceKobo", w.updated_at AS "updatedAt"
      FROM wallets w WHERE w.user_id = ${id} LIMIT 1
    `,
    sql`
      SELECT id, type, amount_kobo AS "amountKobo", description, reference, status, created_at AS "createdAt"
      FROM wallet_transactions WHERE user_id = ${id}
      ORDER BY created_at DESC LIMIT 100
    `,
    sql`
      SELECT id, type, amount_kobo AS "amountKobo", currency, status, description, reference, created_at AS "createdAt"
      FROM wallet_ledger WHERE user_id = ${id}
      ORDER BY created_at DESC LIMIT 100
    `,
  ]);

  return NextResponse.json({
    data: {
      wallet: walletRow[0]
        ? {
            ...walletRow[0],
            balanceKobo: Number(walletRow[0].balanceKobo),
            updatedAt: walletRow[0].updatedAt?.toISOString(),
          }
        : null,
      balanceKobo: walletRow[0] ? Number(walletRow[0].balanceKobo) : 0,
      transactions: transactions.map(t => ({
        ...t,
        amountKobo: Number(t.amountKobo),
        createdAt: t.createdAt?.toISOString(),
      })),
      ledger: ledger.map(l => ({
        ...l,
        amountKobo: Number(l.amountKobo),
        createdAt: l.createdAt?.toISOString(),
      })),
    },
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission('wallets.adjust');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const body = adjustBody.parse(await _req.json());
  const reference = `ADMIN-${randomUUID()}`;
  const delta = body.type === 'credit' ? body.amountKobo : -body.amountKobo;

  const result = await sql`
    UPDATE wallets
    SET balance_kobo = balance_kobo + ${delta}, updated_at = now()
    WHERE user_id = ${id} AND balance_kobo + ${delta} >= 0
    RETURNING id, balance_kobo
  `;

  if (!result[0]) {
    return NextResponse.json({ error: 'Wallet not found or insufficient balance' }, { status: 400 });
  }

  await sql`
    INSERT INTO wallet_transactions(user_id, type, amount_kobo, description, reference, status)
    VALUES(${id}, ${body.type}, ${body.amountKobo}, ${body.reason}, ${reference}, 'confirmed')
  `;

  await sql`
    INSERT INTO wallet_ledger(user_id, wallet_id, type, amount_kobo, currency, status, reference, description)
    VALUES(${id}, ${result[0].id}, ${body.type}, ${body.amountKobo}, 'NGN', 'confirmed', ${reference}, ${body.reason})
  `;

  await audit(admin.id, `wallet.${body.type}`, 'wallet', result[0].id, {
    userId: id,
    amountKobo: body.amountKobo,
    type: body.type,
    reason: body.reason,
    reference,
  });

  return NextResponse.json({
    ok: true,
    reference,
    balanceKobo: Number(result[0].balance_kobo),
  });
}

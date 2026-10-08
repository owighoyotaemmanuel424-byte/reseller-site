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

  const [userRow, walletRow, orders, transactions] = await Promise.all([
    sql`
      SELECT id, email, phone, full_name AS "fullName", role, status, kyc_tier AS "kycTier",
             two_factor_secret AS "twoFactorSecret", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM users WHERE id = ${id} LIMIT 1
    `,
    sql`
      SELECT id, user_id AS "userId", balance_kobo AS "balanceKobo", updated_at AS "updatedAt"
      FROM wallets WHERE user_id = ${id} LIMIT 1
    `,
    sql`
      SELECT id, product_name AS "productName", qty, total_kobo AS "totalKobo", status,
             provider_order_id AS "providerOrderId", provider_ref AS "providerRef",
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM orders WHERE user_id = ${id}
      ORDER BY created_at DESC LIMIT 50
    `,
    sql`
      SELECT type, amount_kobo AS "amountKobo", description, reference, status, created_at AS "createdAt"
      FROM wallet_transactions WHERE user_id = ${id}
      ORDER BY created_at DESC LIMIT 50
    `,
  ]);

  if (!userRow[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const user = userRow[0];
  return NextResponse.json({
    data: {
      user: {
        ...user,
        kycTier: Number(user.kycTier),
        createdAt: user.createdAt?.toISOString(),
        updatedAt: user.updatedAt?.toISOString(),
      },
      wallet: walletRow[0]
        ? {
            ...walletRow[0],
            balanceKobo: Number(walletRow[0].balanceKobo),
            updatedAt: walletRow[0].updatedAt?.toISOString(),
          }
        : null,
      orders: orders.map(o => ({
        ...o,
        totalKobo: Number(o.totalKobo),
        createdAt: o.createdAt?.toISOString(),
        updatedAt: o.updatedAt?.toISOString(),
      })),
      transactions: transactions.map(t => ({
        ...t,
        amountKobo: Number(t.amountKobo),
        createdAt: t.createdAt?.toISOString(),
      })),
    },
  });
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const row = await sql`
    SELECT balance_kobo
    FROM wallets
    WHERE user_id = ${u.id}
    LIMIT 1
  `;

  return NextResponse.json({
    balanceKobo: row[0] ? Number(row[0].balance_kobo) : 0,
  });
}

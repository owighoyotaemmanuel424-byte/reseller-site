import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { randomUUID } from 'node:crypto';

const body = z.object({
  amountKobo: z.number().int().positive().max(1_000_000_000),
});

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const token = process.env.JEJELAYE_API_TOKEN || '';
  if (!token)
    return NextResponse.json({ error: 'JEJELAYE_API_TOKEN is not configured' }, { status: 503 });

  const input = body.safeParse(await req.json());
  if (!input.success) return NextResponse.json({ error: input.error.errors[0].message }, { status: 400 });

  const { amountKobo } = input.data;
  const reference = 'TOPUP-' + randomUUID();

  try {
    await sql`
      INSERT INTO funding_requests(user_id, amount_kobo, reference, status)
      VALUES(${u.id}, ${amountKobo}, ${reference}, 'pending')
    `;
    await sql`
      INSERT INTO wallet_transactions(user_id, type, amount_kobo, description, reference, status)
      VALUES(${u.id}, 'credit', ${amountKobo}, ${'Wallet top-up'}, ${reference}, 'pending')
    `;

    const base = (process.env.JEJELAYE_API_BASE_URL || 'https://jejelayegct.com.ng/api/v1').replace(/\/$/, '');
    const r = await fetch(`${base}/services/funding`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, amount: String(amountKobo), email: u.email }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: payload?.message || 'Funding provider request failed' }, { status: 502 });

    return NextResponse.json({ reference, url: payload?.authorization_url || null, status: 'pending' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Top-up failed' }, { status: 400 });
  }
}

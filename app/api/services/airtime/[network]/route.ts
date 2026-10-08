import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';

const purchaseBody = z.object({
  phone: z.string().min(10).max(15).regex(/^[0-9]+$/),
  amount: z.coerce.number().positive().max(50000),
});

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ network: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { network } = await params;
    const body = purchaseBody.parse(await _req.json());
    const amountKobo = Math.round(body.amount * 100);

    const networkMap: Record<string, number> = {
      mtn: 1, airtel: 2, glo: 3, '9mobile': 4, nine: 4, ninemobile: 4,
    };
    const networkId = networkMap[network.toLowerCase()];
    if (!networkId) return NextResponse.json({ error: 'Network not found' }, { status: 404 });

    const product = await sql`
      SELECT * FROM products
      WHERE active = true AND service_type = 'AIRTIME'
        AND (metadata_json->>'network')::text = ${String(networkId)}
      LIMIT 1
    `;

    if (!product[0]) {
      const fallback = await sql`
        SELECT * FROM products
        WHERE active = true AND service_type = 'AIRTIME'
        LIMIT 1
      `;
      if (!fallback[0]) return NextResponse.json({ error: 'Airtime service not available' }, { status: 404 });
      product[0] = fallback[0];
    }

    const p = product[0];
    const total = Math.round(amountKobo * (1 + Number(process.env.MARKUP_PERCENT || 10) / 100));

    const debit = await sql`
      UPDATE wallets SET balance_kobo = balance_kobo - ${total}, updated_at = now()
      WHERE user_id = ${user.id} AND balance_kobo >= ${total}
      RETURNING id
    `;
    if (!debit[0]) return NextResponse.json({ error: 'Insufficient wallet balance' }, { status: 402 });

    const order = await sql`
      INSERT INTO orders(user_id, product_id, product_name, qty, total_kobo, status, provider, purchase_data_json)
      VALUES(${user.id}, ${p.id}, ${p.name}, 1, ${total}, 'processing', ${p.provider || 'jejelayelaye'}, ${JSON.stringify({
        mobile_number: body.phone,
        amount: body.amount,
        network: networkId,
        Ported_number: false,
        airtime_type: 'VTU',
      })}::jsonb)
      RETURNING id
    `;

    await sql`
      INSERT INTO wallet_transactions(user_id, type, amount_kobo, description, reference, status)
      VALUES(${user.id}, 'debit', ${total}, ${'Airtime: ' + p.name}, ${'ORDER-' + order[0].id}, 'confirmed')
    `;

    try {
      const base = (process.env.JEJELAYE_API_BASE_URL || 'https://jejelayegct.com.ng/api/v1').replace(/\/$/, '');
      const rr = await fetch(`${base}/services/${encodeURIComponent(String(p.provider_product_id))}/purchase`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.JEJELAYE_API_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          mobile_number: body.phone,
          amount: body.amount,
          Ported_number: false,
          airtime_type: 'VTU',
        }),
        signal: AbortSignal.timeout(20000),
      });

      const pay = await rr.json().catch(() => ({}));
      if (!rr.ok) throw new Error(pay?.message || 'Provider purchase failed');

      const tx = pay?.transaction || pay?.data?.transaction || pay?.data;
      const status = ['success', 'successful', 'completed'].includes(String(tx?.status || '').toLowerCase()) ? 'completed' : 'processing';

      await sql`
        UPDATE orders SET status = ${status}, provider_order_id = ${tx?.reference || null}, product_details = ${JSON.stringify([tx?.api_response].filter(Boolean))}::jsonb
        WHERE id = ${order[0].id}
      `;

      return NextResponse.json({
        status,
        orderId: order[0].id,
        reference: tx?.reference || null,
        message: pay?.message || tx?.api_response || 'Purchase accepted',
      });
    } catch (e) {
      await sql`
        UPDATE wallets SET balance_kobo = balance_kobo + ${total}, updated_at = now()
        WHERE user_id = ${user.id}
      `;
      await sql`
        UPDATE orders SET status = 'failed', replacement_note = ${e instanceof Error ? e.message : 'Provider failure'}
        WHERE id = ${order[0].id}
      `;
      await sql`
        INSERT INTO wallet_transactions(user_id, type, amount_kobo, description, reference, status)
        VALUES(${user.id}, 'credit', ${total}, 'Refund for failed airtime purchase', ${'REFUND-' + order[0].id}, 'confirmed')
        ON CONFLICT (reference) DO NOTHING
      `;
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Purchase failed', orderId: order[0].id },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Airtime purchase failed' },
      { status: 400 },
    );
  }
}

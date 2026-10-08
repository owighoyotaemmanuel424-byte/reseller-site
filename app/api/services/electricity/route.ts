import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { randomUUID } from 'node:crypto';

const verifyBody = z.object({
  provider: z.string().min(2).max(50),
  meter_number: z.string().min(5).max(30),
});

const purchaseBody = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(10),
});

async function verifyMeter(provider: string, meterNumber: string) {
  const token = process.env.JEJELAYE_API_TOKEN;
  if (!token) throw new Error('JEJELAYE_API_TOKEN is not configured');

  const product = (await sql`
    SELECT provider_product_id
    FROM products
    WHERE service_type = 'ELECTRICITY' AND active = true AND provider = ${provider}
    LIMIT 1
  `)[0];

  if (!product) {
    return { verified: false, meter_number: meterNumber, provider, message: 'Provider not found' };
  }

  const base = (process.env.JEJELAYE_API_BASE_URL || 'https://jejelayegct.com.ng/api/v1').replace(/\/$/, '');
  const r = await fetch(`${base}/services/${encodeURIComponent(String(product.provider_product_id))}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ meter_number: meterNumber }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await r.json().catch(() => ({}));
  const data = payload?.data || payload;

  return {
    verified: r.ok && data?.verified !== false,
    meter_number: meterNumber,
    provider,
    customerName: data?.customer_name || data?.name || null,
    address: data?.address || null,
    message: payload?.message || null,
  };
}

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const meter = searchParams.get('meter');
    const provider = searchParams.get('provider');
    const action = searchParams.get('action');

    if (action === 'verify' && meter && provider) {
      return NextResponse.json(await verifyMeter(provider, meter));
    }

    const providers = await sql`
      SELECT DISTINCT provider
      FROM products
      WHERE service_type = 'ELECTRICITY' AND active = true
    `;

    return NextResponse.json({
      data: {
        providers: providers.map(p => p.provider),
        meterTypes: ['PREPAID', 'POSTPAID'],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load electricity providers' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const body = purchaseBody.parse(await req.json());
    const p = await sql`
      SELECT * FROM products WHERE id = ${body.productId} AND active = true LIMIT 1
    `;

    if (!p[0]) return NextResponse.json({ error: 'Electricity product not found' }, { status: 404 });

    const total = Math.round(Number(p[0].price_kobo) * body.quantity);

    const debit = await sql`
      UPDATE wallets SET balance_kobo = balance_kobo - ${total}, updated_at = now()
      WHERE user_id = ${user.id} AND balance_kobo >= ${total}
      RETURNING id
    `;
    if (!debit[0]) return NextResponse.json({ error: 'Insufficient wallet balance' }, { status: 402 });

    const ref = randomUUID();
    const order = await sql`
      INSERT INTO orders(user_id, product_id, product_name, qty, total_kobo, status, provider, purchase_data_json, customer_ref)
      VALUES(${user.id}, ${p[0].id}, ${p[0].name}, ${body.quantity}, ${total}, 'processing', ${p[0].provider || 'jejelayelaye'}, ${JSON.stringify({
        productId: body.productId,
        quantity: body.quantity,
      })}::jsonb, ${ref})
      RETURNING id
    `;

    await sql`
      INSERT INTO wallet_transactions(user_id, type, amount_kobo, description, reference, status)
      VALUES(${user.id}, 'debit', ${total}, ${'Electricity: ' + p[0].name}, ${'ORDER-' + order[0].id}, 'confirmed')
    `;

    try {
      const base = (process.env.JEJELAYE_API_BASE_URL || 'https://jejelayegct.com.ng/api/v1').replace(/\/$/, '');
      const rr = await fetch(`${base}/services/${encodeURIComponent(String(p[0].provider_product_id))}/purchase`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.JEJELAYE_API_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          productId: body.productId,
          quantity: body.quantity,
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
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Purchase failed', orderId: order[0].id },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Electricity purchase failed' },
      { status: 400 },
    );
  }
}

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        id,
        provider_product_id AS "providerProductId",
        name,
        description,
        service_type AS "serviceType",
        category,
        price_kobo AS "priceKobo",
        min_amount_kobo AS "minAmountKobo",
        max_amount_kobo AS "maxAmountKobo",
        metadata_json AS "metadata"
      FROM products
      WHERE active = true
      ORDER BY category, name
    `;

    const data = rows.map(r => ({
      ...r,
      priceKobo: Number(r.priceKobo),
      minAmountKobo: r.minAmountKobo ? Number(r.minAmountKobo) : null,
      maxAmountKobo: r.maxAmountKobo ? Number(r.maxAmountKobo) : null,
    }));

    return NextResponse.json({
      data,
      meta: { count: data.length },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load catalog' },
      { status: 500 },
    );
  }
}

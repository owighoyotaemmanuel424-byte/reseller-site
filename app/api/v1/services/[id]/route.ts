import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rows = await sql`
      SELECT
        id,
        provider_product_id AS providerId,
        name,
        description,
        service_type AS serviceType,
        category,
        price_kobo AS priceKobo,
        min_amount_kobo AS minAmountKobo,
        max_amount_kobo AS maxAmountKobo,
        metadata_json AS metadata
      FROM products
      WHERE id = ${id} AND active = true
      LIMIT 1
    `;

    if (!rows[0]) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json({
      data: {
        ...row,
        priceKobo: Number(row.priceKobo),
        minAmountKobo: row.minAmountKobo ? Number(row.minAmountKobo) : null,
        maxAmountKobo: row.maxAmountKobo ? Number(row.maxAmountKobo) : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load product' },
      { status: 500 },
    );
  }
}

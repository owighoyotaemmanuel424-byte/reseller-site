import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, requireAdminPermission, audit } from '@/lib/admin';
import { sql } from '@/lib/db';
import { randomUUID } from 'node:crypto';

export async function GET() {
  const admin = await requireAdminPermission('catalog.view');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const rows = await sql`
    SELECT
      id, provider, provider_product_id AS "providerProductId", name, description,
      service_type AS "serviceType", category, price_kobo AS "priceKobo",
      min_amount_kobo AS "minAmountKobo", max_amount_kobo AS "maxAmountKobo",
      markup_percent AS "markupPercent", active, metadata_json AS "metadata",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM products
    WHERE active = true
    ORDER BY category, name
    LIMIT 200
  `;

  const categories = await sql`
    SELECT category, COUNT(*)::int AS count
    FROM products
    WHERE active = true AND category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
  `;

  return NextResponse.json({
    data: {
      products: rows.map(r => ({
        ...r,
        priceKobo: Number(r.priceKobo),
        minAmountKobo: r.minAmountKobo ? Number(r.minAmountKobo) : null,
        maxAmountKobo: r.maxAmountKobo ? Number(r.maxAmountKobo) : null,
        markupPercent: r.markupPercent ? Number(r.markupPercent) : null,
        createdAt: r.createdAt?.toISOString(),
        updatedAt: r.updatedAt?.toISOString(),
        metadata: r.metadata || {},
      })),
      categories: categories.map(c => ({
        category: c.category,
        count: Number(c.count),
      })),
    },
  });
}

export async function POST(req: Request) {
  const admin = await requireAdminPermission('catalog.manage');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = z.object({
    action: z.enum(['sync', 'toggle']),
    productId: z.string().uuid().optional(),
    active: z.boolean().optional(),
  }).parse(await req.json());

  if (body.action === 'toggle' && body.productId) {
    const existing = await sql`
      SELECT id, name, active FROM products WHERE id = ${body.productId} LIMIT 1
    `;
    if (!existing[0]) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const newActive = body.active !== undefined ? body.active : !existing[0].active;

    await sql`
      UPDATE products SET active = ${newActive}, updated_at = now()
      WHERE id = ${body.productId}
    `;

    await audit(admin.id, newActive ? 'catalog.product_enabled' : 'catalog.product_disabled', 'product', body.productId, {
      name: existing[0].name,
      active: newActive,
    });

    return NextResponse.json({
      ok: true,
      productId: body.productId,
      active: newActive,
    });
  }

  if (body.action === 'sync') {
    const token = process.env.JEJELAYE_API_TOKEN;
    if (!token) return NextResponse.json({ error: 'JEJELAYE_API_TOKEN not configured' }, { status: 503 });

    const base = (process.env.JEJELAYE_API_BASE_URL || 'https://jejelayegct.com.ng/api/v1').replace(/\/$/, '');
    let services: any[] = [];

    try {
      const r = await fetch(`${base}/services`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
      services = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 502 });
    }

    const markupPercent = Number(process.env.MARKUP_PERCENT || 10);
    let synced = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const service of services) {
      if (!service?.id || !service?.name || service?.is_active === false) continue;

      try {
        const providerPrice = Math.round(Number(service.selling_price || 0) * 100);
        const priceKobo = Math.round(providerPrice * (1 + markupPercent / 100));

        const existing = await sql`
          SELECT id FROM products WHERE provider_product_id = ${String(service.id)} LIMIT 1
        `;

        const data = {
          provider: 'jejelaye',
          providerProductId: String(service.id),
          name: String(service.name),
          description: service.description ? String(service.description) : null,
          serviceType: String(service.type || service.category?.slug || 'digital'),
          category: service.category?.name ? String(service.category.name) : null,
          priceKobo,
          minAmountKobo: providerPrice,
          maxAmountKobo: providerPrice,
          markupPercent,
          metadata: { ...(service as any), providerPrice, providerPriceKobo: providerPrice },
          active: true,
        };

        if (existing[0]) {
          await sql`
            UPDATE products SET
              name = ${data.name}, description = ${data.description},
              service_type = ${data.serviceType}, category = ${data.category},
              price_kobo = ${data.priceKobo}, min_amount_kobo = ${data.minAmountKobo},
              max_amount_kobo = ${data.maxAmountKobo}, markup_percent = ${data.markupPercent},
              metadata_json = ${JSON.stringify(data.metadata)}::jsonb,
              active = true, updated_at = now()
            WHERE id = ${existing[0].id}
          `;
          updated++;
        } else {
          await sql`
            INSERT INTO products(provider, provider_product_id, name, description, service_type, category, price_kobo, min_amount_kobo, max_amount_kobo, markup_percent, metadata_json, active)
            VALUES(${data.provider}, ${data.providerProductId}, ${data.name}, ${data.description}, ${data.serviceType}, ${data.category}, ${data.priceKobo}, ${data.minAmountKobo}, ${data.maxAmountKobo}, ${data.markupPercent}, ${JSON.stringify(data.metadata)}::jsonb, true)
          `;
          synced++;
        }
      } catch (e) {
        errors.push(`${service.name || service.id}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }

    await sql`
      INSERT INTO product_sync_logs(provider, synced, updated, deactivated, errors, created_at)
      VALUES('jejelaye', ${synced}, ${updated}, 0, ${JSON.stringify(errors.slice(0, 10))}::jsonb, now())
    `;

    await audit(admin.id, 'catalog.sync', 'provider', 'jejelaye', {
      synced, updated, errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });

    return NextResponse.json({ synced, updated, errors: errors.slice(0, 10) });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

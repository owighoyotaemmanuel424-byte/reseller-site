import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, requireAdminPermission, audit } from '@/lib/admin';
import { sql } from '@/lib/db';
import { randomUUID } from 'node:crypto';

export async function GET() {
  const admin = await requireAdminPermission('provider.view');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const [healthResult, catalogResult] = await Promise.all([
    (async () => {
      const token = process.env.JEJELAYE_API_TOKEN;
      if (!token) return { configured: false, status: 'not_configured' };
      try {
        const base = (process.env.JEJELAYE_API_BASE_URL || 'https://jejelayegct.com.ng/api/v1').replace(/\/$/, '');
        const start = Date.now();
        const r = await fetch(`${base}/services`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        return {
          configured: true,
          status: r.ok ? 'healthy' : 'error',
          statusCode: r.status,
          latencyMs: Date.now() - start,
          message: r.ok ? 'Provider API accessible' : `HTTP ${r.status}`,
        };
      } catch (e) {
        return {
          configured: true,
          status: 'error',
          message: e instanceof Error ? e.message : 'Connection failed',
        };
      }
    })(),
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM products) AS total,
        (SELECT COUNT(*)::int FROM products WHERE active = true) AS active,
        (SELECT COUNT(*)::int FROM products WHERE active = false) AS inactive,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'AIRTIME' AND active = true) AS airtime,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'DATA' AND active = true) AS data,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'ELECTRICITY' AND active = true) AS electricity,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'TV' AND active = true) AS tv,
        (SELECT COUNT(*)::int FROM products WHERE service_type IN ('EDUCATION','PRINT_CARD') AND active = true) AS education,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'VIRTUAL_NUMBER' AND active = true) AS virtualNumbers,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'BUY_LOGS' AND active = true) AS logs,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'SOCIAL_BOOST' AND active = true) AS socialBoost,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'GIFT_CARD' AND active = true) AS giftCards,
        (SELECT COUNT(*)::int FROM products WHERE service_type = 'ESIM' AND active = true) AS esim
    `,
  ]);

  const health = healthResult;
  const catalog = catalogResult[0];

  return NextResponse.json({
    data: {
      health: {
        ...health,
        configured: !!process.env.JEJELAYE_API_TOKEN,
      },
      catalog: {
        total: Number(catalog.total),
        active: Number(catalog.active),
        inactive: Number(catalog.inactive),
        byCategory: {
          airtime: Number(catalog.airtime),
          data: Number(catalog.data),
          electricity: Number(catalog.electricity),
          tv: Number(catalog.tv),
          education: Number(catalog.education),
          virtualNumbers: Number(catalog.virtualNumbers),
          logs: Number(catalog.logs),
          socialBoost: Number(catalog.socialBoost),
          giftCards: Number(catalog.giftCards),
          esim: Number(catalog.esim),
        },
      },
    },
  });
}

export async function POST(req: Request) {
  const admin = await requireAdminPermission('provider.manage');
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = z.object({
    action: z.enum(['test', 'sync']),
  }).parse(await req.json());

  if (body.action === 'test') {
    const token = process.env.JEJELAYE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: 'JEJELAYE_API_TOKEN not configured' }, { status: 503 });
    }

    try {
      const base = (process.env.JEJELAYE_API_BASE_URL || 'https://jejelayegct.com.ng/api/v1').replace(/\/$/, '');
      const start = Date.now();
      const r = await fetch(`${base}/services`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;

      await audit(admin.id, 'provider.test', 'provider', 'jejelaye', {
        status: r.ok ? 'success' : 'failure',
        statusCode: r.status,
        latencyMs,
      });

      return NextResponse.json({
        ok: true,
        status: r.ok ? 'healthy' : 'error',
        statusCode: r.status,
        latencyMs,
        message: r.ok ? 'Provider API accessible' : `HTTP ${r.status}`,
      });
    } catch (e) {
      await audit(admin.id, 'provider.test', 'provider', 'jejelaye', {
        status: 'error',
        error: e instanceof Error ? e.message : 'Connection failed',
      });
      return NextResponse.json({
        ok: false,
        error: e instanceof Error ? e.message : 'Connection failed',
      }, { status: 502 });
    }
  }

  if (body.action === 'sync') {
    const token = process.env.JEJELAYE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'JEJELAYE_API_TOKEN not configured' }, { status: 503 });
    }

    const base = (process.env.JEJELAYE_API_BASE_URL || 'https://jejelayegct.com.ng/api/v1').replace(/\/$/, '');
    let services: any[] = [];
    try {
      const r = await fetch(`${base}/services`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`Provider returned HTTP ${r.status}`);
      const payload = await r.json();
      services = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    } catch (e) {
      await audit(admin.id, 'catalog.sync_failed', 'provider', 'jejelaye', {
        error: e instanceof Error ? e.message : 'Sync failed',
      });
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 502 });
    }

    const markupPercent = Number(process.env.MARKUP_PERCENT || 10);
    let synced = 0;
    let updated = 0;
    let deactivated = 0;
    const errors: string[] = [];

    for (const service of services) {
      if (!service?.id || !service?.name || service?.is_active === false) continue;

      try {
        const providerPrice = Math.round(Number(service.selling_price || 0) * 100);
        const priceKobo = Math.round(providerPrice * (1 + markupPercent / 100));

        const existing = await sql`
          SELECT id FROM products
          WHERE provider_product_id = ${String(service.id)} AND provider = 'jejelaye'
          LIMIT 1
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
          metadata: {
            ...(service as any),
            providerPrice,
            providerPriceKobo: providerPrice,
          },
          active: true,
        };

        if (existing[0]) {
          await sql`
            UPDATE products SET
              name = ${data.name},
              description = ${data.description},
              service_type = ${data.serviceType},
              category = ${data.category},
              price_kobo = ${data.priceKobo},
              min_amount_kobo = ${data.minAmountKobo},
              max_amount_kobo = ${data.maxAmountKobo},
              markup_percent = ${data.markupPercent},
              metadata_json = ${JSON.stringify(data.metadata)}::jsonb,
              active = true,
              updated_at = now()
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
        errors.push(`${service.name || service.id}: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      const deactResult = await sql`
        UPDATE products SET active = false, updated_at = now()
        WHERE provider = 'jejelaye'
          AND active = true
          AND updated_at < ${sevenDaysAgo}
        RETURNING id
      `;
      deactivated = deactResult.length;
    } catch {
      deactivated = 0;
    }

    await sql`
      INSERT INTO product_sync_logs(provider, synced, updated, deactivated, errors, created_at)
      VALUES('jejelaye', ${synced}, ${updated}, ${deactivated}, ${JSON.stringify(errors.length > 0 ? errors.slice(0, 10) : [])}::jsonb, now())
    `;

    await audit(admin.id, 'catalog.sync', 'provider', 'jejelaye', {
      synced,
      updated,
      deactivated,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });

    return NextResponse.json({
      synced,
      updated,
      deactivated,
      errors: errors.length > 0 ? errors.slice(0, 10) : [],
      markupPercent,
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getProviderRuntimeConfig } from "@/lib/provider-config";

const BASE_URL = "https://jejelayegct.com.ng/api/v1";

async function sync() {
  const config = await getProviderRuntimeConfig("jejelaye");
  const token = String(config.secrets.apiToken || "").trim();
  if (!token) {
    const error = new Error("JejeLaye API key is not configured in Admin → Provider Configuration");
    (error as Error & { code?: string }).code = "JEJELAYE_TOKEN_MISSING";
    throw error;
  }

  const base = (config.baseUrl || BASE_URL).replace(/\/$/, "");
  let response: Response;

  try {
    response = await fetch(base + "/services", {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach JejeLaye";
    const wrapped = new Error("JejeLaye request failed: " + message);
    (wrapped as Error & { code?: string }).code = "JEJELAYE_NETWORK_ERROR";
    throw wrapped;
  }

  const raw = await response.text();
  let payload: any = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const providerMessage =
      typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
          ? payload.error
          : raw.slice(0, 300) || "No response body";

    const error = new Error(
      `JejeLaye catalog request failed (${response.status}): ${providerMessage}`,
    );
    (error as Error & { code?: string; providerStatus?: number }).code = "JEJELAYE_PROVIDER_ERROR";
    (error as Error & { providerStatus?: number }).providerStatus = response.status;
    throw error;
  }

  const services = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  if (!Array.isArray(services)) {
    throw new Error("JejeLaye returned an invalid services response");
  }

  let count = 0;

  for (const service of services) {
    if (service?.id == null || !service?.name || service?.is_active === false) continue;

    const type = String(service.type || service.category?.slug || "digital");
    const providerPrice = Math.round(Number(service.selling_price || 0) * 100);
    const price = Math.round(
      providerPrice * (1 + Number(process.env.MARKUP_PERCENT || 10) / 100),
    );

    await sql`INSERT INTO products(
      provider_product_id,
      name,
      description,
      provider,
      service_type,
      category,
      metadata_json,
      price_kobo,
      min_amount_kobo,
      max_amount_kobo,
      active,
      updated_at
    ) VALUES(
      ${String(service.id)},
      ${String(service.name)},
      ${JSON.stringify(service.metadata || {})},
      'jejelaye',
      ${type},
      ${String(service.category?.slug || type)},
      ${JSON.stringify(service.metadata || {})}::jsonb,
      ${price},
      ${service.min_amount == null ? null : Math.round(Number(service.min_amount) * 100)},
      ${service.max_amount == null ? null : Math.round(Number(service.max_amount) * 100)},
      true,
      now()
    )
    ON CONFLICT(provider_product_id) DO UPDATE SET
      name=EXCLUDED.name,
      description=EXCLUDED.description,
      provider=EXCLUDED.provider,
      service_type=EXCLUDED.service_type,
      category=EXCLUDED.category,
      metadata_json=EXCLUDED.metadata_json,
      price_kobo=EXCLUDED.price_kobo,
      min_amount_kobo=EXCLUDED.min_amount_kobo,
      max_amount_kobo=EXCLUDED.max_amount_kobo,
      active=true,
      updated_at=now()`;

    count++;
  }

  await sql`UPDATE products
    SET active=false, updated_at=now()
    WHERE provider='jejelaye'
      AND updated_at < now()-interval '5 minutes'`;

  await sql`INSERT INTO admin_settings(key,value,updated_at) VALUES
    ('catalogLastSyncAt',${new Date().toISOString()},now()),
    ('catalogLastSyncCount',${String(count)},now()),
    ('catalogLastSyncStatus','success',now()),
    ('catalogLastSyncError','',now())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
  return count;
}

export async function POST() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    return NextResponse.json({ synced: await sync() });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "JEJELAYE_SYNC_FAILED";

    const providerStatus =
      error && typeof error === "object" && "providerStatus" in error
        ? Number((error as { providerStatus?: unknown }).providerStatus)
        : undefined;

    const message = error instanceof Error ? error.message : "Sync failed";

    if (code === "JEJELAYE_TOKEN_MISSING") {
      return NextResponse.json({ error: message, code }, { status: 503 });
    }

    if (code === "JEJELAYE_NETWORK_ERROR") {
      return NextResponse.json({ error: message, code }, { status: 502 });
    }

    if (code === "JEJELAYE_PROVIDER_ERROR") {
      return NextResponse.json(
        { error: message, code, providerStatus },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: message, code: "JEJELAYE_SYNC_FAILED" },
      { status: 500 },
    );
  }
}

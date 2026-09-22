import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getApiUser } from "@/lib/api-token";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized. Use Authorization: Bearer <USER_API_TOKEN>" }, { status: 401 });
  const rows = await sql`
    SELECT id, provider_product_id AS providerId, name, description, service_type AS serviceType,
           category, price_kobo AS priceKobo, min_amount_kobo AS minAmountKobo,
           max_amount_kobo AS maxAmountKobo, metadata_json AS metadata
    FROM products WHERE active=true ORDER BY service_type,name
  `;
  return NextResponse.json({ data: rows });
}

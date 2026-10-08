import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
export async function GET(req: Request) {
  const p=new URL(req.url).searchParams; const type=p.get("type"); const category=p.get("category"); const q=p.get("q");
  const rows=await sql`SELECT id,provider_product_id AS "providerProductId",name,description,provider,service_type AS "serviceType",category,metadata_json AS metadata,price_kobo AS "priceKobo",min_amount_kobo AS "minAmountKobo",max_amount_kobo AS "maxAmountKobo",markup_percent AS "markupPercent",updated_at AS "updatedAt" FROM products WHERE active=true AND (${type}::text IS NULL OR service_type=${type}) AND (${category}::text IS NULL OR category=${category}) AND (${q}::text IS NULL OR name ILIKE '%'||${q}||'%' OR COALESCE(description,'') ILIKE '%'||${q}||'%') ORDER BY category,name LIMIT 1000`;
  return NextResponse.json(rows.map(r=>({...r,priceKobo:Number(r.priceKobo),minAmountKobo:r.minAmountKobo==null?null:Number(r.minAmountKobo),maxAmountKobo:r.maxAmountKobo==null?null:Number(r.maxAmountKobo)})));
}
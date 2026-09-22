import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getApiUser } from "@/lib/api-token";

const body = z.object({
  network: z.coerce.number().int().positive(),
  mobile_number: z.string().regex(/^\d{10,15}$/),
  plan: z.coerce.number().int().positive(),
  Ported_number: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized. Use Authorization: Bearer <USER_API_TOKEN>" }, { status: 401 });
  try {
    const input = body.parse(await request.json());
    const products = await sql`
      SELECT * FROM products
      WHERE active=true AND service_type='data'
        AND metadata_json @> ${JSON.stringify({ network: input.network, plan: input.plan })}::jsonb
      LIMIT 1
    `;
    const product = products[0];
    if (!product) return NextResponse.json({ error: "Data plan not found. Sync the provider catalog first." }, { status: 404 });

    const total = Number(product.price_kobo);
    const debit = await sql`UPDATE wallets SET balance_kobo=balance_kobo-${total},updated_at=now() WHERE user_id=${user.id} AND balance_kobo>=${total} RETURNING id`;
    if (!debit[0]) return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });

    const order = (await sql`INSERT INTO orders(user_id,product_id,product_name,qty,total_kobo,status,provider,purchase_data_json) VALUES(${user.id},${product.id},${product.name},1,${total},'processing','jejelayelaye',${JSON.stringify(input)}::jsonb) RETURNING id`)[0];
    await sql`INSERT INTO wallet_transactions(user_id,type,amount_kobo,description,reference,status) VALUES(${user.id},'debit',${total},${"API purchase: "+product.name},${"ORDER-"+order.id},'confirmed')`;

    try {
      const base = (process.env.JEJELAYE_API_BASE_URL || "https://jejelayegct.com.ng/api/v1").replace(/\/$/, "");
      const token = process.env.JEJELAYE_API_TOKEN;
      if (!token) throw new Error("Provider API is not configured");
      const response = await fetch(`${base}/services/${encodeURIComponent(String(product.provider_product_id))}/purchase`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(input), signal: AbortSignal.timeout(20000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.message || "Provider purchase failed"));
      const tx = payload?.transaction || payload?.data?.transaction || payload?.data;
      const status = String(tx?.status || "processing").toLowerCase();
      const finalStatus = ["success", "successful", "completed"].includes(status) ? "completed" : "processing";
      await sql`UPDATE orders SET status=${finalStatus},provider_order_id=${tx?.reference ? String(tx.reference) : null},product_details=${JSON.stringify([tx?.api_response].filter(Boolean))}::jsonb WHERE id=${order.id}`;
      return NextResponse.json({ status: finalStatus, orderId: order.id, reference: tx?.reference || null, message: payload?.message || tx?.api_response || "Purchase accepted" });
    } catch (error) {
      await sql`UPDATE wallets SET balance_kobo=balance_kobo+${total},updated_at=now() WHERE user_id=${user.id}`;
      await sql`UPDATE orders SET status='failed',replacement_note=${error instanceof Error ? error.message : "Provider purchase failed"} WHERE id=${order.id}`;
      await sql`INSERT INTO wallet_transactions(user_id,type,amount_kobo,description,reference,status) VALUES(${user.id},'credit',${total},'Refund for failed API purchase',${"REFUND-"+order.id},'confirmed') ON CONFLICT(reference) DO NOTHING`;
      return NextResponse.json({ error: error instanceof Error ? error.message : "Purchase failed", orderId: order.id }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

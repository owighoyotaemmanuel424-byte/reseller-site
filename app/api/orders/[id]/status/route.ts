import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";

const token = () => process.env.JEJELAYE_API_TOKEN || "";
const base = () =>
  (process.env.JEJELAYE_API_BASE_URL || "https://jejelayegct.com.ng/api/v1").replace(/\/$/, "");

async function provider(path: string) {
  if (!token()) throw new Error("JEJELAYE_API_TOKEN is not configured");
  const response = await fetch(base() + path, {
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    throw new Error(String(payload?.message || "JejeLaye transaction lookup failed"));
  }
  return payload;
}

function providerTransaction(payload: any) {
  return payload?.transaction || payload?.data?.transaction || payload?.data || payload;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { id } = await params;
    const order = (await sql`
      SELECT id, user_id, total_kobo, status, provider, provider_order_id, product_name
      FROM orders
      WHERE id=${id} AND user_id=${user.id}
      LIMIT 1
    `)[0];

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.provider !== "jejelaye" && order.provider !== "jejelayelaye") {
      return NextResponse.json({ orderId: order.id, status: order.status });
    }
    if (!order.provider_order_id) {
      return NextResponse.json({ orderId: order.id, status: order.status });
    }
    if (["completed", "failed", "refunded"].includes(String(order.status))) {
      return NextResponse.json({ orderId: order.id, status: order.status, providerReference: order.provider_order_id });
    }

    // The API documentation exposes transaction lookup as the transactions endpoint.
    const payload = await provider(`/transactions/${encodeURIComponent(String(order.provider_order_id))}`);
    const tx = providerTransaction(payload);
    const providerStatus = String(tx?.status || payload?.status || "").toLowerCase();
    const successful = ["success", "successful", "completed"].includes(providerStatus);
    const failed = ["failed", "failure", "cancelled", "canceled", "refunded", "expired"].includes(providerStatus);
    const nextStatus = successful ? "completed" : failed ? "failed" : "processing";

    if (failed) {
      const updated = await sql`
        UPDATE orders
        SET status='failed',
            product_details=${JSON.stringify([tx?.api_response].filter(Boolean))}::jsonb,
            replacement_note=${String(tx?.api_response || tx?.message || payload?.message || "Provider transaction failed")}
        WHERE id=${order.id} AND status NOT IN ('failed','refunded','completed')
        RETURNING id
      `;
      if (updated[0]) {
        await sql`UPDATE wallets SET balance_kobo=balance_kobo+${Number(order.total_kobo)},updated_at=now() WHERE user_id=${user.id}`;
        await sql`
          INSERT INTO wallet_transactions(user_id,type,amount_kobo,description,reference,status)
          VALUES(${user.id},'credit',${Number(order.total_kobo)},${"Refund for failed order"},${"REFUND-" + order.id},'confirmed')
          ON CONFLICT(reference) DO NOTHING
        `;
      }
    } else {
      await sql`
        UPDATE orders
        SET status=${nextStatus},
            product_details=${JSON.stringify([tx?.api_response].filter(Boolean))}::jsonb
        WHERE id=${order.id}
      `;
    }

    return NextResponse.json({
      orderId: order.id,
      status: nextStatus,
      providerReference: order.provider_order_id,
      message: tx?.api_response || tx?.message || payload?.message || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to check order status" },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { randomUUID } from "node:crypto";

const key = () => process.env.PAYSTACK_SECRET_KEY || "";
const api = "https://api.paystack.co";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { amountKobo } = await req.json();
    if (!Number.isSafeInteger(amountKobo) || amountKobo < 100) {
      throw new Error("Minimum funding is ₦1");
    }
    if (!key()) throw new Error("PAYSTACK_SECRET_KEY is not configured");

    const reference = "MKX-" + randomUUID();
    await sql`
      INSERT INTO funding_requests(user_id,amount_kobo,reference,status)
      VALUES(${u.id},${amountKobo},${reference},'pending')
    `;
    await sql`
      INSERT INTO wallet_transactions(user_id,type,amount_kobo,description,reference,status)
      VALUES(${u.id},'credit',${amountKobo},'Paystack wallet funding',${reference},'pending')
    `;

    const r = await fetch(api + "/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + key(), "Content-Type": "application/json" },
      body: JSON.stringify({
        email: u.email,
        amount: String(amountKobo),
        currency: "NGN",
        reference,
        callback_url: (process.env.NEXT_PUBLIC_SITE_URL || "") + "/wallet",
      }),
      signal: AbortSignal.timeout(20000),
    });
    const p = await r.json();
    if (!r.ok || !p.status) throw new Error(p.message || "Paystack initialization failed");

    return NextResponse.json({ authorizationUrl: p.data.authorization_url, reference });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment failed" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!key()) return NextResponse.json({ error: "PAYSTACK_SECRET_KEY is not configured" }, { status: 503 });

  try {
    const { reference } = await req.json();
    if (typeof reference !== "string" || reference.length < 8 || reference.length > 100) {
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
    }

    const verify = await fetch(api + "/transaction/verify/" + encodeURIComponent(reference), {
      headers: { Authorization: "Bearer " + key() },
      signal: AbortSignal.timeout(20000),
    });
    const p = await verify.json();
    if (!verify.ok || !p.status || p.data?.status !== "success") {
      return NextResponse.json({ error: p.message || "Payment not confirmed" }, { status: 400 });
    }

    const reqs = (await sql`
      SELECT id, amount_kobo
      FROM funding_requests
      WHERE reference=${reference} AND user_id=${u.id}
      LIMIT 1
    `)[0];

    if (!reqs || Number(reqs.amount_kobo) !== Number(p.data.amount)) {
      return NextResponse.json({ error: "Payment mismatch" }, { status: 400 });
    }

    const claimed = await sql`
      UPDATE funding_requests
      SET status='completed', completed_at=now()
      WHERE id=${reqs.id} AND status='pending'
      RETURNING amount_kobo
    `;

    if (!claimed[0]) {
      return NextResponse.json({ ok: true, reference, alreadyProcessed: true });
    }

    const wallet = await sql`
      UPDATE wallets
      SET balance_kobo=balance_kobo+${claimed[0].amount_kobo}, updated_at=now()
      WHERE user_id=${u.id}
      RETURNING id
    `;

    if (!wallet[0]) {
      await sql`UPDATE funding_requests SET status='pending', completed_at=NULL WHERE id=${reqs.id}`;
      return NextResponse.json({ error: "Wallet not found" }, { status: 500 });
    }

    await sql`
      UPDATE wallet_transactions
      SET status='confirmed', description='Paystack wallet funding confirmed'
      WHERE reference=${reference} AND status='pending'
    `;
    await sql`
      INSERT INTO wallet_ledger(user_id,wallet_id,type,amount_kobo,currency,status,reference)
      VALUES(${u.id},${wallet[0].id},'credit',${claimed[0].amount_kobo},'NGN','confirmed',${reference})
      ON CONFLICT(reference) DO NOTHING
    `;

    return NextResponse.json({ ok: true, reference });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment verification failed" }, { status: 400 });
  }
}

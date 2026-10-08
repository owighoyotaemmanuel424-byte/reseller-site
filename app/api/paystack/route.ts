import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { getProviderRuntimeConfig } from "@/lib/provider-config";

async function config(){const c=await getProviderRuntimeConfig("paystack");const key=String(c.secrets.secretKey||"");if(!key)throw Error("Paystack API key is not configured in Admin → Provider Configuration");return{key,api:(c.baseUrl||"https://api.paystack.co").replace(/\/$/,"")}}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { amountKobo } = await req.json();
    if (!Number.isSafeInteger(amountKobo) || amountKobo < 100) {
      throw new Error("Minimum funding is ₦1");
    }
    const c = await config();

    const reference = "MKX-" + randomUUID();
    await sql`
      INSERT INTO funding_requests(user_id,amount_kobo,reference,status)
      VALUES(${u.id},${amountKobo},${reference},'pending')
    `;
    await sql`
      INSERT INTO wallet_transactions(user_id,type,amount_kobo,description,reference,status)
      VALUES(${u.id},'credit',${amountKobo},'Paystack wallet funding',${reference},'pending')
    `;

    const r = await fetch(c.api + "/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + c.key, "Content-Type": "application/json" },
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
  let c: Awaited<ReturnType<typeof config>>;
  try { c = await config(); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Paystack is not configured" }, { status: 503 }); }

  try {
    const { reference } = await req.json();
    if (typeof reference !== "string" || reference.length < 8 || reference.length > 100) {
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
    }

    const verify = await fetch(c.api + "/transaction/verify/" + encodeURIComponent(reference), {
      headers: { Authorization: "Bearer " + c.key },
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

    const settled = await sql`
      WITH claim AS (
        UPDATE funding_requests
        SET status='completed', completed_at=now()
        WHERE id=${reqs.id} AND status='pending'
        RETURNING user_id,amount_kobo
      ), wallet AS (
        UPDATE wallets w
        SET balance_kobo=w.balance_kobo+c.amount_kobo,updated_at=now()
        FROM claim c
        WHERE w.user_id=c.user_id
        RETURNING w.id,w.user_id,c.amount_kobo
      ), tx AS (
        UPDATE wallet_transactions
        SET status='confirmed',description='Paystack wallet funding confirmed'
        WHERE reference=${reference} AND status='pending'
        RETURNING id
      ), ledger AS (
        INSERT INTO wallet_ledger(user_id,wallet_id,type,amount_kobo,currency,status,reference,description)
        SELECT user_id,id,'credit',amount_kobo,'NGN','confirmed',${reference},'Paystack wallet funding'
        FROM wallet
        ON CONFLICT(reference) DO NOTHING
        RETURNING id
      ) SELECT (SELECT COUNT(*) FROM claim)::int claimed,(SELECT COUNT(*) FROM wallet)::int wallet
    `;
    if(Number(settled[0]?.claimed||0)===0)return NextResponse.json({ok:true,reference,alreadyProcessed:true});
    if(Number(settled[0]?.wallet||0)===0)return NextResponse.json({error:"Wallet not found"},{status:500});

    return NextResponse.json({ ok: true, reference });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment verification failed" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createHmac,timingSafeEqual } from "node:crypto";
export async function POST(req:Request){
 const raw=await req.text(),sig=req.headers.get("x-paystack-signature")||"",secret=process.env.PAYSTACK_SECRET_KEY||"";
 const expected=createHmac("sha512",secret).update(raw).digest("hex");
 if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return NextResponse.json({error:"Invalid signature"},{status:401});
 let e:any;try{e=JSON.parse(raw)}catch{return NextResponse.json({error:"Invalid payload"},{status:400})}
 const eventId=String(e.id||"");const ref=String(e.data?.reference||"");
 if(eventId){const existing=await sql`SELECT id FROM webhook_events WHERE event_id=${eventId} LIMIT 1`;if(existing[0])return NextResponse.json({ok:true,duplicate:true});await sql`INSERT INTO webhook_events(event_id,reference,event_type) VALUES(${eventId},${ref},${String(e.event||"unknown")}) ON CONFLICT(event_id) DO NOTHING`}
 if(e.event!=="charge.success")return NextResponse.json({ok:true});
 const d=e.data,reqs=(await sql`SELECT * FROM funding_requests WHERE reference=${ref} LIMIT 1`)[0];
 if(!reqs||reqs.status==="completed")return NextResponse.json({ok:true});
 if(Number(reqs.amount_kobo)!==Number(d.amount)||d.currency!=="NGN")return NextResponse.json({error:"Payment mismatch"},{status:400});
 const changed=await sql`UPDATE funding_requests SET status='completed',completed_at=now() WHERE id=${reqs.id} AND status='pending' RETURNING id`;
 if(!changed[0])return NextResponse.json({ok:true,duplicate:true});
 await sql`UPDATE wallets SET balance_kobo=balance_kobo+${reqs.amount_kobo},updated_at=now() WHERE user_id=${reqs.user_id}`;
 await sql`UPDATE wallet_transactions SET status='confirmed',description='Paystack wallet funding confirmed' WHERE reference=${ref}`;
 await sql`INSERT INTO wallet_ledger(user_id,wallet_id,type,amount_kobo,currency,status,reference,event_id) SELECT ${reqs.user_id},id,'credit',${reqs.amount_kobo},'NGN','confirmed',${ref},${eventId||ref} FROM wallets WHERE user_id=${reqs.user_id} ON CONFLICT(reference) DO NOTHING`;
 return NextResponse.json({ok:true});
}
import {NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {sql} from "@/lib/db";
import {getProviderRuntimeConfig} from "@/lib/provider-config";
function validSignature(raw:string,sig:string,key:string){const expected=createHmac("sha512",key).update(raw).digest("hex");const a=Buffer.from(expected);const b=Buffer.from(sig);return a.length===b.length&&timingSafeEqual(a,b)}
export async function POST(req:Request){
 try{
  const raw=await req.text(); const signature=req.headers.get("x-paystack-signature")||""; const c=await getProviderRuntimeConfig("paystack"); const key=String(c.secrets.secretKey||"");
  if(!key)return NextResponse.json({error:"Paystack is not configured"},{status:503});
  if(!signature||!validSignature(raw,signature,key))return NextResponse.json({error:"Invalid signature"},{status:401});
  const event=JSON.parse(raw); const reference=String(event?.data?.reference||""); if(!reference)return NextResponse.json({received:true});
  if(event.event!=="charge.success")return NextResponse.json({received:true});
  const amount=Number(event.data.amount); if(!Number.isSafeInteger(amount)||amount<=0)return NextResponse.json({error:"Invalid payment amount"},{status:400});
  const claimed=await sql`WITH target AS (SELECT id,user_id,amount_kobo FROM funding_requests WHERE reference=${reference} LIMIT 1),
  claim AS (UPDATE funding_requests f SET status='completed',completed_at=now() FROM target t WHERE f.id=t.id AND f.status='pending' AND t.amount_kobo=${amount} RETURNING f.id,f.user_id,f.amount_kobo),
  wallet AS (UPDATE wallets w SET balance_kobo=w.balance_kobo+c.amount_kobo,updated_at=now() FROM claim c WHERE w.user_id=c.user_id RETURNING w.id,w.user_id,c.amount_kobo),
  tx AS (UPDATE wallet_transactions t SET status='confirmed',description='Paystack wallet funding confirmed' WHERE t.reference=${reference} RETURNING t.id),
  ledger AS (INSERT INTO wallet_ledger(user_id,wallet_id,type,amount_kobo,currency,status,reference,description) SELECT w.user_id,w.id,'credit',w.amount_kobo,'NGN','confirmed',${reference},'Paystack wallet funding' FROM wallet w ON CONFLICT(reference) DO NOTHING RETURNING id)
  SELECT (SELECT COUNT(*) FROM claim)::int claimed,(SELECT COUNT(*) FROM ledger)::int ledger`;
  return NextResponse.json({received:true,processed:Number(claimed[0]?.claimed||0)>0});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Webhook processing failed"},{status:400})}
}
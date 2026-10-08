import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireAdminPermission, audit } from "@/lib/admin";
import { sql } from "@/lib/db";

const body=z.object({orderId:z.string().uuid(),reason:z.string().min(3).max(500)});

export async function GET(){
 const admin=await requireAdminPermission("payments.view");
 if(!admin)return NextResponse.json({error:"Admin access required"},{status:403});
 const rows=await sql`SELECT r.id,r.order_id "orderId",r.user_id "userId",u.email,r.amount_kobo "amountKobo",r.reason,r.reference,r.status,r.created_at "createdAt",a.email "adminEmail" FROM refund_records r JOIN users u ON u.id=r.user_id JOIN users a ON a.id=r.created_by ORDER BY r.created_at DESC LIMIT 500`;
 return NextResponse.json(rows.map(r=>({...r,amountKobo:Number(r.amountKobo)})));
}
export async function POST(req:Request){
 const admin=await requireAdminPermission("payments.manage");
 if(!admin)return NextResponse.json({error:"Admin access required"},{status:403});
 try{
  const b=body.parse(await req.json()), ref="REF-"+randomUUID();
  const rows=await sql`WITH target AS (
    SELECT o.id,o.user_id,o.total_kobo,w.id wallet_id
    FROM orders o JOIN wallets w ON w.user_id=o.user_id
    WHERE o.id=${b.orderId} AND o.status<>'refunded'
    FOR UPDATE
  ), updated_order AS (
    UPDATE orders o SET status='refunded'
    FROM target t WHERE o.id=t.id RETURNING o.id,o.user_id,o.total_kobo
  ), credited AS (
    UPDATE wallets w SET balance_kobo=w.balance_kobo+u.total_kobo,updated_at=now()
    FROM updated_order u WHERE w.user_id=u.user_id
    RETURNING w.id,w.user_id,u.total_kobo
  ), tx AS (
    INSERT INTO wallet_transactions(user_id,type,amount_kobo,description,reference,status)
    SELECT user_id,'credit',total_kobo,${b.reason},${ref},'confirmed' FROM credited
    RETURNING user_id,amount_kobo
  ), ledger AS (
    INSERT INTO wallet_ledger(user_id,wallet_id,type,amount_kobo,currency,status,reference,description)
    SELECT c.user_id,c.id,'credit',c.total_kobo,'NGN','confirmed',${ref},${b.reason} FROM credited c
  ), record AS (
    INSERT INTO refund_records(order_id,user_id,amount_kobo,reason,reference,status,created_by)
    SELECT id,user_id,total_kobo,${b.reason},${ref},'completed',${admin.id} FROM updated_order
    RETURNING *
  ) SELECT * FROM record`;
  if(!rows[0])return NextResponse.json({error:"Order not found or already refunded"},{status:400});
  await audit(admin.id,"order.refunded","order",b.orderId,{amountKobo:Number(rows[0].amount_kobo),reference:ref,reason:b.reason});
  return NextResponse.json({ok:true,reference:ref,amountKobo:Number(rows[0].amount_kobo)});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Refund failed"},{status:400})}
}
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireAdminPermission, audit } from "@/lib/admin";
import { sql } from "@/lib/db";
const body=z.object({withdrawalId:z.string().uuid(),decision:z.enum(["approve","reject"]),note:z.string().max(500).optional()});
export async function GET(){
 const admin=await requireAdminPermission("payments.view");
 if(!admin)return NextResponse.json({error:"Admin access required"},{status:403});
 const rows=await sql`SELECT w.id,w.user_id "userId",u.email,w.amount_kobo "amountKobo",w.destination,w.reference,w.status,w.note,w.created_at "createdAt" FROM withdrawal_requests w JOIN users u ON u.id=w.user_id ORDER BY w.created_at DESC LIMIT 500`;
 return NextResponse.json(rows.map(r=>({...r,amountKobo:Number(r.amountKobo)})));
}
export async function POST(req:Request){
 const admin=await requireAdminPermission("payments.manage");
 if(!admin)return NextResponse.json({error:"Admin access required"},{status:403});
 try{
  const b=body.parse(await req.json());
  const rows=await sql`SELECT w.id,w.user_id "userId",w.amount_kobo "amountKobo",w.status FROM withdrawal_requests w WHERE w.id=${b.withdrawalId} FOR UPDATE`;
  if(!rows[0])return NextResponse.json({error:"Withdrawal not found"},{status:404});
  if(rows[0].status!=="pending")return NextResponse.json({error:"Withdrawal already processed"},{status:400});
  if(b.decision==="reject"){
   await sql`UPDATE withdrawal_requests SET status='rejected',note=${b.note||"Rejected by admin"},processed_by=${admin.id},processed_at=now() WHERE id=${b.withdrawalId}`;
   await audit(admin.id,"withdrawal.rejected","withdrawal",b.withdrawalId,{note:b.note||"Rejected by admin"});
   return NextResponse.json({ok:true,status:"rejected"});
  }
  const ref="WD-"+randomUUID();
  const updated=await sql`WITH debit AS (
    UPDATE wallets SET balance_kobo=balance_kobo-${rows[0].amountKobo},updated_at=now()
    WHERE user_id=${rows[0].userId} AND balance_kobo>=${rows[0].amountKobo} RETURNING id,balance_kobo
  ), tx AS (
    INSERT INTO wallet_transactions(user_id,type,amount_kobo,description,reference,status)
    SELECT ${rows[0].userId},'debit',${rows[0].amountKobo},'Withdrawal approved',${ref},'confirmed' FROM debit
  ), ledger AS (
    INSERT INTO wallet_ledger(user_id,wallet_id,type,amount_kobo,currency,status,reference,description)
    SELECT ${rows[0].userId},id,'debit',${rows[0].amountKobo},'NGN','confirmed',${ref},'Withdrawal approved' FROM debit
  ) UPDATE withdrawal_requests SET status='approved',note=${b.note||null},reference=${ref},processed_by=${admin.id},processed_at=now() WHERE id=${b.withdrawalId} RETURNING id,status,reference`;
  if(!updated[0])return NextResponse.json({error:"Insufficient wallet balance"},{status:400});
  await audit(admin.id,"withdrawal.approved","withdrawal",b.withdrawalId,{amountKobo:Number(rows[0].amountKobo),reference:ref});
  return NextResponse.json({ok:true,...updated[0]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Withdrawal update failed"},{status:400})}
}
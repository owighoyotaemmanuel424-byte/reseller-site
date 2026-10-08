import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin";
import { sql } from "@/lib/db";
export async function GET(){
 const admin=await requireAdminPermission("payments.view");
 if(!admin)return NextResponse.json({error:"Admin access required"},{status:403});
 const [wallets,orders,ledger,refunds,withdrawals]=await Promise.all([
  sql`SELECT COUNT(*)::int users,COALESCE(SUM(balance_kobo),0) balance FROM wallets`,
  sql`SELECT COUNT(*)::int orders,COALESCE(SUM(total_kobo) FILTER(WHERE status='completed'),0) completed_value,COUNT(*) FILTER(WHERE status IN('pending','processing','reported'))::int open_orders FROM orders`,
  sql`SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount_kobo ELSE -amount_kobo END),0) net_ledger FROM wallet_ledger WHERE status='confirmed'`,
  sql`SELECT COUNT(*)::int count,COALESCE(SUM(amount_kobo),0) amount FROM refund_records WHERE status='completed'`,
  sql`SELECT COUNT(*) FILTER(WHERE status='pending')::int pending,COALESCE(SUM(amount_kobo) FILTER(WHERE status='pending'),0) pending_amount FROM withdrawal_requests`
 ]);
 const walletBalance=Number(wallets[0].balance),ledgerNet=Number(ledger[0].net_ledger);
 return NextResponse.json({wallets:{users:Number(wallets[0].users),balanceKobo:walletBalance},orders:{count:Number(orders[0].orders),completedValueKobo:Number(orders[0].completed_value),open:Number(orders[0].open_orders)},ledger:{netKobo:ledgerNet},refunds:{count:Number(refunds[0].count),amountKobo:Number(refunds[0].amount)},withdrawals:{pending:Number(withdrawals[0].pending),pendingAmountKobo:Number(withdrawals[0].pending_amount)},reconciliation:{walletVsLedgerKobo:walletBalance-ledgerNet,balanced:walletBalance===ledgerNet}});
}
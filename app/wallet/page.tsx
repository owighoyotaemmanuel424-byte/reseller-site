"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";

const money = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
type TransactionRow = { _id: string; description: string; amountKobo: number; type: "debit" | "credit"; status: string };

export default function WalletPage() {
  const wallet = useQuery(api.wallets.get);
  const transactions = useQuery(api.wallets.transactions) ?? [];
  const ensure = useMutation(api.wallets.ensure);
  const requestFunding = useMutation(api.wallets.requestFunding);
  const [amount, setAmount] = useState("1000");
  const [message, setMessage] = useState("");
  useEffect(() => { ensure({}).catch(() => undefined); }, [ensure]);

  async function fund() {
    setMessage("");
    try { const ref = await requestFunding({ amountKobo: Math.round(Number(amount) * 100) }); setMessage(`Funding request created: ${ref}`); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to create request"); }
  }

  return <>
    <SignedOut><div className="card"><h1>Wallet</h1><p className="muted">Sign in to access your wallet.</p><SignInButton mode="modal"><button className="btn">Sign in</button></SignInButton></div></SignedOut>
    <SignedIn>
      <div className="row"><div><h1>Wallet</h1><p className="muted">All balances are stored as integer kobo values.</p></div><div className="card"><strong>Balance</strong><div className="price">{money(wallet?.balanceKobo ?? 0)}</div></div></div>
      {message && <div className="alert success">{message}</div>}
      <div className="grid" style={{marginTop:20}}>
        <section className="card"><h2>Add funds</h2><p className="muted">This creates a pending funding request. Connect your payment provider webhook before treating it as paid.</p><input className="input" type="number" min="100" step="1" value={amount} onChange={e=>setAmount(e.target.value)} /><button className="btn" onClick={fund}>Create funding request</button></section>
        <section className="card"><h2>Transactions</h2>{transactions.length === 0 ? <div className="empty">No transactions yet.</div> : <table><thead><tr><th>Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(transactions as TransactionRow[]).map(t=><tr key={t._id}><td>{t.description}</td><td>{t.type === "debit" ? "−" : "+"}{money(t.amountKobo)}</td><td><span className="badge">{t.status}</span></td></tr>)}</tbody></table>}</section>
      </div>
    </SignedIn>
  </>;
}

"use client";

import Link from "next/link";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

const money = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
type ProductRow = { _id: string; category?: string; name: string; description?: string; priceKobo: number };

export default function Home() {
  const { isSignedIn } = useUser();
  const products = useQuery(api.products.list) ?? [];
  const createOrder = useMutation(api.provider.placeOrder);
  const ensureWallet = useMutation(api.wallets.ensure);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function buy(id: string) {
    if (!isSignedIn) return;
    setBusy(id); setMessage("");
    try {
      await ensureWallet({});
      await createOrder({ productId: id as never, qty: 1 });
      setMessage("Order placed. Check your Orders page for status.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to place order");
    } finally { setBusy(null); }
  }

  return <>
    <section className="hero">
      <p className="badge">Digital reseller platform</p>
      <h1>Sell and manage digital products with MultiKartX.</h1>
      <p>Secure wallet accounting, product ordering, order reporting and a deployment-ready TypeScript architecture.</p>
      <div className="row" style={{justifyContent:"flex-start", marginTop:22}}>
        {isSignedIn ? <Link className="btn" href="/wallet">Open wallet</Link> : <SignInButton mode="modal"><button className="btn">Sign in to start</button></SignInButton>}
        <Link className="btn secondary" href="/orders">View orders</Link>
      </div>
    </section>
    {message && <div className="alert success">{message}</div>}
    <section className="grid">
      {(products as ProductRow[]).map((p) => <article className="card" key={p._id}>
        <span className="badge">{p.category ?? "Digital"}</span>
        <h2>{p.name}</h2>
        <p className="muted">{p.description ?? "Digital product available through MultiKartX."}</p>
        <div className="price">{money(p.priceKobo)}</div>
        <button className="btn" disabled={!isSignedIn || busy === p._id} onClick={() => buy(p._id)}>{busy === p._id ? "Processing…" : "Buy now"}</button>
      </article>)}
    </section>
    {products.length === 0 && <div className="card empty">No active products yet. Sync your reseller catalog in Convex before opening the store.</div>}
  </>;
}

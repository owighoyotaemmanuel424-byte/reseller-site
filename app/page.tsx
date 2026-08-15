"use client";

import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

const money = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
type ProductRow = { _id: string; category?: string; name: string; description?: string; priceKobo: number };

export default function Home() {
  const { isAuthenticated } = useConvexAuth();
  const products = useQuery(api.products.list) ?? [];
  const createOrder = useMutation(api.provider.placeOrder);
  const ensureWallet = useMutation(api.wallets.ensure);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function buy(id: string) { if (!isAuthenticated) return; setBusy(id); try { await ensureWallet({}); await createOrder({ productId: id as never, qty: 1 }); setMessage("Order placed."); } catch (e) { setMessage(e instanceof Error ? e.message : "Unable"); } finally { setBusy(null); } }
  return <><section className="hero"><p className="badge">Digital reseller platform</p><h1>Sell and manage digital products with MultiKartX.</h1><p>Secure wallet accounting and product ordering.</p><div className="row" style={{justifyContent:"flex-start", marginTop:22}}>{isAuthenticated ? <Link className="btn" href="/wallet">Open wallet</Link> : <Link className="btn" href="/sign-in">Sign in to start</Link>}<Link className="btn secondary" href="/orders">View orders</Link></div></section>{message && <div className="alert success">{message}</div>}<section className="grid">{(products as ProductRow[]).map(p=><article className="card" key={p._id}><span className="badge">{p.category ?? "Digital"}</span><h2>{p.name}</h2><p>{p.description}</p><div className="price">{money(p.priceKobo)}</div><button className="btn" disabled={!isAuthenticated || busy===p._id} onClick={()=>buy(p._id)}>Buy now</button></article>)}</section></>;
}

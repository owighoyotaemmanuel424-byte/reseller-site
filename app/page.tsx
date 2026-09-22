"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type P = { id: string; category?: string; serviceType?: string; name: string; description?: string; priceKobo: number };
type User = { id: string; email: string; role: string };

const quickActions = [
  ["data", "Data", "Buy SME / direct data"],
  ["airtime", "Airtime", "Instant airtime top-up"],
  ["tv", "Cable TV", "DStv / GOtv subscriptions"],
  ["electricity", "Electricity", "Buy electricity tokens"],
  ["education", "Education PIN", "Result checker PINs"],
];

export default function Home() {
  const [products, setProducts] = useState<P[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [selected, setSelected] = useState<P | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(setProducts).catch(() => setProducts([]));
    fetch("/api/auth/me").then(r => r.json()).then(d => setUser(d.user || null)).catch(() => setUser(null));
    fetch("/api/wallet").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.balanceKobo != null) setBalance(Number(d.balanceKobo));
    }).catch(() => undefined);
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, P[]>();
    for (const p of products) {
      const k = p.serviceType || p.category || "digital";
      m.set(k, [...(m.get(k) || []), p]);
    }
    return m;
  }, [products]);

  function openService(type: string) {
    const product = products.find(p => (p.serviceType || p.category) === type);
    if (product) {
      setSelected(product);
      setAmount(String(product.priceKobo / 100));
      setDetails("");
      setPhone("");
      return;
    }
    document.getElementById(`service-${type}`)?.scrollIntoView({ behavior: "smooth" });
  }

  async function buy() {
    if (!selected || !user) return;
    setBusy(true);
    setMsg("");
    try {
      const type = selected.serviceType || selected.category || "digital";
      const payload: Record<string, unknown> = {};
      if (type === "airtime") {
        if (!phone || !amount) throw new Error("Enter phone and amount");
        payload.amount = Number(amount); payload.mobile_number = phone.trim(); payload.Ported_number = false; payload.airtime_type = "VTU";
      } else if (type === "data") {
        if (!phone) throw new Error("Enter phone number");
        payload.mobile_number = phone.trim(); payload.Ported_number = false;
      } else if (type === "electricity") {
        const [a, b] = details.split("|");
        if (!a || !b || !amount) throw new Error("Enter meter|prepaid or meter|postpaid and amount");
        payload.amount = Number(amount); payload.billersCode = a; payload.variation_code = b;
      } else if (type === "tv") {
        const [a, b] = details.split("|");
        if (!a || !b) throw new Error("Enter smartcard|subscription");
        payload.billersCode = a; payload.subscription_type = b;
      } else if (type === "social_boost") {
        payload.link = details; payload.quantity = 1;
      } else if (["bulk_sms", "bulksms", "sms"].includes(type)) {
        const [a, b, c] = details.split("|");
        if (!a || !b || !c) throw new Error("Use Sender|Recipients|Message");
        payload.sender = a; payload.recipient = b; payload.message = c;
      } else payload.quantity = Number(details || 1);

      const r = await fetch("/api/purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: selected.id, qty: 1, purchaseData: payload }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg(d.message || "Purchase submitted");
      setSelected(null);
      fetch("/api/wallet").then(r => r.ok ? r.json() : null).then(d => d?.balanceKobo != null && setBalance(Number(d.balanceKobo))).catch(() => undefined);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Purchase failed");
    } finally { setBusy(false); }
  }

  return (
    <main className="reseller-home">
      <section className="hero reseller-hero">
        <div className="hero-top">
          <div><p className="badge">● JejeLaye reseller portal</p><h1>Sell digital services.<br />Grow your reseller business.</h1><p className="hero-copy">Fast VTU services, wallet funding and automated fulfillment from one mobile-first dashboard.</p></div>
          {user && <div className="wallet-card"><span>Wallet balance</span><strong>{balance == null ? "₦—" : `₦${(balance / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}</strong><Link href="/wallet">Fund wallet →</Link></div>}
        </div>
        <div className="row" style={{ justifyContent: "flex-start", marginTop: 22 }}>{user ? <Link className="btn" href="/wallet">Open dashboard</Link> : <Link className="btn" href="/sign-in">Sign in to start</Link>}<Link className="btn secondary" href="/orders">My orders</Link></div>
      </section>

      {msg && <div className="alert success">{msg}</div>}

      <section className="quick-section">
        <div className="section-heading"><div><span className="eyebrow">QUICK ACTIONS</span><h2>What do you want to sell?</h2></div><span className="trust-badge">● Live reseller services</span></div>
        <div className="quick-grid">{quickActions.map(([type, label, description]) => <button key={type} className="quick-card" onClick={() => openService(type)}><span className="quick-icon">{type === "data" ? "⌁" : type === "airtime" ? "⌁" : type === "tv" ? "▣" : type === "electricity" ? "ϟ" : "▤"}</span><b>{label}</b><small>{description}</small></button>)}</div>
      </section>

      <section className="live-strip"><div><span className="live-dot">●</span><b>Recent live transactions</b></div><span>Powered by automated fulfillment</span></section>

      {Array.from(groups.entries()).map(([cat, rows]) => <section id={`service-${cat}`} key={cat}><div className="section-heading"><h2>{cat.replaceAll("_", " ")}</h2><span>{rows.length} service{rows.length === 1 ? "" : "s"}</span></div><div className="grid">{rows.map(p => <article className="card" key={p.id}><span className="badge">{p.serviceType || p.category || "Digital"}</span><h2>{p.name}</h2><p>{p.description}</p><div className="price">₦{(p.priceKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</div><button className="btn" disabled={!user} onClick={() => { setSelected(p); setAmount(String(p.priceKobo / 100)); setDetails(""); setPhone(""); }}>{user ? "Buy now" : "Sign in to buy"}</button></article>)}</div></section>)}

      {selected && <div className="modal-backdrop"><div className="card purchase-modal"><p className="eyebrow">CONFIRM SERVICE</p><h2>{selected.name}</h2>{["airtime", "data"].includes(selected.serviceType || "") && <input placeholder="08012345678" value={phone} onChange={e => setPhone(e.target.value)} />}{["airtime", "electricity"].includes(selected.serviceType || "") && <input type="number" placeholder="Amount NGN" value={amount} onChange={e => setAmount(e.target.value)} />}{selected.serviceType === "electricity" && <input placeholder="Meter|prepaid" value={details} onChange={e => setDetails(e.target.value)} />}{selected.serviceType === "tv" && <input placeholder="Smartcard|renew" value={details} onChange={e => setDetails(e.target.value)} />}{["social_boost", "bulk_sms", "bulksms", "sms"].includes(selected.serviceType || "") && <input placeholder={selected.serviceType === "social_boost" ? "Target URL" : "Sender|Recipients|Message"} value={details} onChange={e => setDetails(e.target.value)} />}{["education", "print_card"].includes(selected.serviceType || "") && <input type="number" min="1" placeholder="Quantity" value={details} onChange={e => setDetails(e.target.value)} />}<div className="row"><button className="btn" disabled={busy} onClick={buy}>{busy ? "Processing…" : "Confirm purchase"}</button><button className="btn secondary" onClick={() => setSelected(null)}>Cancel</button></div></div></div>}
    </main>
  );
}

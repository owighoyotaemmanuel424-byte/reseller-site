"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "overview" | "users" | "wallets" | "catalog" | "orders" | "payments" | "audit";
const money = (n: unknown) => "₦" + (Number(n || 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });

export default function Admin() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<any>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(nextTab: Tab = tab) {
    setLoading(true); setMessage("");
    if (nextTab === "catalog") { setData({}); setLoading(false); return; }
    try {
      const response = await fetch({overview:"/api/admin/stats",users:"/api/admin/users",wallets:"/api/admin/wallets",orders:"/api/admin/orders",payments:"/api/admin/payments",audit:"/api/admin/audit"}[nextTab], { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { router.replace("/admin-login"); return; }
      if (!response.ok) throw new Error(body.error || "Request failed");
      setData(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load admin data"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(tab); }, [tab]);

  async function sync() {
    setMessage("Syncing JejeLaye services…");
    const response = await fetch("/api/admin/sync", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Synced ${body.synced ?? 0} services` : body.error || "Sync failed");
  }

  const tabs: [Tab, string][] = [["overview","Overview"],["users","Users"],["wallets","Wallets"],["catalog","Catalog"],["orders","Orders"],["payments","Payments"],["audit","Audit logs"]];
  const rows = Array.isArray(data) ? data : [];

  return <section className="hero">
    <p className="badge">MultiKartX Admin</p><h1>Control center</h1>
    <p>Users, wallets, JejeLaye products, orders, Paystack activity and audit history.</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"24px 0"}}>{tabs.map(([id,label]) => <button key={id} className={tab===id?"btn":"btn secondary"} onClick={() => setTab(id)}>{label}</button>)}</div>
    {message && <div className="alert">{message}</div>}
    {loading && <div className="card">Loading…</div>}
    {!loading && tab === "overview" && <div className="grid">{[["Users",data.users],["Orders",data.orders],["Active products",data.activeProducts],["Sales",money(data.salesKobo)],["Funding",money(data.fundingKobo)]].map(([label,value]) => <article className="card" key={String(label)}><b>{label}</b><h2>{value ?? "—"}</h2></article>)}</div>}
    {!loading && tab === "users" && <div className="card"><h2>Users</h2><table><thead><tr><th>Email</th><th>Role</th><th>Wallet</th><th>Action</th></tr></thead><tbody>{rows.map(u=><tr key={u.id}><td>{u.email}</td><td>{u.role}</td><td>{money(u.balanceKobo)}</td><td><button className="btn secondary">{u.role === "admin" ? "Admin" : "Manage"}</button></td></tr>)}</tbody></table></div>}
    {!loading && tab === "wallets" && <div className="card"><h2>Wallets</h2><table><thead><tr><th>Email</th><th>Balance</th><th>Updated</th></tr></thead><tbody>{rows.map(w=><tr key={w.id}><td>{w.email}</td><td>{money(w.balanceKobo)}</td><td>{w.updatedAt ? new Date(w.updatedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>}
    {!loading && tab === "catalog" && <div className="card"><h2>JejeLaye catalog</h2><p>Pull current provider services into the Neon product catalog.</p><button className="btn" onClick={sync}>Sync services</button></div>}
    {!loading && tab === "orders" && <div className="card"><h2>Orders</h2><table><thead><tr><th>Customer</th><th>Product</th><th>Total</th><th>Status</th></tr></thead><tbody>{rows.map(o=><tr key={o.id}><td>{o.email}</td><td>{o.productName}</td><td>{money(o.totalKobo)}</td><td>{o.status}</td></tr>)}</tbody></table></div>}
    {!loading && tab === "payments" && <div className="card"><h2>Paystack funding</h2><table><thead><tr><th>Customer</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(data.funding||[]).map((p:any)=><tr key={p.id}><td>{p.email}</td><td>{p.reference}</td><td>{money(p.amountKobo)}</td><td>{p.status}</td></tr>)}</tbody></table><h2>Webhook events</h2><table><tbody>{(data.webhooks||[]).map((w:any)=><tr key={w.id}><td>{w.eventType}</td><td>{w.reference}</td><td>{new Date(w.processedAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
    {!loading && tab === "audit" && <div className="card"><h2>Admin audit log</h2><table><thead><tr><th>Admin</th><th>Action</th><th>Target</th><th>Time</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td>{a.adminEmail}</td><td>{a.action}</td><td>{a.targetType||""} {a.targetId||""}</td><td>{new Date(a.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
  </section>;
}

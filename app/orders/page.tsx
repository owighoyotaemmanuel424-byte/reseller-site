"use client";

import { useCallback, useEffect, useState } from "react";

type Order = {
  id: string;
  productName: string;
  qty: number;
  totalKobo: number;
  status: string;
  providerOrderId?: string | null;
  createdAt: string;
  productDetails?: unknown;
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/orders", { cache: "no-store" });
    if (response.status === 401) {
      location.href = "/sign-in";
      return;
    }
    if (!response.ok) {
      setMessage("Unable to load orders");
      return;
    }
    setOrders(await response.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const pending = orders.filter((order) => order.status === "processing" && order.providerOrderId);
    if (!pending.length) return;
    const timer = window.setInterval(async () => {
      for (const order of pending) {
        try {
          await fetch(`/api/orders/${encodeURIComponent(order.id)}/status`, { cache: "no-store" });
        } catch {
          // The next polling cycle will retry without interrupting the page.
        }
      }
      await load();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [orders, load]);

  async function checkStatus(id: string) {
    setChecking(id);
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}/status`, { cache: "no-store" });
      const data = await response.json();
      setMessage(response.ok ? `Order status: ${data.status}` : data.error || "Status check failed");
      await load();
    } catch {
      setMessage("Status check failed");
    } finally {
      setChecking(null);
    }
  }

  async function report(id: string) {
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: id, reason: "Customer reported an issue" }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Order reported" : data.error);
    await load();
  }

  return (
    <>
      <h1>My Orders</h1>
      <p>Track purchases and retrieve provider references and delivered details.</p>
      {message && <div className="alert">{message}</div>}
      <div className="card">
        {orders.length === 0 && <p>No orders yet.</p>}
        {orders.map((order) => (
          <div key={order.id} style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
            <div>
              <b>{order.productName}</b> — ₦{(Number(order.totalKobo) / 100).toLocaleString("en-NG")} — {order.status}
            </div>
            {order.providerOrderId && (
              <small>Provider reference: {order.providerOrderId}</small>
            )}
            {order.status === "processing" && order.providerOrderId && (
              <div style={{ marginTop: 8 }}>
                <button className="btn secondary" onClick={() => checkStatus(order.id)} disabled={checking === order.id}>
                  {checking === order.id ? "Checking…" : "Check status"}
                </button>
              </div>
            )}
            {order.status === "completed" && (
              <div style={{ marginTop: 8 }}>
                <button className="btn secondary" onClick={() => report(order.id)}>Report</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

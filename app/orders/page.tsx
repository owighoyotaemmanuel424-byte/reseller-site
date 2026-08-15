"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

type OrderRow = {
  _id: string;
  productName: string;
  qty: number;
  totalKobo: number;
  status: string;
};

const money = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export default function OrdersPage() {
  const auth = useAuth();
  const orders = (useQuery(api.orders.list) ?? []) as OrderRow[];
  const report = useMutation(api.orders.report);
  const [message, setMessage] = useState("");

  async function doReport(id: string) {
    try {
      await report({ orderId: id as never, reason: "Customer reported an issue" });
      setMessage("Order reported for review.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to report order");
    }
  }

  if (!auth?.user) {
    return (
      <div className="card">
        <h1>Orders</h1>
        <p className="muted">Sign in to see your orders.</p>
        <Link href="/sign-in"><button className="btn">Sign in</button></Link>
      </div>
    );
  }

  return (
    <>
      <h1>My Orders</h1>
      {message && <div className="alert success">{message}</div>}
      {orders.length === 0 ? (
        <div className="card empty">
          No orders yet. <Link href="/">Browse the store.</Link>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Total</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {orders.map((o: OrderRow) => (
                <tr key={o._id}>
                  <td>{o.productName}</td>
                  <td>{o.qty}</td>
                  <td>{money(o.totalKobo)}</td>
                  <td><span className="badge">{o.status}</span></td>
                  <td>
                    {o.status === "completed" ? (
                      <button className="btn secondary" onClick={() => doReport(o._id)}>Report</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

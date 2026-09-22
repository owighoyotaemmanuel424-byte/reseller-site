"use client";

import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useState } from "react";

type ProductRow = {
  _id: string;
  category?: string;
  serviceType?: string;
  name: string;
  description?: string;
  priceKobo: number;
  minAmountKobo?: number;
  maxAmountKobo?: number;
};

const money = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export default function Home() {
  const { isAuthenticated } = useConvexAuth();
  const products = (useQuery(api.products.list) ?? []) as ProductRow[];
  const createOrder = useMutation(api.provider.placeOrder);
  const ensureWallet = useMutation(api.wallets.ensure);

  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const type = selected?.serviceType || selected?.category || "digital";

  const grouped = useMemo(() => {
    const map = new Map<string, ProductRow[]>();
    for (const product of products) {
      const key = product.serviceType || product.category || "digital";
      map.set(key, [...(map.get(key) ?? []), product]);
    }
    return map;
  }, [products]);

  function open(product: ProductRow) {
    setSelected(product);
    setPhone("");
    setAmount(product.priceKobo ? String(product.priceKobo / 100) : "");
    setDetails("");
    setMessage("");
  }

  async function buy() {
    if (!selected || !isAuthenticated) return;
    setBusy(true);
    setMessage("");
    try {
      await ensureWallet({});
      const payload: Record<string, unknown> = {};

      if (type === "airtime") {
        if (!phone || !amount) throw new Error("Enter the recipient number and airtime amount.");
        payload.amount = Number(amount);
        payload.mobile_number = phone.trim();
        payload.Ported_number = false;
        payload.airtime_type = "VTU";
      } else if (type === "data") {
        if (!phone) throw new Error("Enter the recipient phone number.");
        payload.mobile_number = phone.trim();
        payload.Ported_number = false;
      } else if (type === "electricity") {
        const [meter, variation] = details.split("|");
        if (!meter || !amount || !variation) throw new Error("Enter meter number, amount, and prepaid/postpaid.");
        payload.amount = Number(amount);
        payload.billersCode = meter.trim();
        payload.variation_code = variation;
      } else if (type === "tv") {
        const [smartcard, subscription] = details.split("|");
        if (!smartcard || !subscription) throw new Error("Enter smartcard number and subscription type.");
        payload.billersCode = smartcard.trim();
        payload.subscription_type = subscription;
      } else if (type === "education") {
        payload.quantity = Number(details || "1");
      } else if (type === "print_card") {
        payload.quantity = Number(details || "1");
      } else if (type === "social_boost") {
        if (!details) throw new Error("Enter the target link.");
        payload.link = details.trim();
        payload.quantity = 1;
      } else if (type === "bulk_sms" || type === "bulksms" || type === "sms") {
        const [sender, recipient, message] = details.split("|");
        if (!sender || !recipient || !message) throw new Error("Use Sender|Recipients|Message.");
        payload.sender = sender.trim();
        payload.recipient = recipient.trim();
        payload.message = message.trim();
      } else {
        payload.quantity = 1;
      }

      const result = await createOrder({
        productId: selected._id as never,
        qty: 1,
        purchaseData: JSON.stringify(payload),
      });

      setMessage(result.status === "processing"
        ? "Purchase accepted and is processing. Check Orders for the final status."
        : result.message || "Purchase completed.");
      setSelected(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Purchase failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <p className="badge">MultiKartX • JejeLaye powered</p>
        <h1>Buy airtime, data and digital services from one wallet.</h1>
        <p>Live service catalog, wallet accounting and server-side JejeLaye fulfillment.</p>
        <div className="row" style={{ justifyContent: "flex-start", marginTop: 22 }}>
          {isAuthenticated ? <Link className="btn" href="/wallet">Open wallet</Link> : <Link className="btn" href="/sign-in">Sign in to start</Link>}
          <Link className="btn secondary" href="/orders">View orders</Link>
        </div>
      </section>

      {message && <div className="alert success">{message}</div>}

      {Array.from(grouped.entries()).map(([category, rows]) => (
        <section key={category} style={{ marginBottom: 30 }}>
          <h2 style={{ textTransform: "capitalize" }}>{category.replaceAll("_", " ")}</h2>
          <div className="grid">
            {rows.map((p) => (
              <article className="card" key={p._id}>
                <span className="badge">{p.serviceType || p.category || "Digital"}</span>
                <h2>{p.name}</h2>
                <p>{p.description}</p>
                <div className="price">{money(p.priceKobo)}</div>
                <button className="btn" disabled={!isAuthenticated} onClick={() => open(p)}>
                  Buy now
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}

      {selected && (
        <div className="card" style={{ position: "fixed", inset: "10% 5%", zIndex: 20, overflow: "auto" }}>
          <h2>{selected.name}</h2>
          <p>Service: {type}</p>

          {(type === "airtime" || type === "data") && (
            <input placeholder="08012345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
          )}

          {(type === "airtime" || type === "electricity") && (
            <input type="number" placeholder="Amount in NGN" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}

          {type === "electricity" && (
            <input placeholder="Meter|prepaid or Meter|postpaid" value={details} onChange={(e) => setDetails(e.target.value)} />
          )}

          {type === "tv" && (
            <input placeholder="Smartcard|renew" value={details} onChange={(e) => setDetails(e.target.value)} />
          )}

          {type === "education" && (
            <input type="number" min="1" placeholder="Quantity" value={details} onChange={(e) => setDetails(e.target.value)} />
          )}

          {type === "print_card" && (
            <input type="number" min="1" placeholder="Quantity" value={details} onChange={(e) => setDetails(e.target.value)} />
          )}

          {type === "social_boost" && (
            <input placeholder="Target URL" value={details} onChange={(e) => setDetails(e.target.value)} />
          )}

          {(type === "bulk_sms" || type === "bulksms" || type === "sms") && (
            <input placeholder="Sender|Recipients|Message" value={details} onChange={(e) => setDetails(e.target.value)} />
          )}

          <div className="row" style={{ justifyContent: "flex-start", marginTop: 18 }}>
            <button className="btn" disabled={busy} onClick={buy}>{busy ? "Processing…" : "Confirm purchase"}</button>
            <button className="btn secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

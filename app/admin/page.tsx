"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export default function AdminPage() {
  const sync = useAction(api.provider.syncProducts);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function runSync() {
    setBusy(true);
    setMessage("");
    try {
      const count = await sync({});
      setMessage(`Synced ${count} active JejeLaye services.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Catalog sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="badge">Admin</p>
        <h1>JejeLaye catalog</h1>
        <p>Synchronize the current provider service catalog into MultiKartX. Admin authorization is enforced server-side.</p>
        <button className="btn" onClick={runSync} disabled={busy}>
          {busy ? "Syncing…" : "Sync services"}
        </button>
        {message && <div className="alert success" style={{ marginTop: 16 }}>{message}</div>}
      </section>
    </main>
  );
}

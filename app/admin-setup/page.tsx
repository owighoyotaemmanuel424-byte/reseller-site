"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminSetup() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ secret, email: email.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Unable to create the administrator");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setMessage("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero" style={{ maxWidth: 560, margin: "48px auto" }}>
      <div className="card">
        <p className="badge">MultiKartX • First-time setup</p>
        <h1>Create administrator</h1>
        <p>Use the server-side bootstrap secret to create the first administrator.</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 24 }}>
          <label>Bootstrap secret<input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} minLength={32} required /></label>
          <label>Admin email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Admin password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required /></label>
          <button className="btn" disabled={busy} type="submit">{busy ? "Creating administrator…" : "Create administrator"}</button>
        </form>
        {message && <p role="alert" style={{ marginTop: 16 }}>{message}</p>}
        <p style={{ marginTop: 20 }}>Already configured? <a href="/admin-login">Go to admin login</a>.</p>
      </div>
    </main>
  );
}

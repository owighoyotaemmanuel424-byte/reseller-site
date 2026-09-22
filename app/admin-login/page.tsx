"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Invalid admin credentials");
        return;
      }
      if (data.user?.role !== "admin") {
        await fetch("/api/auth/login", { method: "DELETE", credentials: "include" }).catch(() => {});
        setMessage("This account does not have administrator access.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setMessage("Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero" style={{ maxWidth: 520, margin: "48px auto" }}>
      <div className="card">
        <p className="badge">MultiKartX • Secure Administration</p>
        <h1>Admin Login</h1>
        <p>Sign in with your authorized administrator account.</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 24 }}>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="btn" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in securely"}</button>
        </form>
        {message && <p role="alert" style={{ marginTop: 16 }}>{message}</p>}
      </div>
    </main>
  );
}

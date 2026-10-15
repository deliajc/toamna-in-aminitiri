"use client";

import { useState } from "react";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) return window.location.reload();
      setError((await res.json().catch(() => ({}))).error || "Autentificare eșuată.");
    } catch {
      setError("Conexiunea a eșuat.");
    }
    setBusy(false);
  };

  return (
    <main className="adm-login">
      <form onSubmit={submit} className="adm-login-card">
        <p className="adm-kicker">Administrare</p>
        <h1>Toamna în amintiri</h1>
        <label htmlFor="pw">Parola organizatorilor</label>
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        {error && <p className="adm-error">{error}</p>}
        <button className="adm-btn primary" disabled={busy || !password}>
          {busy ? "Se verifică…" : "Intră"}
        </button>
      </form>
    </main>
  );
}

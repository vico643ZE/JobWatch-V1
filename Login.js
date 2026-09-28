"use client";
import { useState } from "react";
export default function Login({ configured }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: new FormData(e.currentTarget).get("password"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      location.reload();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <main className="loginPage">
      <div className="loginCard">
        <div className="eyebrow">JOBWATCH · ESPACE PERSONNEL</div>
        <h1>
          Votre prochain
          <br />
          chapitre.
        </h1>
        <p>Des opportunités ciblées. Des candidatures organisées.</p>
        {configured ? (
          <form onSubmit={submit}>
            <label>
              Mot de passe
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Connexion…" : "Ouvrir mon espace →"}
            </button>
          </form>
        ) : (
          <div className="notice">
            La V2 est installée. La connexion à la base et les variables de
            sécurité doivent être configurées dans Render avant la première
            utilisation.
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p className="muted">Accès privé · JobWatch V2</p>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Fingerprint } from "lucide-react";
import Brand from "./Brand";
import { api } from "./shared";
export default function AccountAccess() {
  const [token, setToken] = useState(""),
    [purpose, setPurpose] = useState("reset"),
    [message, setMessage] = useState(""),
    [ok, done] = useState(false),
    [busy, spin] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.hash.slice(1));
    setToken(q.get("token") || "");
    setPurpose(q.get("purpose") === "verify" ? "verify" : "reset");
    history.replaceState(null, "", location.pathname);
  }, []);
  return (
    <main className="auth-page">
      <Link href="/">
        <Brand />
      </Link>
      <form
        className="auth-box panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage("");
          spin(true);
          const fields = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const r = await api(token ? "auth/confirm" : "auth/request-link", {
              ...fields,
              purpose,
              token,
            });
            setMessage(r.message || "Account updated. You can now sign in.");
            done(true);
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            spin(false);
          }
        }}
      >
        <div className="auth-icon">
          <Fingerprint />
        </div>
        <h1>
          {token
            ? purpose === "verify"
              ? "Verify your email"
              : "Choose a password"
            : "Account access"}
        </h1>
        {!token ? (
          <>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Send a link to
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                <option value="reset">Reset my password</option>
                <option value="verify">Verify my email</option>
              </select>
            </label>
          </>
        ) : purpose === "reset" ? (
          <>
            <label>
              New password
              <input
                type="password"
                name="password"
                minLength={12}
                maxLength={160}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Authenticator code (if enabled)
              <input name="code" inputMode="numeric" maxLength={6} />
            </label>
          </>
        ) : (
          <p>Confirm this address belongs to your S.C.A.R.L.E.T. account.</p>
        )}
        {!ok && (
          <button className="primary" disabled={busy}>
            {token ? "Confirm" : "Send account link"}
          </button>
        )}
        <p role="status">{message}</p>
        <Link href="/login">Return to sign in</Link>
      </form>
    </main>
  );
}

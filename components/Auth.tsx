"use client";
import { useState } from "react";
import Link from "next/link";
import { Fingerprint, LoaderCircle } from "lucide-react";
import Brand from "./Brand";
import { api } from "./shared";
export default function Auth({ register = false }: { register?: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, err] = useState("");
  return (
    <main className="auth-page">
      <Link href="/">
        <Brand />
      </Link>
      <form
        className="auth-box panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget));
          setBusy(true);
          err("");
          try {
            const r = await api("auth/" + (register ? "register" : "login"), d);
            if (r.needsVerification) {
              err(
                "Check your inbox for the email verification link, then sign in.",
              );
              return;
            }
            location.assign(register ? "/onboarding" : "/dashboard");
          } catch (x) {
            err((x as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="auth-icon">
          <Fingerprint />
        </div>
        <div className="eyebrow">WORKSPACE ACCESS</div>
        <h1>{register ? "Create an account" : "Welcome back"}</h1>
        <p>
          {register
            ? "Set up your private S.C.A.R.L.E.T. workspace."
            : "Sign in to your command center."}
        </p>
        {register && (
          <label>
            Display name
            <input autoComplete="name" name="name" required maxLength={70} />
          </label>
        )}
        <label>
          Email address
          <input type="email" autoComplete="email" name="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            name="password"
            minLength={register ? 12 : 1}
            required
          />
          {register && <small>Use at least 12 characters.</small>}
        </label>
        {!register && (
          <label>
            Authenticator code <small>(if enabled)</small>
            <input
              name="code"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error-msg">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy && <LoaderCircle size={16} />}
          {register ? "Create account" : "Sign in"}
        </button>
        <Link href={register ? "/login" : "/register"}>
          {register ? "Already have an account? Sign in" : "Create an account"}
        </Link>
        {!register && (
          <Link href="/account-access">
            Password reset or email verification
          </Link>
        )}
      </form>
    </main>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Download,
  Fingerprint,
  KeyRound,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { PanelHead } from "./Dashboard";
export default function Settings({
  u,
  act,
}: {
  u: any;
  act: (p: string, b: any) => Promise<any>;
}) {
  const [secret, setSecret] = useState(""),
    [pass, setPass] = useState(""),
    [code, setCode] = useState(""),
    [style, changeStyle] = useState(
      [
        "Friendly",
        "Concise",
        "Professional",
        "Technical",
        "Executive assistant",
      ].includes(u.settings.style)
        ? u.settings.style
        : u.settings.style
          ? "Custom"
          : "Professional",
    ),
    [saved, setSaved] = useState("");
  const perform = async (path: string) => {
    try {
      const r = await act(path, { password: pass, code });
      if (r.secret) setSecret(r.secret);
      else {
        setSecret("");
        setPass("");
        setCode("");
        setSaved("Account security updated.");
      }
      if (path === "account/delete") location.assign("/");
    } catch {}
  };
  return (
    <div className="settings-grid">
      <section className="panel">
        <PanelHead icon={Settings2} title="Preferences" />
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            try {
              await act("settings", {
                name: fd.get("name"),
                style: style === "Custom" ? fd.get("custom") : style,
                language: fd.get("language"),
                memory: fd.has("memory"),
                retention: Number(fd.get("retention")),
              });
              setSaved("Preferences saved.");
            } catch {}
          }}
        >
          <label>
            Display name
            <input name="name" defaultValue={u.name} required maxLength={70} />
          </label>
          <label>
            Communication style
            <select value={style} onChange={(e) => changeStyle(e.target.value)}>
              {[
                "Professional",
                "Friendly",
                "Concise",
                "Technical",
                "Executive assistant",
                "Custom",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {style === "Custom" && (
            <label>
              Custom instructions
              <input
                name="custom"
                maxLength={200}
                defaultValue={u.settings.style}
                required
              />
            </label>
          )}
          <label>
            Preferred response language
            <input
              name="language"
              defaultValue={u.settings.language || "Match my message"}
              maxLength={30}
              required
            />
          </label>
          <label className="check-line">
            <input
              type="checkbox"
              name="memory"
              defaultChecked={u.settings.memory !== false}
            />
            Enable personalized memory
          </label>
          <label>
            New memory retention
            <select name="retention" defaultValue={u.settings.retention || 0}>
              <option value={0}>Until I delete it</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={365}>1 year</option>
            </select>
          </label>
          <button className="primary">
            <Save size={16} />
            Save preferences
          </button>
          <span role="status">{saved}</span>
        </form>
      </section>
      <section className="panel">
        <PanelHead icon={Fingerprint} title="Account security" />
        <div className="stack-form">
          <p className="muted">
            {u.guest
              ? "This local preview workspace expires after 24 hours. Create an account to retain it."
              : u.email}
          </p>
          {u.guest ? (
            <Link href="/register" className="button subtle">
              Create account
            </Link>
          ) : (
            <>
              <label>
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                />
              </label>
              {(secret || u.mfa) && (
                <label>
                  Authenticator code
                  <input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                  />
                </label>
              )}
              {secret && (
                <div className="notice">
                  <b>Authenticator setup key</b>
                  <code>{secret}</code>
                  <p>
                    Enter this key in your authenticator app, then enter the
                    current code.
                  </p>
                </div>
              )}
              <button
                disabled={!pass}
                onClick={() =>
                  perform(
                    u.mfa ? "mfa/disable" : secret ? "mfa/enable" : "mfa/start",
                  )
                }
              >
                <KeyRound size={16} />
                {u.mfa
                  ? "Disable two-factor authentication"
                  : secret
                    ? "Verify and enable"
                    : "Set up two-factor authentication"}
              </button>
              <button
                className="danger"
                disabled={!pass}
                onClick={() => {
                  if (
                    confirm(
                      "Permanently delete this account, its files, and its workspace history?",
                    )
                  )
                    void perform("account/delete");
                }}
              >
                <Trash2 size={15} />
                Delete account
              </button>
            </>
          )}
          <hr />
          <a href="/api/export" className="button subtle" download>
            <Download size={16} />
            Export workspace data
          </a>
        </div>
      </section>
    </div>
  );
}

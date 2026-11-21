"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Command,
  LogOut,
  Menu,
  Search,
  Settings2,
  Terminal,
  X,
} from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import Auth from "./Auth";
import Brand from "./Brand";
import { nav, admin } from "./nav";
import { api, stamp } from "./shared";
import Dashboard from "./Dashboard";
import Chat from "./Chat";
import Settings from "./Settings";
import VoiceConsole from "./VoiceConsole";
import WorkspacePanels from "./WorkspacePanels";
import ConnectorPanels from "./ConnectorPanels";
import CoreVisual from "./CoreVisual";
const descriptions: Record<string, string> = {
  onboarding: "Personalize your assistant.",
};
export default function Shell({ page }: { page: string }) {
  return ["login", "register"].includes(page) ? (
    <Auth register={page === "register"} />
  ) : (
    <Workspace page={page} />
  );
}
let boot: Promise<any> | null = null;
async function openWorkspace() {
  try {
    return await api("state");
  } catch (e) {
    if ((e as any).status !== 401) throw e;
  }
  const conf = await api("config");
  if (!conf.guest) {
    location.assign("/login");
    return;
  }
  await api("auth/guest", {});
  return api("state");
}
function Workspace({ page }: { page: string }) {
  const router = useRouter(),
    [data, setData] = useState<any>(null),
    [error, err] = useState(""),
    [toast, notify] = useState(""),
    [mobile, menu] = useState(false),
    [palette, showPalette] = useState(false),
    [search, filter] = useState(""),
    [alerts, bell] = useState(false),
    [now, clock] = useState<Date | null>(null),
    [offline, network] = useState(false),
    [stats, setStats] = useState<any>(null);
  const cid = useRef<string | undefined>(undefined);
  const refresh = useCallback(async () => {
    const d = await api("state");
    setData(d);
  }, []);
  useEffect(() => {
    let active = true;
    const p = (boot ??= openWorkspace());
    p.then((d) => {
      if (active) setData(d);
    })
      .catch((e) => {
        if (active) err(e.message);
      })
      .finally(() => {
        if (boot === p) boot = null;
      });
    return () => {
      active = false;
    };
  }, []);
  const uid = data?.user.id;
  useEffect(() => {
    if (!uid) return;
    const s = new EventSource("/api/stream");
    s.addEventListener("workspace", () => {
      refresh().catch(() => {});
    });
    const backup = setInterval(() => {
      refresh().catch(() => {});
    }, 30000);
    return () => {
      s.close();
      clearInterval(backup);
    };
  }, [uid, refresh]);
  useEffect(() => {
    const on = () => network(!navigator.onLine);
    on();
    clock(new Date());
    const t = setInterval(() => clock(new Date()), 1000);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        showPalette((v) => !v);
      }
      if (e.key === "Escape") {
        menu(false);
        showPalette(false);
        bell(false);
      }
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => notify(""), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (page === "admin" && uid)
      api("admin")
        .then(setStats)
        .catch((e) => err(e.message));
  }, [page, uid]);
  const act = useCallback(
    async (path: string, payload: any = {}) => {
      try {
        const r = await api(path, payload);
        if (!["account/delete", "auth/logout"].includes(path)) await refresh();
        return r;
      } catch (e) {
        notify((e as Error).message);
        throw e;
      }
    },
    [refresh],
  );
  const command = async (text: string) => {
    try {
      const r = await act("command", { text, conversationId: cid.current });
      cid.current = r.conversationId;
      return r.text;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const item =
    nav.find((i) => i.id === page) ||
    (page === "admin"
      ? admin
      : { label: "Initialize workspace", desc: descriptions[page] });
  if (!data)
    return (
      <main className="loading-view">
        <Brand />
        <div className="boot-line" />
        <p role="status">{error || "S.C.A.R.L.E.T. SYSTEM INITIALIZING"}</p>
        {error && (
          <button onClick={() => location.reload()}>Retry connection</button>
        )}
      </main>
    );
  const u = data.user,
    noticeCount = data.notifications.length,
    allNav = u.role === "ADMIN" ? [...nav, { ...admin, group: "SYSTEM" }] : nav;
  const navlinks = allNav.filter((i) =>
    i.label.toLowerCase().includes(search.toLowerCase()),
  );
  if (page === "onboarding")
    return (
      <main className="onboard">
        <div className="onboard-core">
          <CoreVisual />
        </div>
        <div className="eyebrow">
          <i />
          S.C.A.R.L.E.T. SYSTEM INITIALIZING
        </div>
        <h1>Welcome.</h1>
        <p>Your intelligent assistant is ready.</p>
        <p className="muted">
          Start with a local command. Connect a model for conversation, or
          enable your microphone from the voice interface.
        </p>
        <div className="land-actions">
          <button
            className="primary"
            onClick={async () => {
              await act("settings", { onboarded: true });
              router.push("/chat");
            }}
          >
            <Terminal size={16} />
            Start a conversation
          </button>
          <Link href="/integrations" className="button subtle">
            Connect a service
          </Link>
          <Link href="/dashboard">Open dashboard</Link>
        </div>
      </main>
    );
  return (
    <MotionConfig reducedMotion="user">
      <div className="os">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {mobile && (
          <button
            aria-label="Close navigation"
            className="mobile-shade"
            onClick={() => menu(false)}
          />
        )}
        <aside className={"sidebar " + (mobile ? "is-open" : "")}>
          <Link href="/" className="brand-home" aria-label="SCARLET home">
            <Brand />
          </Link>
          <div className="nav-scroll">
            {["WORKSPACE", "CHANNELS", "SYSTEM"].map((g) => (
              <div className="navgroup" key={g}>
                <div className="nav-heading">{g}</div>
                {allNav
                  .filter((i) => i.group === g)
                  .map(({ id, label, icon: I }) => (
                    <Link
                      className={"nav-link " + (id === page ? "selected" : "")}
                      aria-current={id === page ? "page" : undefined}
                      key={id}
                      href={"/" + id}
                      onClick={() => menu(false)}
                    >
                      <I size={17} />
                      {label}
                      {id === page && <span className="nav-active" />}
                    </Link>
                  ))}
              </div>
            ))}
          </div>
          <div className="side-bottom">
            <Link href="/settings" className="user-link">
              <span className="avatar">{u.name.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{u.name}</strong>
                <small>
                  {u.guest ? "Local workspace" : "Personal workspace"}
                </small>
              </span>
              <Settings2 size={16} />
            </Link>
          </div>
        </aside>
        <div className="work-area">
          <header className="topbar">
            <button
              aria-label="Open navigation"
              className="icon-btn mobile-menu"
              onClick={() => menu(true)}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              <span className="breadcrumb-icon">
                <Command size={15} />
              </span>
              <span>Workspace</span>
              <b>/</b>
              <strong>{item.label}</strong>
            </div>
            <div className="top-tools">
              <button
                className="search-trigger"
                onClick={() => {
                  filter("");
                  showPalette(true);
                }}
              >
                <Search size={14} />
                <span>Search workspace</span>
                <kbd>⌘ K</kbd>
              </button>
              <span className="top-divider" />
              <button
                className={
                  "icon-btn notice-toggle " + (noticeCount ? "has-unread" : "")
                }
                aria-label="Notifications"
                aria-expanded={alerts}
                onClick={() => bell(!alerts)}
              >
                <Bell size={18} />
              </button>
              <Link
                href="/settings"
                className="top-avatar"
                aria-label="Account settings"
              >
                {u.name[0].toUpperCase()}
              </Link>
            </div>
            {alerts && (
              <div className="notification-pop panel">
                <div className="panel-head">
                  <h2>Notifications</h2>
                  <button
                    aria-label="Close notifications"
                    className="icon-btn"
                    onClick={() => bell(false)}
                  >
                    <X size={15} />
                  </button>
                </div>
                {data.notifications.length ? (
                  data.notifications.slice(0, 5).map((n: any) => (
                    <p key={n.id}>
                      {n.body}
                      <small>{stamp(n.created_at)}</small>
                    </p>
                  ))
                ) : (
                  <p>Notifications appear here when a workflow completes.</p>
                )}
                <Link href="/activity">Open activity history</Link>
              </div>
            )}
          </header>
          <main className="workspace-content" id="main">
            {offline && (
              <div role="status" className="notice">
                Offline. Reconnect to update your workspace.
              </div>
            )}
            <div className="page-title">
              <div>
                <div className="eyebrow">
                  <span className="eyeline" />
                  {page === "dashboard"
                    ? "MISSION CONTROL"
                    : "WORKSPACE MODULE"}
                </div>
                <h1>{item.label}</h1>
                <p>{item.desc}</p>
              </div>
              <div className="sys-clock">
                <span className="online-chip">
                  <i />
                  SYSTEM ONLINE
                </span>
                <time suppressHydrationWarning>
                  {now
                    ? now
                        .toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                        .toUpperCase()
                    : "—"}
                  <b> / </b>
                  {now ? now.toLocaleTimeString("en-GB") : ""}
                </time>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="module"
            >
              {page === "dashboard" ? (
                <Dashboard data={data} onCommand={command} />
              ) : page === "chat" ? (
                <Chat data={data} act={act} />
              ) : page === "voice" ? (
                <VoiceConsole onCommand={command} />
              ) : page === "settings" ? (
                <>
                  <Settings u={u} act={act} />
                  <button
                    className="signout"
                    onClick={async () => {
                      await api("auth/logout", {});
                      location.assign("/login");
                    }}
                  >
                    <LogOut size={15} />
                    Sign out
                  </button>
                </>
              ) : page === "admin" ? (
                <div className="panel inset">
                  {error ||
                    (stats
                      ? stats.accounts +
                        " accounts · " +
                        stats.workflows +
                        " workflows"
                      : "Loading aggregate metrics…")}
                </div>
              ) : ["integrations", "email", "calendar", "whatsapp"].includes(
                  page,
                ) ? (
                <ConnectorPanels
                  page={page}
                  data={data}
                  act={act}
                  refresh={refresh}
                />
              ) : (
                <WorkspacePanels
                  page={page}
                  data={data}
                  act={act}
                  refresh={refresh}
                />
              )}
            </motion.div>
          </main>
        </div>
        {palette && (
          <div className="dialog-back" onClick={() => showPalette(false)}>
            <section
              className="palette panel"
              role="dialog"
              aria-modal="true"
              aria-label="Search workspace"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="palette-search">
                <Search size={19} />
                <input
                  autoFocus
                  aria-label="Find a module"
                  placeholder="Find a workspace module…"
                  value={search}
                  onChange={(e) => filter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && navlinks[0]) {
                      showPalette(false);
                      router.push("/" + navlinks[0].id);
                    }
                  }}
                />
                <button
                  className="icon-btn"
                  aria-label="Close search"
                  onClick={() => showPalette(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="palette-list">
                {navlinks.length ? (
                  navlinks.map((i) => (
                    <Link
                      key={i.id}
                      href={"/" + i.id}
                      onClick={() => showPalette(false)}
                    >
                      <i.icon size={16} />
                      {i.label}
                    </Link>
                  ))
                ) : (
                  <p className="muted inset">No matching modules.</p>
                )}
              </div>
            </section>
          </div>
        )}
        {toast && (
          <div className="toast" role="alert">
            {toast}
            <button
              className="icon-btn"
              aria-label="Dismiss notification"
              onClick={() => notify("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

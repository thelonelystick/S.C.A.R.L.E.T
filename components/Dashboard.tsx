"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AudioLines,
  Blocks,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  Expand,
  Globe2,
  Layers3,
  Mail,
  MessageCircle,
  MessagesSquare,
  Mic,
  Orbit,
  PlugZap,
  Radio,
  Send,
  ShieldCheck,
  Terminal,
  Workflow,
  X,
  Zap,
  FileText,
} from "lucide-react";
import CoreVisual from "./CoreVisual";
import { moment } from "./shared";
const feedIcons: Record<string, any> = {
  system: Terminal,
  security: ShieldCheck,
  calendar: CalendarDays,
  approval: ShieldCheck,
  chat: MessagesSquare,
  memory: BrainCircuit,
  completed: Check,
  task: Workflow,
  model: Orbit,
  integration: PlugZap,
  file: FileText,
  warning: Activity,
};
export const serviceArt: Record<string, any> = {
  model: Orbit,
  email: Mail,
  calendar: CalendarDays,
  whatsapp: MessageCircle,
  search: Globe2,
};
export function PanelHead({
  icon: Icon,
  title,
  right,
}: {
  icon: any;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="panel-head">
      <h2>
        <Icon aria-hidden="true" size={17} />
        {title}
      </h2>
      {right}
    </div>
  );
}
export default function Dashboard({
  data,
  onCommand,
}: {
  data: any;
  onCommand: (text: string) => Promise<string>;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [large, setLarge] = useState(false),
    [reply, setReply] = useState("");
  const pending = data.tasks.filter(
      (t: any) => t.state === "WAITING_FOR_APPROVAL",
    ),
    running = data.tasks.find((t: any) =>
      ["RUNNING", "PLANNING"].includes(t.state),
    );
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await onCommand(text);
      setReply(r);
      setText("");
    } finally {
      setBusy(false);
    }
  };
  const core = (
    <>
      <div className="core-surround">
        <div className="gridground" />
        <CoreVisual
          state={busy ? "thinking" : running ? "executing" : "idle"}
        />
        <div className="corner a" />
        <div className="corner b" />
        <div className="corner c" />
        <div className="corner d" />
        <span className="core-tag ct1">
          <i /> RENDER ACTIVE
        </span>
        <span className="core-tag ct2">3D / LOCAL</span>
        <div className="core-reading">
          <span className="signal-dot" />
          {busy
            ? "Processing command"
            : running
              ? "Executing workflow"
              : "Awaiting command"}
        </div>
      </div>
    </>
  );
  return (
    <>
      <div className="dash-main">
        <div className="main-stack">
          <section className="panel reactor">
            <PanelHead
              icon={Orbit}
              title="Neural core"
              right={
                <div className="head-controls">
                  <span className="tag red">INTERFACE ONLINE</span>
                  <button
                    className="icon-btn"
                    aria-label="Expand neural core"
                    onClick={() => setLarge(true)}
                  >
                    <Expand size={15} />
                  </button>
                </div>
              }
            />
            {core}
            <form className="command-input" onSubmit={send}>
              <Terminal size={21} />
              <input
                aria-label="Assistant command"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={6000}
                placeholder="Give S.C.A.R.L.E.T. a command…"
              />
              <Link aria-label="Open voice assistant" href="/voice">
                <Mic size={17} />
              </Link>
              <button aria-label="Send command" disabled={busy || !text.trim()}>
                <Send size={15} />
              </button>
            </form>
            {reply && (
              <div className="dash-reply" aria-live="polite">
                <p>{reply}</p>
                <Link href="/chat">Open conversation</Link>
                <button
                  aria-label="Dismiss response"
                  className="icon-btn"
                  onClick={() => setReply("")}
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </section>
          <section className="panel actions-panel">
            <PanelHead icon={Zap} title="Quick actions" />
            <div className="actions-grid">
              {[
                [MessagesSquare, "Start a chat", "chat", "crimson"],
                [AudioLines, "Voice session", "voice", "violet"],
                [Globe2, "Browse a site", "browser", "cyan"],
                [Workflow, "Run workflow", "automations", "amber"],
              ].map(([Ic, title, path, color]: any) => (
                <Link
                  key={path}
                  href={"/" + path}
                  className={"action-tile " + color}
                >
                  <span className="tile-icon">
                    <Ic size={21} />
                  </span>
                  <b>{title}</b>
                  <ChevronRight className="tile-chevron" size={13} />
                </Link>
              ))}
            </div>
          </section>
        </div>
        <aside className="intel-stack">
          <section className="panel intel">
            <PanelHead
              icon={Radio}
              title="Intelligence feed"
              right={
                <span className="live-label">
                  <i />
                  LIVE
                </span>
              }
            />
            <div className="feed-items">
              {data.activities.slice(0, 3).map((a: any) => {
                const I = feedIcons[a.kind] || CircleDot;
                return (
                  <div className="feed-item" key={a.id}>
                    <span
                      className={
                        "feed-icon " +
                        (a.kind === "security"
                          ? "cyan"
                          : a.kind === "warning"
                            ? "amber"
                            : "crimson")
                      }
                    >
                      <I size={16} />
                    </span>
                    <div>
                      <div className="feed-meta">
                        {a.kind.toUpperCase()}
                        <time>{moment(a.created_at)}</time>
                      </div>
                      <strong>{a.title}</strong>
                      {a.detail && <p>{a.detail}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <Link className="panel-link" href="/activity">
              Open activity history <ChevronRight size={14} />
            </Link>
          </section>
          <section className="panel execution">
            <PanelHead icon={Layers3} title="Execution status" />
            <div className="stat-line">
              <span>
                <i className="pip green" />
                Active workflows
              </span>
              <b>
                {data.tasks
                  .filter((t: any) => ["RUNNING", "PLANNING"].includes(t.state))
                  .length.toString()
                  .padStart(2, "0")}
              </b>
            </div>
            <div className="stat-line">
              <span>
                <i className="pip amber" />
                Pending approvals
              </span>
              <Link href="/automations">
                {String(pending.length).padStart(2, "0")}
              </Link>
            </div>
            <div className="stat-line">
              <span>
                <i className="pip violet" />
                Scheduled tasks
              </span>
              <Link href="/automations">
                {String(
                  data.tasks.filter((t: any) => t.state === "QUEUED").length,
                ).padStart(2, "0")}
              </Link>
            </div>
          </section>
        </aside>
      </div>
      <section className="panel services">
        <PanelHead
          icon={Blocks}
          title="Integration status"
          right={
            <Link href="/integrations" className="inline-link">
              Manage <ChevronRight size={14} />
            </Link>
          }
        />
        <div className="service-grid">
          {data.catalog.map((c: any) => {
            const I = serviceArt[c.id],
              connected = data.connections.some((x: any) => x.kind === c.id);
            return (
              <Link
                href={"/integrations#" + c.id}
                className="service"
                key={c.id}
              >
                <span className={"service-icon service-" + c.id}>
                  <I size={19} />
                </span>
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    <i className={"pip " + (connected ? "green" : "")} />
                    {connected ? "Connected" : "Disconnected"}
                  </small>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      <footer className="dash-footer">
        <span>
          <ShieldCheck size={13} /> Session isolated
        </span>
        <span>
          SCARLET OS <b>/</b> V1.0
        </span>
      </footer>
      {large && (
        <div className="dialog-back" onClick={() => setLarge(false)}>
          <section
            role="dialog"
            aria-label="Expanded neural core"
            aria-modal="true"
            className="core-modal panel"
            onClick={(e) => e.stopPropagation()}
          >
            <PanelHead
              icon={Orbit}
              title="Neural core"
              right={
                <button
                  className="icon-btn"
                  autoFocus
                  aria-label="Close expanded core"
                  onClick={() => setLarge(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setLarge(false);
                  }}
                >
                  <X />
                </button>
              }
            />
            {core}
          </section>
        </div>
      )}
    </>
  );
}

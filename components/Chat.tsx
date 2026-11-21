"use client";
import { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  Clock3,
  Command,
  MessagesSquare,
  Plus,
  Search,
  Send,
  SquareTerminal,
  Trash2,
  UserRound,
} from "lucide-react";
import { api } from "./shared";
import Sigil from "./Sigil";
import { PanelHead } from "./Dashboard";
export default function Chat({
  data,
  act,
}: {
  data: any;
  act: (p: string, b: any) => Promise<any>;
}) {
  const [cid, select] = useState(""),
    [messages, set] = useState<any[]>([]),
    [text, setText] = useState(""),
    [search, filter] = useState(""),
    [busy, wait] = useState(false),
    [error, err] = useState("");
  const bottom = useRef<HTMLDivElement>(null),
    manual = useRef(false);
  useEffect(() => {
    if (!manual.current && data.conversations.length) {
      select(data.conversations[0].id);
      manual.current = true;
    }
  }, [data.conversations]);
  useEffect(() => {
    let live = true;
    if (cid)
      api("chats/" + cid)
        .then((r) => {
          if (live) set(r);
        })
        .catch((e) => {
          if (live) err(e.message);
        });
    else set([]);
    return () => {
      live = false;
    };
  }, [cid]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);
  const [found, setFound] = useState<any[] | null>(null);
  useEffect(() => {
    const term = search.trim();
    let active = true;
    setFound(null);
    if (!term) return;
    const timeout = setTimeout(() => {
      api("chats/search?q=" + encodeURIComponent(term.slice(0, 120)))
        .then((r) => {
          if (active) setFound(r);
        })
        .catch((e) => {
          if (active) err(e.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [search]);
  const send = async (value = text) => {
    if (!value.trim() || busy) return;
    wait(true);
    err("");
    setText("");
    set((ms) => [...ms, { role: "user", body: value }]);
    try {
      const r = await act("command", {
        text: value,
        ...(cid ? { conversationId: cid } : {}),
      });
      manual.current = true;
      select(r.conversationId);
      set(await api("chats/" + r.conversationId));
    } catch (e) {
      err((e as Error).message);
      setText(value);
    } finally {
      wait(false);
    }
  };
  return (
    <div className="chat-layout">
      <section className="panel chat-panel">
        <PanelHead
          title="Conversation"
          icon={MessagesSquare}
          right={
            <span className="tag">
              {data.connections.some((c: any) => c.kind === "model")
                ? "MODEL CONNECTED"
                : "LOCAL COMMANDS"}
            </span>
          }
        />
        <div className="chat-body">
          {!messages.length ? (
            <div className="chat-empty">
              <div className="chat-mark">
                <Sigil size={43} />
              </div>
              <h2>How can I assist you?</h2>
              <p>Enter a command or start with one below.</p>
              <div className="chat-helpers">
                {[
                  [Command, "System status"],
                  [BrainCircuit, "Show my memories"],
                  [Clock3, "Remind me in 10 minutes to take a break"],
                ].map(([I, s]: any) => (
                  <button key={s} onClick={() => send(s)} disabled={busy}>
                    <I size={15} />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={m.id || i} className={"bubble " + m.role}>
                <span className="bubble-avatar">
                  {m.role === "user" ? (
                    <UserRound size={16} />
                  ) : (
                    <Sigil size={20} />
                  )}
                </span>
                <div>
                  <b>{m.role === "user" ? "You" : "S.C.A.R.L.E.T."}</b>
                  <p>{m.body}</p>
                </div>
              </div>
            ))
          )}
          {busy && (
            <p className="waiting" role="status">
              Processing command…
            </p>
          )}
          <div ref={bottom} />
        </div>
        {error && (
          <p className="error-msg" role="alert">
            {error}
          </p>
        )}
        <form
          className="command-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <SquareTerminal size={20} />
          <input
            aria-label="Message"
            maxLength={6000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message S.C.A.R.L.E.T.…"
          />
          <button disabled={busy || !text.trim()} aria-label="Send message">
            <Send size={16} />
          </button>
        </form>
      </section>
      <aside className="panel chat-history">
        <PanelHead
          title="History"
          icon={Clock3}
          right={
            <button
              className="icon-btn"
              aria-label="New conversation"
              onClick={() => {
                manual.current = true;
                select("");
                set([]);
              }}
            >
              <Plus size={16} />
            </button>
          }
        />
        <label className="search-label">
          <Search size={15} />
          <input
            aria-label="Search conversation history"
            placeholder="Find conversation"
            value={search}
            onChange={(e) => filter(e.target.value)}
          />
        </label>
        {(
          found ||
          data.conversations.filter((c: any) =>
            c.title.toLowerCase().includes(search.toLowerCase()),
          )
        ).map((c: any) => (
          <div className="hist-item" key={c.id}>
            <button
              aria-current={cid === c.id}
              onClick={() => {
                manual.current = true;
                select(c.id);
              }}
            >
              {c.title}
            </button>
            <button
              aria-label={"Delete conversation " + c.title}
              className="icon-btn"
              onClick={async () => {
                if (confirm("Delete this conversation and its messages?")) {
                  await act("delete", { kind: "conversation", id: c.id });
                  if (cid === c.id) select("");
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {cid && (
          <a href={"/api/report/chat/" + cid} download className="panel-link">
            Download conversation (.md)
          </a>
        )}
        {!data.conversations.length && (
          <p className="muted inset">Your conversations will appear here.</p>
        )}
      </aside>
    </div>
  );
}
